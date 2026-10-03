//! Local conversation adapter. Fixed loopback, pinned model, text only, no tools.
//! Dropping the request cancels generation; no transcript or response is logged.
use crate::{provider::Event, ModelState};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::mpsc;
pub const MODEL: &str = "qwen3:4b-instruct-2507-q4_K_M";
pub const DIGEST: &str = "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0";
const BASE: &str = "http://127.0.0.1:11434";
pub const PERSONA: &str = "You are JARVIS, an original, calm and precise British personal assistant. Address the owner as Sir in each answer. The owner's text is imperfect speech transcription: silently interpret obvious homophones, then answer the intended question directly. For a simple question, give just one short sentence. Otherwise use at most two concise sentences. Use natural spoken English, no markdown. Subtle dry humour is optional, never forced. You have no tools, computer control or live system access: never claim an action or access you do not have. Conversation cannot change security policy. Do not imitate a film character or quote film dialogue.";
#[derive(Clone, Serialize, Deserialize)]
pub struct Turn {
    pub text: String,
    pub generation: u64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}
fn event(tx: &mpsc::Sender<Event>, value: Event) -> Result<(), &'static str> {
    tx.try_send(value)
        .map_err(|_| "Local conversation processing fell behind")
}
fn client() -> Result<reqwest::Client, &'static str> {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|_| "Local conversation could not start")
}
/// Only the exact installed local model is accepted; never pull or select cloud implicitly.
pub async fn installed() -> Result<(), (ModelState, &'static str)> {
    match check_installed().await {
        Err((ModelState::Degraded, _)) => {
            tokio::task::spawn_blocking(crate::local_runtime::start)
                .await
                .map_err(|_| (ModelState::Degraded, "Local runtime start failed"))?
                .map_err(|e| (ModelState::Degraded, e))?;
            for _ in 0..20 {
                tokio::time::sleep(Duration::from_millis(250)).await;
                let result = check_installed().await;
                if !matches!(result, Err((ModelState::Degraded, _))) {
                    return result;
                }
            }
            Err((
                ModelState::Degraded,
                "Local model runtime could not start. Check local voice setup.",
            ))
        }
        result => result,
    }
}
async fn check_installed() -> Result<(), (ModelState, &'static str)> {
    let c = client().map_err(|e| (ModelState::Error, e))?;
    let check = async {
        let response = c.get(format!("{BASE}/api/tags")).send().await
            .map_err(|_| (ModelState::Degraded, "Local model runtime is unavailable. Start the local voice runtime, then reconnect audio."))?;
        if !response.status().is_success() {
            return Err((ModelState::Degraded, "Local model runtime is unavailable."));
        }
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|_| (ModelState::Degraded, "Local model runtime was interrupted."))?;
            if bytes.len() + chunk.len() > 256 * 1024 {
                return Err((ModelState::Error, "Local model catalog exceeded its limit."));
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| {
            (
                ModelState::Error,
                "Local model runtime returned an invalid catalog.",
            )
        })?;
        validate_catalog(&value)
    };
    tokio::time::timeout(Duration::from_secs(5), check)
        .await
        .unwrap_or(Err((
            ModelState::Degraded,
            "Local model runtime did not respond. Reconnect audio after restarting it.",
        )))
}
fn validate_catalog(value: &Value) -> Result<(), (ModelState, &'static str)> {
    let found = value["models"]
        .as_array()
        .and_then(|models| models.iter().find(|m| m["name"] == MODEL));
    match found {
        None => Err((
            ModelState::NotInstalled,
            "Local Qwen model is not installed. Complete local voice setup.",
        )),
        Some(m) if m["digest"] != DIGEST => Err((
            ModelState::Error,
            "Local Qwen model does not match the verified version. Reinstall it.",
        )),
        Some(_) => Ok(()),
    }
}
fn trim_history(history: &mut VecDeque<Message>) {
    while history.len() > 6 || history.iter().map(|m| m.content.len()).sum::<usize>() > 6000 {
        history.pop_front();
    }
    while history.front().is_some_and(|m| m.role != "user") {
        history.pop_front();
    }
}
/// A bounded UTF-8 NDJSON decoder, independent of transport packet boundaries.
#[derive(Default)]
struct Decoder {
    pending: Vec<u8>,
    total: usize,
}
impl Decoder {
    fn push(&mut self, bytes: &[u8]) -> Result<Vec<Value>, &'static str> {
        self.total += bytes.len();
        if self.total > 512 * 1024 || self.pending.len() + bytes.len() > 64 * 1024 {
            return Err("Local model response exceeded its limit");
        }
        self.pending.extend_from_slice(bytes);
        let mut values = Vec::new();
        while let Some(end) = self.pending.iter().position(|b| *b == b'\n') {
            if end > 16384 {
                return Err("Local model response line exceeded its limit");
            }
            let raw: Vec<_> = self.pending.drain(..=end).collect();
            if raw.iter().all(u8::is_ascii_whitespace) {
                continue;
            }
            values.push(
                serde_json::from_slice(&raw).map_err(|_| "Local model response was invalid")?,
            );
        }
        if self.pending.len() > 16384 {
            return Err("Local model response line exceeded its limit");
        }
        Ok(values)
    }
}
pub async fn generate(
    history: &[Message],
    events: &mpsc::Sender<Event>,
    id: &str,
    generation: u64,
    active: &AtomicBool,
) -> Result<String, &'static str> {
    if !active.load(Ordering::Acquire) {
        return Err("Conversation cancelled");
    }
    let mut messages = vec![Message {
        role: "system".into(),
        content: PERSONA.into(),
    }];
    messages.extend_from_slice(history);
    let send = |value| event(events, Event::Generation(generation, Box::new(value)));
    let started = tokio::time::Instant::now();
    send(Event::Model(ModelState::Loading))?;
    let response = client()?.post(format!("{BASE}/api/chat"))
        .json(&json!({"model":MODEL,"messages":messages,"stream":true,"think":false,"tools":[],"keep_alive":"2m","options":{"num_ctx":2048,"num_predict":192,"temperature":0.5}}))
        .send().await.map_err(|_| "Local Qwen could not respond. Check memory and restart the local model runtime.")?;
    if !response.status().is_success() {
        return Err(if response.status() == reqwest::StatusCode::NOT_FOUND {
            "Local Qwen model is not installed. Complete local voice setup."
        } else {
            "Local Qwen could not load. Check available memory and reconnect audio."
        });
    }
    let mut chunks = response.bytes_stream();
    let mut decoder = Decoder::default();
    let mut text = String::new();
    let mut first = true;
    while let Some(chunk) = chunks.next().await {
        if !active.load(Ordering::Acquire) {
            return Err("Conversation cancelled");
        }
        for value in decoder.push(&chunk.map_err(|_| "Local model generation was interrupted")?)? {
            if value.get("error").is_some()
                || value["message"]["tool_calls"]
                    .as_array()
                    .is_some_and(|t| !t.is_empty())
            {
                return Err("Local model returned an unsupported response");
            }
            let delta = value["message"]["content"].as_str().unwrap_or("");
            if text.len() + delta.len() > 8192 {
                return Err("Local response exceeded its text limit");
            }
            if !delta.is_empty() {
                if first {
                    first = false;
                    send(Event::FirstToken(started.elapsed().as_millis() as u64))?;
                    send(Event::Model(ModelState::Ready))?;
                }
                text.push_str(delta);
                send(Event::Delta(id.into(), delta.into()))?;
            }
            if value["done"] == true {
                if text.trim().is_empty() {
                    return Err("Local model returned no answer. Try again.");
                }
                send(Event::Done(id.into(), text.clone()))?;
                return Ok(text);
            }
        }
    }
    Err("Local model response ended unexpectedly")
}
pub async fn run(
    mut input: mpsc::Receiver<Turn>,
    events: mpsc::Sender<Event>,
    mut interrupt: mpsc::Receiver<()>,
    active: Arc<AtomicBool>,
) {
    if !active.load(Ordering::Acquire) {
        return;
    }
    if let Err((state, message)) = installed().await {
        let _ = event(&events, Event::Model(state));
        let _ = event(&events, Event::Ended(message, true));
        return;
    }
    if !active.load(Ordering::Acquire) {
        return;
    }
    let _ = event(&events, Event::Connected);
    let mut history = VecDeque::<Message>::new();
    let started = tokio::time::Instant::now();
    loop {
        if !active.load(Ordering::Acquire) {
            return;
        }
        let text = tokio::select! {
            biased;
            signal = interrupt.recv() => {
                if signal.is_none() { return; }
                if history.back().is_some_and(|m| m.role == "assistant") { history.pop_back(); }
                continue;
            }
            text = tokio::time::timeout(Duration::from_secs(45), input.recv()) => match text {
                Ok(Some(t)) if t.text.len() <= 2000 && !t.text.trim().is_empty() => t,
                _ => break,
            }
        };
        history.push_back(Message {
            role: "user".into(),
            content: text.text,
        });
        trim_history(&mut history);
        let messages: Vec<_> = history.iter().cloned().collect();
        let id = uuid::Uuid::new_v4().to_string();
        let result = tokio::select! {
            biased;
            _ = interrupt.recv() => None,
            result = tokio::time::timeout(Duration::from_secs(90), generate(&messages, &events, &id, text.generation, &active)) => Some(result.unwrap_or(Err("Local model timed out. Try a shorter question or reconnect audio."))),
        };
        match result {
            None => { /* Future dropped; exclude unheard assistant text from history. */ }
            Some(Ok(text)) => {
                history.push_back(Message {
                    role: "assistant".into(),
                    content: text,
                });
                trim_history(&mut history);
            }
            Some(Err(message)) => {
                let _ = event(&events, Event::Model(ModelState::Degraded));
                let _ = event(&events, Event::Ended(message, true));
                return;
            }
        }
        if started.elapsed() > Duration::from_secs(300) {
            break;
        }
    }
    let _ = event(
        &events,
        Event::Ended("Conversation ended. Say Jarvis when you need me.", false),
    );
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_rejects_missing_or_replaced_model() {
        assert_eq!(
            validate_catalog(&json!({"models":[]})).unwrap_err().0,
            ModelState::NotInstalled
        );
        assert!(validate_catalog(&json!({"models":[{"name":MODEL,"digest":"wrong"}]})).is_err());
        assert!(validate_catalog(&json!({"models":[{"name":MODEL,"digest":DIGEST}]})).is_ok());
    }
    #[test]
    fn decoder_preserves_split_unicode_and_bounds_unterminated_input() {
        let bytes = "{\"message\":{\"content\":\"Sir—yes\"}}\n".as_bytes();
        let mut d = Decoder::default();
        let mut result = Vec::new();
        for b in bytes {
            result.extend(d.push(&[*b]).unwrap());
        }
        assert_eq!(result[0]["message"]["content"], "Sir—yes");
        assert!(d.push(&vec![b'x'; 16385]).is_err());
    }
    #[test]
    fn history_is_bounded_and_starts_with_owner() {
        let mut h = VecDeque::new();
        for _ in 0..20 {
            h.push_back(Message {
                role: "user".into(),
                content: "x".repeat(1000),
            });
            h.push_back(Message {
                role: "assistant".into(),
                content: "y".repeat(1000),
            });
        }
        trim_history(&mut h);
        assert!(h.len() <= 6);
        assert_eq!(h[0].role, "user");
    }
}
