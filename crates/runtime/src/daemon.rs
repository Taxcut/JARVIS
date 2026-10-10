use crate::{
    ipc::{Command, Control, Reply},
    platform::{self, Event},
    storage::{self, InstanceLock, Log},
    utc, State, Status,
};
use futures_util::{SinkExt, StreamExt};
use jarvis_identity::client::NativeClient;
use serde_json::{json, Value};
use std::{io, path::PathBuf, time::Duration};
use tokio::{
    net::TcpStream,
    sync::{mpsc, watch},
    time::Instant,
};
use tokio_tungstenite::{
    tungstenite::{protocol::WebSocketConfig, Message},
    MaybeTlsStream, WebSocketStream,
};
type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
fn entropy() -> u32 {
    let mut bytes = [0; 4];
    let _ = getrandom::fill(&mut bytes);
    u32::from_ne_bytes(bytes)
}
fn sync(status: &mut Status, value: &Value) -> Result<(), String> {
    if value["version"] != 1 || !matches!(value["type"].as_str(), Some("snapshot" | "update")) {
        return Err("Invalid Core response".into());
    }
    let snapshot = &value["snapshot"];
    let seq = snapshot["sequence"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or("Invalid Core response")?;
    let prev = status
        .sync_sequence
        .parse::<u64>()
        .map_err(|_| "Invalid Core response")?;
    if value["type"] == "update" && seq <= prev {
        return Ok(());
    }
    if snapshot["version"] != 1
        || seq < prev
        || (value["type"] == "update" && value["fromSequence"] != status.sync_sequence)
    {
        return Err("Invalid Core response".into());
    }
    let own = status.device_id.ok_or("Invalid Core response")?.to_string();
    let device = snapshot["devices"]
        .as_array()
        .and_then(|a| a.iter().find(|d| d["id"] == own))
        .ok_or("Invalid Core response")?;
    if device["trustState"] == "revoked" {
        return Err("Device revoked".into());
    }
    if device["trustState"] != "trusted" {
        return Err("Authentication or request rejected".into());
    }
    let security = snapshot["owner"]["securityState"]
        .as_str()
        .ok_or("Invalid Core response")?;
    if !matches!(security, "NORMAL" | "LOCKDOWN") {
        return Err("Invalid Core response".into());
    }
    let events = value["events"].as_array().ok_or("Invalid Core response")?;
    let mut cursor = prev;
    for event in events {
        let next = event["sequence"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .ok_or("Invalid Core response")?;
        if next <= cursor || next > seq {
            return Err("Invalid Core response".into());
        }
        cursor = next;
    }
    if value["type"] == "update" && cursor != seq {
        return Err("Invalid Core response".into());
    }
    if snapshot
        .get("runtimePresence")
        .and_then(Value::as_array)
        .is_some_and(|items| items.iter().any(|r| r["executionAvailable"] != false))
    {
        return Err("Invalid Core response".into());
    }
    status.sync_sequence = seq.to_string();
    status.security_state = Some(security.into());
    Ok(())
}
async fn connect(client: &mut NativeClient, status: &mut Status) -> Result<Socket, String> {
    let base = client
        .saved_core()
        .ok_or("No saved session. Sign in with your passkey.")?;
    client.resume(&base).await?;
    let compatibility = client
        .runtime_api(&base, "GET", "/api/v1/runtime/compatibility", Value::Null)
        .await?;
    if compatibility["version"] != 1
        || compatibility["runtimeProtocolVersion"] != 2
        || compatibility["minimumRuntimeProtocolVersion"] != 2
        || compatibility["executionAvailable"] != false
    {
        return Err("Runtime update required".into());
    }
    let ticket = client
        .runtime_api(&base, "POST", "/api/v1/sync/ticket", json!({}))
        .await?;
    let ticket = ticket["ticket"]
        .as_str()
        .filter(|t| t.len() == 43)
        .ok_or("Invalid Core response")?;
    let cfg = WebSocketConfig::default()
        .max_message_size(Some(2 * 1024 * 1024))
        .max_frame_size(Some(2 * 1024 * 1024));
    let (mut socket, _) = tokio::time::timeout(
        Duration::from_secs(10),
        tokio_tungstenite::connect_async_with_config(
            format!("{}/api/v1/realtime", base.replacen("http:", "ws:", 1)),
            Some(cfg),
            false,
        ),
    )
    .await
    .map_err(|_| "Core is unavailable")?
    .map_err(|_| "Core is unavailable")?;
    socket
        .send(Message::Text(
            json!({"version":1,"ticket":ticket,"lastSequence":"0"})
                .to_string()
                .into(),
        ))
        .await
        .map_err(|_| "Core is unavailable")?;
    status.sync_sequence = "0".into();
    let initial = tokio::time::timeout(Duration::from_secs(10), socket.next())
        .await
        .map_err(|_| "Core is unavailable")?
        .ok_or("Core is unavailable")?
        .map_err(|_| "Core is unavailable")?;
    if let Message::Text(text) = initial {
        sync(
            status,
            &serde_json::from_str::<Value>(&text).map_err(|_| "Invalid Core response")?,
        )?;
    } else {
        return Err("Core is unavailable".into());
    }
    status.state = State::Online;
    client
        .runtime_api(&base, "POST", "/api/v1/runtime/register", status.report())
        .await?;
    status.last_connected_at = Some(utc());
    status.last_heartbeat_at = Some(utc());
    status.reconnect_attempt = 0;
    status.last_error = None;
    Ok(socket)
}
fn failed(status: &mut Status, error: &str, log: &Log) -> Option<Instant> {
    let (state, code, retry) = crate::classify(error);
    status.state = if retry && status.reconnect_attempt >= 3 {
        State::Offline
    } else {
        state
    };
    status.last_error = Some(code.into());
    log.event(code, state);
    if retry {
        let delay = crate::backoff(status.reconnect_attempt, entropy());
        status.reconnect_attempt = status.reconnect_attempt.saturating_add(1);
        Some(Instant::now() + delay)
    } else {
        None
    }
}
async fn stop(client: &mut Option<NativeClient>, status: &mut Status) {
    status.state = State::Stopping;
    if let Some(c) = client {
        if let Some(base) = c.saved_core() {
            let _ = tokio::time::timeout(
                Duration::from_secs(3),
                c.runtime_api(&base, "POST", "/api/v1/runtime/stop", status.report()),
            )
            .await;
        }
    }
}
#[derive(Debug, PartialEq, Eq)]
enum Lifecycle {
    Observe,
    Suspend,
    Reconnect,
    Shutdown,
}
fn lifecycle(status: &mut Status, event: Event) -> Lifecycle {
    match event {
        Event::Ready => {
            status.platform_observer = true;
            Lifecycle::Observe
        }
        Event::Unavailable => {
            status.platform_observer = false;
            status.last_error = Some("PLATFORM_OBSERVER_UNAVAILABLE".into());
            Lifecycle::Observe
        }
        Event::Sleep | Event::SessionInactive => {
            status.state = State::Suspending;
            Lifecycle::Suspend
        }
        Event::Wake | Event::SessionActive => {
            status.wake_generation = status.wake_generation.saturating_add(1);
            status.state = State::Connecting;
            status.sync_sequence = "0".into();
            Lifecycle::Reconnect
        }
        Event::Logout => Lifecycle::Shutdown,
    }
}
pub async fn run(directory: PathBuf, mut events: mpsc::Receiver<Event>) -> io::Result<()> {
    let _lock = InstanceLock::acquire(&directory, "worker.lock")?;
    let log = Log::new(directory.clone());
    let mut status = Status {
        startup: platform::startup(None).unwrap_or_else(|_| "ERROR".into()),
        ..Status::default()
    };
    let (state_tx, state_rx) = watch::channel(status.clone());
    let (control_tx, mut controls) = mpsc::channel::<Control>(8);
    let (voice_tx, mut voice_requests) =
        mpsc::channel::<jarvis_voice::controller::CredentialRequest>(2);
    let voice = crate::voice::start(&directory, voice_tx);
    let mut voice_clock = tokio::time::interval(Duration::from_millis(100));
    voice_clock.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut ipc = tokio::spawn(crate::ipc::serve(directory, control_tx, state_rx));
    // Keychain may require owner approval. The IPC listener remains live during this OS operation.
    let mut client = tokio::task::spawn_blocking(NativeClient::load_runtime)
        .await
        .map_err(|_| io::Error::other("Identity worker failed"))?
        .ok();
    if let Some(c) = &client {
        status.device_id = Some(c.status().device.id);
    }
    let mut next = Some(Instant::now());
    let mut socket: Option<Socket> = None;
    let mut last_frame = Instant::now();
    let mut heartbeat = tokio::time::interval(Duration::from_secs(30));
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    heartbeat.tick().await;
    let mut sleeping = false;
    #[cfg(unix)]
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    log.event("RUNTIME_STARTED", status.state);
    loop {
        voice.authority(
            status.state == State::Online && status.security_state.as_deref() == Some("NORMAL"),
            if status.security_state.as_deref() == Some("LOCKDOWN") {
                jarvis_voice::Phase::Lockdown
            } else if sleeping {
                jarvis_voice::Phase::Suspended
            } else {
                jarvis_voice::Phase::AuthRequired
            },
        );
        status.voice = voice.snapshot();
        state_tx.send_replace(status.clone());
        tokio::select! {
            _=async{#[cfg(unix)]{terminate.recv().await;}#[cfg(not(unix))]{std::future::pending::<()>().await;}}=>{voice.authority(false,jarvis_voice::Phase::Suspended);stop(&mut client,&mut status).await;break;},
            _=tokio::signal::ctrl_c()=>{voice.authority(false,jarvis_voice::Phase::Suspended);stop(&mut client,&mut status).await;break;},
            result=&mut ipc=>{result.map_err(|_|io::Error::other("IPC task failed"))??;return Err(io::Error::other("IPC task stopped"));},
            _=voice_clock.tick()=>{},
            Some(request)=voice_requests.recv()=>{
                let result=if status.state==State::Online && status.security_state.as_deref()==Some("NORMAL") {
                    if let Some(c)=&mut client {let base=c.saved_core().unwrap_or_default();
                        match tokio::time::timeout(Duration::from_secs(10),c.runtime_api(&base,"POST","/api/v1/voice/session",json!({}))).await {
                            Ok(Ok(value))=>jarvis_voice::provider::Credential::parse(value),
                            _=>Err("Voice provider is unavailable or not configured. Check Core settings.")
                        }
                    }else{Err("Voice requires a trusted runtime")}
                }else{Err("Voice requires a trusted runtime")};
                let _=request.reply.send(result);
            },
            Some(control)=controls.recv()=>{
                let mut error=None;
                match control.command {
                    Command::Status {}=>{},
                    Command::VoiceConfigure{settings}=>{error=voice.command(jarvis_voice::controller::Command::Configure(settings)).err().map(str::to_string);},
                    Command::VoiceRetry{}=>{error=voice.command(jarvis_voice::controller::Command::Retry).err().map(str::to_string);},
                    Command::VoiceClear{}=>{error=voice.command(jarvis_voice::controller::Command::Clear).err().map(str::to_string);},
                    Command::VoiceGreet{}=>{error=voice.command(jarvis_voice::controller::Command::Greet).err().map(str::to_string);},
                    Command::Stop {}=>{voice.authority(false,jarvis_voice::Phase::Suspended);stop(&mut client,&mut status).await;let _=control.reply.send(Reply{status:Some(status.clone()),error:None});let _=tokio::time::timeout(Duration::from_secs(3),control.delivered).await;break;},
                    Command::Reconnect {}=>{
                        socket=None;status.state=State::Connecting;
                        // Re-read only on explicit owner retry; never loop on OS prompts.
                        if client.is_none(){client=tokio::task::spawn_blocking(NativeClient::load_runtime).await.ok().and_then(Result::ok);}
                        next=Some(Instant::now());
                    },
                    Command::Provision{base,session}=>{
                        if client.is_none(){client=tokio::task::spawn_blocking(NativeClient::load_runtime).await.ok().and_then(Result::ok);}
                        match client.as_mut().ok_or("Secure identity unavailable").and_then(|c|c.adopt_runtime_session(&base,&session).map_err(|_|"Secure runtime session could not be saved")) {
                            Ok(())=>{socket=None;status.instance_id=uuid::Uuid::new_v4();status.state=State::Connecting;next=Some(Instant::now());},
                            Err(e)=>{error=Some(e.into());status.state=State::AuthRequired;}
                        }
                    }
                }
                if let Some(c)=&client{status.device_id=Some(c.status().device.id);}
                let _=control.reply.send(Reply{status:Some(status.clone()),error});
            },
            Some(event)=events.recv()=>{
                match lifecycle(&mut status,event) {
                    Lifecycle::Observe=>{},
                    Lifecycle::Suspend=>{
                        sleeping=true;voice.authority(false,jarvis_voice::Phase::Suspended);
                        if let Some(c)=&mut client {if let Some(base)=c.saved_core(){let _=tokio::time::timeout(Duration::from_secs(2),c.runtime_api(&base,"POST","/api/v1/runtime/heartbeat",status.report())).await;}}
                        socket=None;next=None;log.event("SESSION_SUSPENDING",status.state);
                    },
                    Lifecycle::Reconnect=>{sleeping=false;socket=None;next=Some(Instant::now()+Duration::from_millis(500));log.event("SESSION_RESUMING",status.state);},
                    Lifecycle::Shutdown=>{voice.authority(false,jarvis_voice::Phase::Suspended);stop(&mut client,&mut status).await;break;}
                }
            },
            _=async{if let Some(deadline)=next{tokio::time::sleep_until(deadline).await}else{std::future::pending::<()>().await}},if !sleeping=>{
                next=None;status.state=State::Connecting;state_tx.send_replace(status.clone());
                match client.as_mut(){
                    Some(c)=>match tokio::time::timeout(Duration::from_secs(25),connect(c,&mut status)).await.unwrap_or_else(|_|Err("Core is unavailable".into())) {Ok(s)=>{socket=Some(s);last_frame=Instant::now();log.event("CORE_CONNECTED",status.state);},Err(e)=>{next=failed(&mut status,&e,&log);}},
                    None=>{status.state=State::Unconfigured;status.last_error=Some("SECURE_IDENTITY_UNAVAILABLE".into());}
                }
            },
            message=async{if let Some(s)=socket.as_mut(){s.next().await}else{std::future::pending().await}}=>{
                let result=match message {
                    Some(Ok(Message::Text(text)))=>serde_json::from_str::<Value>(&text).map_err(|_|"Invalid Core response".to_string()).and_then(|v|if v["version"]==1 && v["type"]=="heartbeat"{Ok(())}else{sync(&mut status,&v)}),
                    Some(Ok(Message::Ping(bytes)))=>{if let Some(s)=&mut socket{s.send(Message::Pong(bytes)).await.map_err(|_|"Core is unavailable".to_string())}else{Ok(())}},
                    Some(Ok(Message::Pong(_)))=>Ok(()),
                    _=>Err("Core is unavailable".into()),
                };
                if let Err(e)=result{socket=None;next=failed(&mut status,&e,&log);}else{last_frame=Instant::now();}
            },
            _=heartbeat.tick()=>{
                status.startup=platform::startup(None).unwrap_or_else(|_|"ERROR".into());
                if socket.is_some(){
                    let result=if last_frame.elapsed()>Duration::from_secs(45){Err("Core is unavailable".into())}else if let Some(c)=&mut client{let base=c.saved_core().unwrap_or_default();c.runtime_api(&base,"POST","/api/v1/runtime/heartbeat",status.report()).await.map(|_|())}else{Err("No saved session. Sign in with your passkey.".into())};
                    if let Err(e)=result{socket=None;next=failed(&mut status,&e,&log);}else{status.last_heartbeat_at=Some(utc());}
                }
            }
        }
    }
    socket.take();
    log.event("RUNTIME_STOPPED", State::Offline);
    ipc.abort();
    let _ = ipc.await;
    Ok(())
}
pub fn supervise() -> io::Result<()> {
    let dir = storage::directory()?;
    let _lock = match InstanceLock::acquire(&dir, "supervisor.lock") {
        Ok(v) => v,
        Err(e) if e.kind() == io::ErrorKind::WouldBlock => return Ok(()),
        Err(e) => return Err(e),
    };
    let exe = std::env::current_exe()?;
    let mut attempt = 0;
    loop {
        let started = std::time::Instant::now();
        let result = std::process::Command::new(&exe)
            .arg("--worker")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()?;
        if result.success() {
            return Ok(());
        }
        if started.elapsed() > Duration::from_secs(120) {
            attempt = 0;
        }
        Log::new(dir.clone()).event("WORKER_RESTARTING", State::Error);
        std::thread::sleep(crate::backoff(attempt, entropy()));
        attempt = attempt.saturating_add(1);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sleep_and_session_changes_require_fresh_authority() {
        let mut status = Status {
            state: State::Online,
            sync_sequence: "19".into(),
            ..Status::default()
        };
        assert_eq!(lifecycle(&mut status, Event::Sleep), Lifecycle::Suspend);
        assert_eq!(status.state, State::Suspending);
        assert_eq!(lifecycle(&mut status, Event::Wake), Lifecycle::Reconnect);
        assert_eq!(status.state, State::Connecting);
        assert_eq!(status.sync_sequence, "0");
        assert_eq!(status.wake_generation, 1);
        assert_eq!(
            lifecycle(&mut status, Event::SessionInactive),
            Lifecycle::Suspend
        );
        assert_eq!(
            lifecycle(&mut status, Event::SessionActive),
            Lifecycle::Reconnect
        );
        assert_eq!(status.wake_generation, 2);
        assert_eq!(lifecycle(&mut status, Event::Logout), Lifecycle::Shutdown);
        assert!(!status.execution_available);
    }
    #[test]
    fn sync_rejects_rollback_and_wrong_authority() {
        let id = uuid::Uuid::new_v4();
        let mut status = Status {
            device_id: Some(id),
            ..Status::default()
        };
        let mut v = json!({"version":1,"type":"snapshot","events":[],"snapshot":{"version":1,"sequence":"4","executionAvailable":false,"devices":[{"id":id,"trustState":"trusted"}],"owner":{"securityState":"NORMAL"}}});
        sync(&mut status, &v).unwrap();
        assert_eq!(status.sync_sequence, "4");
        v["snapshot"]["sequence"] = json!("3");
        assert!(sync(&mut status, &v).is_err());
        v["snapshot"]["sequence"] = json!("5");
        v["snapshot"]["runtimePresence"] = json!([{ "executionAvailable":true }]);
        assert!(sync(&mut status, &v).is_err());
    }
}
