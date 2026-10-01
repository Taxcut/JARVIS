use serde::Deserialize;
use sha2::{Digest, Sha256};
use sherpa_onnx::{
    GenerationConfig, KeywordSpotter, KeywordSpotterConfig, OfflineTts, OfflineTtsConfig,
    OfflineTtsKokoroModelConfig, OfflineTtsModelConfig,
};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::{
    io::Read,
    path::{Path, PathBuf},
};
pub const WAKE_DIR: &str = "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01";
pub const TTS_DIR: &str = "kokoro-int8-multi-lang-v1_0";
pub fn model_root() -> Result<PathBuf, &'static str> {
    Ok(directories::BaseDirs::new()
        .ok_or("User storage is unavailable")?
        .data_local_dir()
        .join("com.taxcut.jarvis/voice/models"))
}
#[derive(Deserialize)]
struct Asset {
    path: String,
    sha256: String,
}
pub fn verify(root: &Path) -> Result<(), &'static str> {
    let manifest: Vec<Asset> = serde_json::from_str(include_str!("../models.json"))
        .map_err(|_| "Voice asset manifest is invalid")?;
    for asset in manifest {
        let p = root.join(asset.path);
        let mut cursor = p.as_path();
        while cursor.starts_with(root) {
            if std::fs::symlink_metadata(cursor)
                .map_err(|_| "Install the verified voice models")?
                .file_type()
                .is_symlink()
            {
                return Err("Voice models must not contain symbolic links");
            }
            cursor = cursor.parent().ok_or("Voice model path is invalid")?;
        }
        let mut f = std::fs::File::open(p).map_err(|_| "Install the verified voice models")?;
        let mut hash = Sha256::new();
        let mut buf = [0u8; 65536];
        loop {
            let n = f
                .read(&mut buf)
                .map_err(|_| "Voice model could not be read")?;
            if n == 0 {
                break;
            }
            hash.update(&buf[..n]);
        }
        if hex::encode(hash.finalize()) != asset.sha256 {
            return Err("Voice model integrity check failed. Reinstall the verified models.");
        }
    }
    Ok(())
}
fn path(root: &Path, name: &str) -> Option<String> {
    Some(root.join(name).to_string_lossy().into_owned())
}
pub fn wake_config(root: &Path, sensitivity: f32) -> KeywordSpotterConfig {
    let root = root.join(WAKE_DIR);
    let mut config = KeywordSpotterConfig::default();
    config.model_config.transducer.encoder =
        path(&root, "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx");
    config.model_config.transducer.decoder =
        path(&root, "decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx");
    config.model_config.transducer.joiner =
        path(&root, "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx");
    config.model_config.tokens = path(&root, "tokens.txt");
    config.model_config.num_threads = 1;
    config.model_config.provider = Some("cpu".into());
    config.keywords_threshold = 0.5 - sensitivity * 0.5;
    config.keywords_score = 1.5;
    config.keywords_buf = Some(include_str!("../keywords.txt").into());
    config
}
pub fn wake(root: &Path, sensitivity: f32) -> Result<KeywordSpotter, &'static str> {
    KeywordSpotter::create(&wake_config(root, sensitivity))
        .ok_or("Wake detector could not load its models")
}
pub trait VoiceEngine {
    fn synthesize(
        &self,
        text: &str,
        speed: f32,
        epoch: Arc<AtomicU64>,
        generation: u64,
    ) -> Result<Vec<f32>, &'static str>;
}
pub struct Kokoro {
    engine: OfflineTts,
}
impl Kokoro {
    pub fn load(root: &Path) -> Result<Self, &'static str> {
        Self::with_threads(root, if cfg!(target_os = "macos") { 4 } else { 2 })
    }
    /// Bounded benchmark/configuration boundary; no provider or voice substitution.
    pub fn with_threads(root: &Path, threads: i32) -> Result<Self, &'static str> {
        if !(1..=4).contains(&threads) {
            return Err("Invalid speech worker budget");
        }
        let root = root.join(TTS_DIR);
        let config = OfflineTtsConfig {
            model: OfflineTtsModelConfig {
                kokoro: OfflineTtsKokoroModelConfig {
                    model: path(&root, "model.int8.onnx"),
                    voices: path(&root, "voices.bin"),
                    tokens: path(&root, "tokens.txt"),
                    data_dir: path(&root, "espeak-ng-data"),
                    lexicon: path(&root, "lexicon-gb-en.txt"),
                    lang: None,
                    ..Default::default()
                },
                num_threads: threads,
                provider: Some("cpu".into()),
                ..Default::default()
            },
            max_num_sentences: 1,
            ..Default::default()
        };
        let engine = OfflineTts::create(&config).ok_or("Kokoro could not load its models")?;
        if engine.sample_rate() != 24000 || engine.num_speakers() != 54 {
            return Err("Kokoro model is incompatible with bm_george");
        }
        Ok(Self { engine })
    }
}
impl VoiceEngine for Kokoro {
    fn synthesize(
        &self,
        text: &str,
        speed: f32,
        epoch: Arc<AtomicU64>,
        generation: u64,
    ) -> Result<Vec<f32>, &'static str> {
        if text.len() > 1024 || text.contains('\0') || epoch.load(Ordering::SeqCst) != generation {
            return Err("Speech cancelled");
        }
        let cancel = epoch.clone();
        let audio = self
            .engine
            .generate_with_config(
                text,
                &GenerationConfig {
                    sid: 26,
                    speed,
                    ..Default::default()
                },
                Some(move |samples: &[f32], _progress: f32| {
                    cancel.load(Ordering::SeqCst) == generation && samples.len() <= 24000 * 30
                }),
            )
            .ok_or("Local speech synthesis failed")?;
        if epoch.load(Ordering::SeqCst) != generation {
            return Err("Speech cancelled");
        }
        if audio.samples().len() > 24000 * 30 || audio.samples().iter().any(|x| !x.is_finite()) {
            return Err("Local speech output was invalid");
        }
        Ok(audio.samples().to_vec())
    }
}
