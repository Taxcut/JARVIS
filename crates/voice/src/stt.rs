//! Streaming recognition stays on the native audio worker; no waveform is retained.
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};
use std::path::Path;
pub const DIRECTORY: &str = "sherpa-onnx-streaming-zipformer-en-2023-06-26";
pub struct Recognizer {
    engine: OnlineRecognizer,
    stream: OnlineStream,
    last: String,
    samples: usize,
}
pub struct Update {
    pub text: String,
    pub final_text: bool,
}
impl Recognizer {
    pub fn load(root: &Path) -> Result<Self, &'static str> {
        crate::models::verify_stt(root)?;
        let root = root.join(DIRECTORY);
        let file = |name: &str| Some(root.join(name).to_string_lossy().into_owned());
        let mut config = OnlineRecognizerConfig {
            enable_endpoint: true,
            rule1_min_trailing_silence: 2.4,
            rule2_min_trailing_silence: 0.9,
            rule3_min_utterance_length: 20.0,
            decoding_method: Some("greedy_search".into()),
            ..Default::default()
        };
        config.model_config.transducer.encoder =
            file("encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx");
        config.model_config.transducer.decoder =
            file("decoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx");
        config.model_config.transducer.joiner =
            file("joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx");
        config.model_config.tokens = file("tokens.txt");
        config.model_config.model_type = Some("zipformer2".into());
        config.model_config.provider = Some("cpu".into());
        config.model_config.num_threads = 2;
        let engine =
            OnlineRecognizer::create(&config).ok_or("Local speech recognition could not load")?;
        let stream = engine.create_stream();
        Ok(Self {
            engine,
            stream,
            last: String::new(),
            samples: 0,
        })
    }
    pub fn reset(&mut self) {
        // Fresh feature storage bounds long-running sessions; weights stay loaded.
        self.stream = self.engine.create_stream();
        self.samples = 0;
        self.last.clear();
    }
    pub fn feed(&mut self, samples: &[f32]) -> Result<Option<Update>, &'static str> {
        if samples.len() > 32000 || samples.iter().any(|x| !x.is_finite()) {
            return Err("Local speech input was invalid");
        }
        self.samples += samples.len();
        self.stream.accept_waveform(16000, samples);
        while self.engine.is_ready(&self.stream) {
            self.engine.decode(&self.stream);
        }
        let text: String = self
            .engine
            .get_result(&self.stream)
            .map(|r| r.text.to_lowercase())
            .unwrap_or_default()
            .chars()
            .take(500)
            .collect();
        let final_text = self.engine.is_endpoint(&self.stream) || self.samples >= 16000 * 22;
        let changed = text != self.last;
        self.last = text.clone();
        if final_text {
            self.reset();
        }
        Ok((!text.is_empty() && (changed || final_text)).then_some(Update { text, final_text }))
    }
}
