//! Native-only Realtime transport. No credential, transcript or provider error is logged.
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest, protocol::WebSocketConfig, Message,
};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credential {
    pub version: u8,
    pub value: String,
    pub expires_at: i64,
    pub model: String,
    pub execution_available: bool,
}
impl Credential {
    pub fn parse(value: Value) -> Result<Self, &'static str> {
        let c: Self =
            serde_json::from_value(value).map_err(|_| "Voice authorization was invalid")?;
        let expires = c.expires_at;
        let now = chrono::Utc::now().timestamp();
        if c.version != 1
            || c.execution_available
            || !matches!(
                c.model.as_str(),
                "gpt-realtime-2.1" | "gpt-realtime" | "gpt-realtime-mini"
            )
            || !(10..=4096).contains(&c.value.len())
            || c.value.chars().any(|v| v.is_control())
            || expires <= now
            || expires > now + 120
        {
            return Err("Voice authorization was invalid");
        }
        Ok(c)
    }
}
pub enum Input {
    Audio(Vec<f32>),
}
pub enum Event {
    Generation(u64, Box<Event>),
    Model(crate::ModelState),
    FirstToken(u64),
    Connected,
    SpeechStarted,
    SpeechStopped,
    User(String, String, bool),
    Delta(String, String),
    Done(String, String),
    Ended(&'static str, bool),
}
async fn send_event(tx: &mpsc::Sender<Event>, event: Event) -> Result<(), &'static str> {
    tx.try_send(event)
        .map_err(|_| "Conversation processing fell behind")
}
/// Samples are post-wake, 16 kHz mono. Convert to the provider's 24 kHz PCM16 contract.
fn packet(samples: &[f32]) -> Result<String, &'static str> {
    if samples.len() > 1600 || samples.iter().any(|v| !v.is_finite()) {
        return Err("Voice input was invalid");
    }
    let audio = crate::audio::resample_playback(samples, 16000, 24000);
    let bytes: Vec<u8> = audio
        .into_iter()
        .flat_map(|v| ((v.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes())
        .collect();
    Ok(json!({"type":"input_audio_buffer.append","audio":STANDARD.encode(bytes)}).to_string())
}
pub async fn run(
    credential: Credential,
    mut input: mpsc::Receiver<Input>,
    events: mpsc::Sender<Event>,
    mut interrupt: mpsc::Receiver<()>,
    active: Arc<AtomicBool>,
) {
    let result = session(credential, &mut input, &events, &mut interrupt, &active).await;
    let failed = result.is_err();
    let _ = events.try_send(Event::Ended(
        result
            .err()
            .unwrap_or("Conversation ended. Say Jarvis when you need me."),
        failed,
    ));
}
async fn session(
    credential: Credential,
    input: &mut mpsc::Receiver<Input>,
    events: &mpsc::Sender<Event>,
    interrupt: &mut mpsc::Receiver<()>,
    active: &AtomicBool,
) -> Result<(), &'static str> {
    let mut request = format!(
        "wss://api.openai.com/v1/realtime?model={}",
        credential.model
    )
    .into_client_request()
    .map_err(|_| "Voice connection could not start")?;
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {}", credential.value)
            .parse()
            .map_err(|_| "Voice authorization was invalid")?,
    );
    let config = WebSocketConfig::default()
        .max_message_size(Some(65536))
        .max_frame_size(Some(65536));
    let (mut socket, _) = tokio::time::timeout(
        Duration::from_secs(10),
        tokio_tungstenite::connect_async_with_config(request, Some(config), false),
    )
    .await
    .map_err(|_| "Voice connection timed out")?
    .map_err(|_| "Voice provider could not connect")?;
    drop(credential);
    let mut owner_item = String::new();
    let mut owner_text = String::new();
    let mut ready = false;
    let started = tokio::time::Instant::now();
    let mut activity = started;
    let mut timer = tokio::time::interval(Duration::from_secs(1));
    let mut assistant_item = String::new();
    let mut text = String::new();
    loop {
        if !active.load(Ordering::Acquire) {
            return Ok(());
        }
        tokio::select! {
         biased;
         signal=interrupt.recv()=>{
           if signal.is_none() { return Ok(()); }
           socket.send(Message::Text(json!({"type":"response.cancel"}).to_string().into())).await.map_err(|_|"Voice connection was interrupted")?;
           // Text-only provider output cannot be audio-truncated. Remove the interrupted
           // assistant item so unheard content is not represented as spoken history.
           if !assistant_item.is_empty(){socket.send(Message::Text(json!({"type":"conversation.item.delete","item_id":assistant_item}).to_string().into())).await.map_err(|_|"Voice connection was interrupted")?;assistant_item.clear();text.clear();}
          },
         _=timer.tick()=>{if !ready && started.elapsed()>Duration::from_secs(10){return Err("Voice provider setup timed out");}
            if started.elapsed()>Duration::from_secs(300)||activity.elapsed()>Duration::from_secs(45){let _=socket.close(None).await;return Ok(());}},
         command=input.recv(), if ready=>{match command{
          None=>{let _=socket.close(None).await;return Ok(());},
          Some(Input::Audio(data))=>{
           // The callback fence also gates queued packets after mute, suspend or revocation.
           if !active.load(Ordering::Acquire) {return Ok(());}
           socket.send(Message::Text(packet(&data)?.into())).await.map_err(|_|"Voice connection was interrupted")?;
          },

         }},
         frame=socket.next()=>{match frame{
          Some(Ok(Message::Text(raw)))=>{
           let v:Value=serde_json::from_str(&raw).map_err(|_|"Voice provider sent an invalid response")?;
           let kind=v["type"].as_str().unwrap_or("");

           let id=v["item_id"].as_str().filter(|id|id.len()<=80).unwrap_or("").to_string();
           match kind{
            "session.created"=>{if v["session"]["output_modalities"]!=json!(["text"]) || v["session"]["tools"]!=json!([]){return Err("Voice provider session did not match the safe configuration");}ready=true;send_event(events,Event::Connected).await?;},
            "input_audio_buffer.speech_started"=>{activity=tokio::time::Instant::now();send_event(events,Event::SpeechStarted).await?;},
            "input_audio_buffer.speech_stopped"=>{activity=tokio::time::Instant::now();send_event(events,Event::SpeechStopped).await?;},
            "conversation.item.input_audio_transcription.delta"=>{
             if owner_item!=id{owner_item=id.clone();owner_text.clear();}
             let delta=v["delta"].as_str().unwrap_or("");
             owner_text.extend(delta.chars().take(500usize.saturating_sub(owner_text.chars().count())));
             send_event(events,Event::User(id,owner_text.clone(),false)).await?;
            },
            "conversation.item.input_audio_transcription.completed"=>{let t=v["transcript"].as_str().unwrap_or("");send_event(events,Event::User(id,t.chars().take(500).collect(),true)).await?;},
            "response.output_text.delta"=>{
             activity=tokio::time::Instant::now();if id!=assistant_item{assistant_item=id.clone();text.clear();}
             let delta=v["delta"].as_str().unwrap_or("");if text.len()+delta.len()>8192{return Err("Voice response exceeded its limit");}text.push_str(delta);send_event(events,Event::Delta(id,delta.into())).await?;
            },
            "response.output_text.done"=>{send_event(events,Event::Done(id,text.clone())).await?;},
            "response.done"=>{if v["response"]["status"]=="failed"{return Err("Voice response failed. Please try again.");}},
            "error" if v["error"]["code"]=="credit_balance_exhausted" || v["error"]["code"]=="insufficient_quota" => return Err("OpenAI API credit is exhausted. Update API billing, then reconnect voice."),
            "error" if v["error"]["code"]=="rate_limit_exceeded" => return Err("OpenAI is rate limiting voice. Please wait before trying again."),
            "error" if !matches!(v["error"]["code"].as_str(),Some("response_cancel_not_active"|"item_not_found")) => return Err("Voice provider rejected the conversation. Please reconnect."),
            _=>{}
           }
          },
          Some(Ok(Message::Ping(p)))=>socket.send(Message::Pong(p)).await.map_err(|_|"Voice connection was interrupted")?,
          Some(Ok(Message::Pong(_)))=>{},
          _=>return Err("Voice connection was interrupted")
         }}
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pcm_contract_is_bounded() {
        let v: Value = serde_json::from_str(&packet(&vec![0.25; 960]).unwrap()).unwrap();
        assert_eq!(
            STANDARD.decode(v["audio"].as_str().unwrap()).unwrap().len(),
            2880
        );
        assert!(packet(&vec![0.0; 1601]).is_err());
        assert!(packet(&[f32::NAN]).is_err());
    }
    #[test]
    fn credentials_reject_arbitrary_model_and_execution() {
        let mut v = json!({"version":1,"value":"local-test-credential","model":"gpt-realtime-2.1","expiresAt":(chrono::Utc::now()+chrono::Duration::seconds(60)).timestamp(),"executionAvailable":false});
        assert!(Credential::parse(v.clone()).is_ok());
        v["model"] = json!("attacker.invalid");
        assert!(Credential::parse(v.clone()).is_err());
        v["model"] = json!("gpt-realtime-2.1");
        v["executionAvailable"] = json!(true);
        assert!(Credential::parse(v).is_err());
    }
}
