//! Opt-in live provider acceptance. Receives an ephemeral credential on stdin;
//! uses a fixed synthetic arithmetic question, no microphone and no private text.
use jarvis_voice::{
    models::{self, VoiceEngine},
    provider::{self, Credential, Event, Input},
};
use std::{
    io::Read,
    sync::{atomic::AtomicU64, Arc},
    time::Duration,
};
#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut raw = String::new();
    std::io::stdin().take(8193).read_to_string(&mut raw)?;
    if raw.len() > 8192 {
        return Err("Credential input exceeded limit".into());
    }
    let credential = Credential::parse(serde_json::from_str(&raw)?)?;
    drop(raw);
    let root = models::model_root()?;
    models::verify(&root)?;
    let engine = models::Kokoro::load(&root)?;
    let samples = engine.synthesize(
        "What is two plus two?",
        0.96,
        Arc::new(AtomicU64::new(0)),
        0,
    )?;
    let mut input = jarvis_voice::audio::resample_playback(&samples, 24000, 16000);
    input.extend(vec![0.0; 32000]);
    let (tx, rx) = tokio::sync::mpsc::channel(128);
    let (events, mut result) = tokio::sync::mpsc::channel(64);
    let (_interrupt, signals) = tokio::sync::mpsc::channel(1);
    let task = tokio::spawn(provider::run(
        credential,
        rx,
        events,
        signals,
        std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true)),
    ));
    let deadline = tokio::time::Instant::now() + Duration::from_secs(40);
    let mut sent = false;
    let mut answer = String::new();
    let mut transcribed = false;
    let mut response = false;
    loop {
        let event = tokio::time::timeout_at(deadline, result.recv())
            .await?
            .ok_or("Provider stopped")?;
        match event {
            Event::Connected => {
                println!("Provider connected");
                if !sent {
                    sent = true;
                    let audio = input.clone();
                    let sender = tx.clone();
                    tokio::spawn(async move {
                        for chunk in audio.chunks(960) {
                            if sender.send(Input::Audio(chunk.to_vec())).await.is_err() {
                                return;
                            }
                            tokio::time::sleep(Duration::from_millis(60)).await;
                        }
                    });
                }
            }
            Event::User(_, _, _) => {
                transcribed = true;
                println!("Synthetic input transcription received");
            }
            Event::Delta(_, text) => {
                answer.push_str(&text);
                if !response {
                    response = true;
                    println!("Response streaming received");
                }
            }
            Event::Done(_, _) => {
                let correct = answer.to_lowercase().contains("four") || answer.contains('4');
                println!(
                    "Arithmetic answer verified: {correct}; transcription received: {transcribed}"
                );
                task.abort();
                if !correct {
                    return Err("Arithmetic fixture failed".into());
                }
                return Ok(());
            }
            Event::Ended(e, _) => {
                task.abort();
                return Err(e.into());
            }
            _ => {}
        }
    }
}
