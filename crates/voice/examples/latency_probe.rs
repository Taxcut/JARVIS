//! Fixed public phrase only. No microphone, provider, credentials or private transcript.
use jarvis_voice::models::{self, VoiceEngine};
use std::{
    sync::{atomic::AtomicU64, Arc},
    time::Instant,
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = models::model_root()?;
    models::verify(&root)?;
    for threads in [1, 2, 4] {
        let tts = models::Kokoro::with_threads(&root, threads)?;
        for iteration in 0..3 {
            let start = Instant::now();
            let audio = tts.synthesize(
                "Good afternoon, Sir. How may I help?",
                0.96,
                Arc::new(AtomicU64::new(0)),
                0,
            );
            let audio = match audio {
                Ok(audio) => audio,
                Err(reason) => {
                    println!("threads={threads} iteration={iteration} rejected={reason}");
                    continue;
                }
            };
            println!(
                "threads={threads} iteration={iteration} synthesis_ms={} audio_ms={}",
                start.elapsed().as_millis(),
                audio.len() * 1000 / 24000
            );
        }
        let epoch = Arc::new(AtomicU64::new(1));
        assert!(tts
            .synthesize("This cancelled phrase must not play.", 0.96, epoch, 0)
            .is_err());
    }
    Ok(())
}
