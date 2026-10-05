//! Explicit synthetic local acceptance; never reads the microphone or owner transcripts.
use jarvis_voice::{
    local,
    models::{self, VoiceEngine},
    provider::Event,
    stt,
};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64},
        Arc,
    },
    time::Instant,
};
#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    local::installed().await.map_err(|(_, e)| e)?;
    let root = models::model_root()?;
    models::verify(&root)?;
    let tts = models::Kokoro::load(&root)?;
    let samples = tts.synthesize(
        "What is two plus two?",
        0.96,
        Arc::new(AtomicU64::new(0)),
        0,
    )?;
    let mut input = jarvis_voice::audio::resample_playback(&samples, 24000, 16000);
    input.extend(vec![0.0; 32000]);
    let load = Instant::now();
    let mut recognizer = stt::Recognizer::load(&models::stt_root()?)?;
    println!("STT load_ms={}", load.elapsed().as_millis());
    let decode = Instant::now();
    let mut first = None;
    let mut final_text = String::new();
    for (i, frame) in input.chunks(160).enumerate() {
        if let Some(update) = recognizer.feed(frame)? {
            first.get_or_insert(i * 10);
            if update.final_text {
                final_text = update.text;
                break;
            }
        }
    }
    println!("Synthetic fixture transcript: {final_text:?}");
    assert!(
        final_text
            .to_lowercase()
            .replace("too", "two")
            .contains("two plus two"),
        "Synthetic STT arithmetic fixture failed"
    );
    println!(
        "STT fixture passed; first_partial_audio_ms={first:?}; decode_ms={}; audio_ms={}",
        decode.elapsed().as_millis(),
        input.len() / 16
    );
    let (tx, mut rx) = tokio::sync::mpsc::channel(64);
    let started = Instant::now();
    let task = tokio::spawn(async move {
        local::generate(
            &[local::Message {
                role: "user".into(),
                content: final_text,
            }],
            &tx,
            "synthetic-local-probe",
            0,
            &AtomicBool::new(true),
        )
        .await
    });
    let (speech, jobs) = std::sync::mpsc::sync_channel::<String>(1);
    let synthesis = std::thread::spawn(move || {
        let text = jobs.recv().map_err(|_| "No sentence was produced")?;
        let synth = Instant::now();
        let output = tts.synthesize(&text, 0.96, Arc::new(AtomicU64::new(0)), 0)?;
        Ok::<_, &'static str>((
            started.elapsed().as_millis(),
            synth.elapsed().as_millis(),
            output.len() / 24,
        ))
    });
    let mut sentence = String::new();
    let mut sent = false;
    while let Some(event) = rx.recv().await {
        if let Event::Generation(_, event) = event {
            match *event {
                Event::FirstToken(ms) => println!("Qwen first_token_ms={ms}"),
                Event::Delta(_, delta) if !sent => {
                    sentence.push_str(&delta);
                    if let Some(part) =
                        jarvis_voice::controller::take_sentence(&mut sentence, false)
                    {
                        speech.send(part)?;
                        sent = true;
                    }
                }
                Event::Done(_, _) if !sent => {
                    speech.send(sentence.clone())?;
                    sent = true;
                }
                _ => {}
            }
        }
    }
    let answer = task.await??;
    println!("Fixed synthetic answer: {answer}");
    assert!(
        answer.to_lowercase().contains("four") || answer.contains('4'),
        "Local arithmetic response check failed"
    );
    drop(speech);
    let (first_audio_ms, tts_ms, output_ms) =
        synthesis.join().map_err(|_| "Speech worker failed")??;
    println!("Local STT → Qwen → Kokoro synthetic pass; first_sentence_tts_ms={tts_ms}; first_sentence_output_ms={output_ms}; post_stt_first_audio_ms={first_audio_ms}");
    Ok(())
}
