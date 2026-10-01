use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub enabled: bool,
    pub muted: bool,
    pub input_device: Option<String>,
    pub output_device: Option<String>,
    pub sensitivity: f32,
    pub speech_rate: f32,
    pub volume: f32,
    pub sound_cues: bool,
    pub greeting: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: false,
            muted: false,
            input_device: None,
            output_device: None,
            sensitivity: 0.5,
            speech_rate: 0.96,
            volume: 0.7,
            sound_cues: true,
            greeting: true,
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), &'static str> {
        if !self.sensitivity.is_finite()
            || !(0.0..=1.0).contains(&self.sensitivity)
            || !self.speech_rate.is_finite()
            || !(0.85..=1.15).contains(&self.speech_rate)
            || !self.volume.is_finite()
            || !(0.0..=1.0).contains(&self.volume)
            || [&self.input_device, &self.output_device].iter().any(|v| {
                v.as_ref().is_some_and(|s| {
                    s.is_empty() || s.len() > 512 || s.chars().any(char::is_control)
                })
            })
        {
            return Err("Voice settings are invalid");
        }
        Ok(())
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Phase {
    Disabled,
    Muted,
    Starting,
    WakeOnly,
    Listening,
    Thinking,
    Speaking,
    Interrupted,
    PermissionRequired,
    Unavailable,
    Degraded,
    AuthRequired,
    Lockdown,
    Suspended,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub id: String,
    pub role: String,
    pub text: String,
    pub final_text: bool,
    pub interrupted: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    pub version: u8,
    pub phase: Phase,
    pub settings: Settings,
    pub microphone: bool,
    pub cloud_audio: bool,
    pub wake_ready: bool,
    pub tts_ready: bool,
    pub provider_connected: bool,
    pub permission: String,
    pub message: String,
    pub input_level: f32,
    pub output_level: f32,
    pub output_bands: [f32; 3],
    pub transcripts: Vec<Transcript>,
    pub generation: u64,
    pub wake_count: u64,
    pub last_wake: Option<String>,
    pub last_first_audio_ms: Option<u64>,
    pub execution_available: bool,
}
impl Default for VoiceStatus {
    fn default() -> Self {
        Self {
            version: 1,
            phase: Phase::Disabled,
            settings: Settings::default(),
            microphone: false,
            cloud_audio: false,
            wake_ready: false,
            tts_ready: false,
            provider_connected: false,
            permission: "NOT_REQUESTED".into(),
            message: "Voice is off. Enable it to set up local wake detection.".into(),
            input_level: 0.0,
            output_level: 0.0,
            output_bands: [0.0; 3],
            transcripts: Vec::new(),
            generation: 0,
            wake_count: 0,
            last_wake: None,
            last_first_audio_ms: None,
            execution_available: false,
        }
    }
}
impl VoiceStatus {
    pub fn transcript(&mut self, id: &str, role: &str, text: &str, final_text: bool) {
        let text: String = text
            .chars()
            .filter(|c| !c.is_control() || *c == '\n')
            .take(500)
            .scan(0usize, |bytes, c| {
                *bytes += c.len_utf8();
                (*bytes <= 1000).then_some(c)
            })
            .collect();
        if let Some(item) = self.transcripts.iter_mut().find(|t| t.id == id) {
            item.text = text;
            item.final_text = final_text;
        } else {
            self.transcripts.push(Transcript {
                id: id.chars().take(80).collect(),
                role: role.into(),
                text,
                final_text,
                interrupted: false,
            });
        }
        if self.transcripts.len() > 6 {
            self.transcripts.remove(0);
        }
    }
    pub fn stop(&mut self, phase: Phase, message: &str) {
        self.generation = self.generation.wrapping_add(1);
        self.phase = phase;
        self.microphone = false;
        self.cloud_audio = false;
        self.provider_connected = false;
        self.input_level = 0.0;
        self.output_level = 0.0;
        self.output_bands = [0.0; 3];
        self.message = message.into();
        for t in &mut self.transcripts {
            if !t.final_text {
                t.interrupted = true;
                t.final_text = true;
            }
        }
    }
}
pub struct WakeGate {
    last: Option<Instant>,
}
impl Default for WakeGate {
    fn default() -> Self {
        Self::new()
    }
}
impl WakeGate {
    pub fn new() -> Self {
        Self { last: None }
    }
    pub fn accept(&mut self, now: Instant, phrase: &str, allowed: bool) -> bool {
        if !allowed
            || !matches!(phrase, "Jarvis" | "Hey Jarvis")
            || self
                .last
                .is_some_and(|t| now.saturating_duration_since(t) < Duration::from_secs(2))
        {
            return false;
        }
        self.last = Some(now);
        true
    }
}
pub fn greeting(hour: u32) -> &'static str {
    match hour {
        5..=11 => "Good morning, Sir.",
        12..=17 => "Good afternoon, Sir.",
        18..=22 => "Good evening, Sir.",
        _ => "Good night, Sir.",
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fresh_voice_never_captures_or_claims_readiness() {
        let s = VoiceStatus::default();
        assert!(!s.microphone && !s.cloud_audio && !s.wake_ready && !s.execution_available);
        assert!(s.transcripts.is_empty());
    }
    #[test]
    fn settings_reject_nonfinite_and_path_sized_device_ids() {
        let mut s = Settings {
            sensitivity: f32::NAN,
            ..Default::default()
        };
        assert!(s.validate().is_err());
        s.sensitivity = 0.5;
        s.input_device = Some("x".repeat(513));
        assert!(s.validate().is_err());
    }
    #[test]
    fn wake_requires_explicit_authority_and_debounces_both_phrases() {
        let mut g = WakeGate::new();
        let now = Instant::now();
        assert!(!g.accept(now, "Jarvis", false));
        assert!(!g.accept(now, "unknown", true));
        assert!(g.accept(now, "Jarvis", true));
        assert!(!g.accept(now, "Hey Jarvis", true));
        assert!(g.accept(now + Duration::from_secs(3), "Hey Jarvis", true));
    }
    #[test]
    fn mute_invalidates_inflight_audio_and_bounds_private_transcript() {
        let mut s = VoiceStatus {
            microphone: true,
            cloud_audio: true,
            phase: Phase::Speaking,
            ..VoiceStatus::default()
        };
        for i in 0..30 {
            s.transcript(&i.to_string(), "owner", &"a".repeat(900), false);
        }
        assert_eq!(s.transcripts.len(), 6);
        assert_eq!(s.transcripts[0].text.len(), 500);
        s.stop(Phase::Muted, "Microphone muted");
        assert!(!s.microphone && !s.cloud_audio);
        assert_eq!(s.generation, 1);
        assert!(s.transcripts.iter().all(|t| t.interrupted));
    }
    #[test]
    fn greeting_uses_defined_time_windows() {
        assert_eq!(greeting(12), "Good afternoon, Sir.");
        assert_eq!(greeting(23), "Good night, Sir.");
    }
}
