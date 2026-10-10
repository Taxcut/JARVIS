use jarvis_voice::models::{self, VoiceEngine};
use std::{
    sync::{atomic::AtomicU64, Arc},
    time::Instant,
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = models::model_root()?;
    let now = Instant::now();
    models::verify(&root)?;
    let tts = models::Kokoro::load(&root)?;
    let kws = models::wake(&root, 0.5)?;
    let asr = sherpa_onnx::OnlineRecognizer::create(&sherpa_onnx::OnlineRecognizerConfig {
        model_config: models::wake_config(&root, 0.5).model_config,
        decoding_method: Some("greedy_search".into()),
        ..Default::default()
    })
    .ok_or("Probe recognizer unavailable")?;
    println!("Verified models loaded in {} ms", now.elapsed().as_millis());
    for (text, expected) in [
        ("Jarvis.", true),
        ("Hey Jarvis.", true),
        ("Good afternoon, Sir. How may I help?", false),
        ("The weather is pleasant today.", false),
        ("Jarvis, what is two plus two?", true),
        ("Jarvis, stop listening.", true),
        ("Quorvex is an invented word.", false),
    ] {
        let now = Instant::now();
        let audio = tts.synthesize(text, 0.96, Arc::new(AtomicU64::new(0)), 0)?;
        let elapsed = now.elapsed().as_millis();
        let transcribe = asr.create_stream();
        transcribe.accept_waveform(24000, &audio);
        transcribe.accept_waveform(24000, &vec![0.0; 24000]);
        transcribe.input_finished();
        while asr.is_ready(&transcribe) {
            asr.decode(&transcribe);
        }
        println!(
            "Synthetic fixture recognized: {:?}",
            asr.get_result(&transcribe).map(|r| (r.text, r.tokens))
        );
        let stream = kws.create_stream();
        if text.contains("stop listening") {
            let stop = kws.create_stream_with_keywords(include_str!("../stop-keywords.txt"));
            stop.accept_waveform(24000, &audio);
            stop.accept_waveform(24000, &vec![0.0; 24000]);
            stop.input_finished();
            let mut detected = false;
            while kws.is_ready(&stop) {
                kws.decode(&stop);
                if kws
                    .get_result(&stop)
                    .is_some_and(|r| r.keyword == "Stop_listening")
                {
                    detected = true;
                    break;
                }
            }
            assert!(detected, "Local stop listening fixture failed");
        }
        stream.accept_waveform(24000, &audio);
        stream.accept_waveform(24000, &vec![0.0; 12000]);
        stream.input_finished();
        let mut found = false;
        while kws.is_ready(&stream) {
            kws.decode(&stream);
            if let Some(r) = kws.get_result(&stream) {
                if !r.keyword.is_empty() {
                    found = true;
                    println!(
                        "Wake detected: {} at {} / {:?}",
                        r.keyword, r.start_time, r.timestamps
                    );
                    kws.reset(&stream);
                }
            }
        }

        assert_eq!(found, expected, "Wake fixture failed: {text}");
        println!(
            "Fixture expected_wake={expected} detected={found} synthesis_ms={elapsed} audio_ms={}",
            audio.len() * 1000 / 24000
        );
    }
    Ok(())
}
