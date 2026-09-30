pub mod daemon;
pub mod ipc;
pub mod platform;
pub mod storage;
pub mod voice;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use uuid::Uuid;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum State {
    Unconfigured,
    Starting,
    Connecting,
    Online,
    Degraded,
    Offline,
    Suspending,
    Stopping,
    AuthRequired,
    Revoked,
    UpdateRequired,
    Error,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Status {
    #[serde(default)]
    pub voice: jarvis_voice::VoiceStatus,
    pub version: u8,
    pub instance_id: Uuid,
    pub runtime_version: String,
    pub state: State,
    pub started_at: String,
    pub last_connected_at: Option<String>,
    pub last_heartbeat_at: Option<String>,
    pub device_id: Option<Uuid>,
    pub startup: String,
    pub wake_generation: u64,
    pub reconnect_attempt: u32,
    pub last_error: Option<String>,
    pub security_state: Option<String>,
    pub sync_sequence: String,
    pub platform_observer: bool,
    pub execution_available: bool,
}
impl Default for Status {
    fn default() -> Self {
        Self {
            voice: jarvis_voice::VoiceStatus::default(),
            version: 1,
            instance_id: Uuid::new_v4(),
            runtime_version: env!("CARGO_PKG_VERSION").into(),
            state: State::Starting,
            started_at: utc(),
            last_connected_at: None,
            last_heartbeat_at: None,
            device_id: None,
            startup: "NOT_CONFIGURED".into(),
            wake_generation: 0,
            reconnect_attempt: 0,
            last_error: None,
            security_state: None,
            sync_sequence: "0".into(),
            platform_observer: false,
            execution_available: false,
        }
    }
}
impl Status {
    pub fn report(&self) -> Value {
        json!({"version":1,"runtimeProtocolVersion":2,"instanceId":self.instance_id,"runtimeVersion":self.runtime_version,"build":option_env!("JARVIS_BUILD").unwrap_or("development"),"platform":if cfg!(target_os="macos") {"macos"} else {"windows"},"architecture":if cfg!(target_arch="aarch64") {"arm64"} else {"x64"},"startedAt":self.started_at,"state":self.state,"startup":self.startup,"wakeGeneration":self.wake_generation,"executionAvailable":false,"capabilities":{
            "runtime.lifecycle":"AVAILABLE","runtime.health":"AVAILABLE","runtime.secure_identity":if self.device_id.is_some(){"AVAILABLE"}else{"PERMISSION_REQUIRED"},"runtime.realtime":if self.state==State::Online{"AVAILABLE"}else{"DEGRADED"},"runtime.autostart":match self.startup.as_str(){"ENABLED"=>"AVAILABLE","APPROVAL_REQUIRED"=>"PERMISSION_REQUIRED","UNAVAILABLE"=>"UNAVAILABLE",_=>"DISABLED"},"runtime.sleep_wake":if self.platform_observer{"AVAILABLE"}else{"DEGRADED"},
            "voice.wake_word":if !self.voice.settings.enabled {"DISABLED"}else if self.voice.wake_ready&&self.voice.microphone {"AVAILABLE"}else{"DEGRADED"},"audio.capture":if self.voice.microphone{"AVAILABLE"}else if self.voice.phase==jarvis_voice::Phase::PermissionRequired{"PERMISSION_REQUIRED"}else{"DISABLED"},"screen.capture":"UNAVAILABLE","computer.keyboard":"UNAVAILABLE","computer.mouse":"UNAVAILABLE","computer.apps":"UNAVAILABLE","computer.shell":"UNAVAILABLE","remote.desktop":"UNAVAILABLE"}})
    }
}
pub fn status() -> Status {
    Status::default()
}
pub fn utc() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub fn backoff(attempt: u32, entropy: u32) -> Duration {
    let ceiling = 1000u64.saturating_mul(1u64 << attempt.min(6)).min(60_000);
    Duration::from_millis(ceiling / 2 + u64::from(entropy) % (ceiling / 2 + 1))
}
pub fn classify(error: &str) -> (State, &'static str, bool) {
    match error {
        "Runtime update required" => (State::UpdateRequired, "RUNTIME_UPDATE_REQUIRED", false),
        "Device revoked" => (State::Revoked, "DEVICE_REVOKED", false),
        "Authentication or request rejected" | "No saved session. Sign in with your passkey." => {
            (State::AuthRequired, "AUTH_REQUIRED", false)
        }
        "Core is unavailable" | "Please wait before trying again" => {
            (State::Degraded, "CORE_UNAVAILABLE", true)
        }
        "Invalid Core response" | "Core response too large" => {
            (State::Error, "PROTOCOL_ERROR", true)
        }
        "Security lockdown is active" => (State::Degraded, "LOCKDOWN", false),
        _ => (State::AuthRequired, "SECURE_SESSION_UNAVAILABLE", false),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retries_are_bounded_and_jittered() {
        for a in 0..100 {
            for n in [0, 1, u32::MAX] {
                let d = backoff(a, n);
                assert!(d >= Duration::from_millis(500) && d <= Duration::from_secs(60));
            }
        }
        assert_ne!(backoff(5, 0), backoff(5, 123));
    }
    #[test]
    fn no_future_authority() {
        let s = Status::default();
        let r = s.report();
        assert_eq!(r["executionAvailable"], false);
        for n in [
            "screen.capture",
            "computer.shell",
            "computer.keyboard",
            "computer.mouse",
            "computer.apps",
            "remote.desktop",
        ] {
            assert_eq!(r["capabilities"][n], "UNAVAILABLE");
        }
    }
    #[test]
    fn auth_and_network_failures_differ() {
        assert!(classify("Core is unavailable").2);
        assert!(!classify("Authentication or request rejected").2);
        assert_eq!(classify("Device revoked").0, State::Revoked);
    }
}
