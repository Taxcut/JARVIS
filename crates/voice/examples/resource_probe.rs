//! Fixed synthetic resource probe. No microphone, playback, identity or conversation data.
//! Run each mode in a separate process under the platform's peak-RSS measurement tool.
use jarvis_voice::{models, models::VoiceEngine, stt};
use std::{
    sync::{atomic::AtomicU64, Arc},
    time::Instant,
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mode = std::env::args().nth(1).ok_or("Choose wake, stt or tts")?;
    let started = Instant::now();
    match mode.as_str() {
        "wake" => {
            let root = models::model_root()?;
            models::verify(&root)?;
            let wake = models::wake(&root, 0.5)?;
            let stream = wake.create_stream();
            for _ in 0..100 {
                stream.accept_waveform(16000, &[0.0; 160]);
                while wake.is_ready(&stream) {
                    wake.decode(&stream);
                }
            }
        }
        "stt" => {
            let mut recognizer = stt::Recognizer::load(&models::stt_root()?)?;
            for _ in 0..100 {
                let _ = recognizer.feed(&[0.0; 160])?;
            }
        }
        "tts" => {
            let root = models::model_root()?;
            models::verify(&root)?;
            let tts = models::Kokoro::load(&root)?;
            let audio =
                tts.synthesize("Good afternoon, Sir.", 0.96, Arc::new(AtomicU64::new(0)), 0)?;
            println!("synthetic_output_ms={}", audio.len() / 24);
        }
        _ => return Err("Choose wake, stt or tts".into()),
    }
    println!("mode={mode} elapsed_ms={}", started.elapsed().as_millis());
    Ok(())
}
