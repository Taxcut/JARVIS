//! One local audio owner. OS callbacks, model inference and provider I/O have separate bounded queues.
use crate::{
    audio::Audio,
    models::{self, Kokoro, VoiceEngine},
    provider::{Credential, Event},
    Phase, Settings, VoiceStatus, WakeGate,
};
use chrono::Timelike;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tokio::sync::{mpsc as async_channel, oneshot};
pub struct CredentialRequest {
    pub reply: oneshot::Sender<Result<Credential, &'static str>>,
}
pub enum Command {
    Configure(Settings),
    Retry,
    Clear,
    Greet,
    Shutdown,
}
pub type Save = Arc<dyn Fn(&Settings) -> Result<(), &'static str> + Send + Sync>;
pub struct Manager {
    tx: SyncSender<Command>,
    status: Arc<Mutex<VoiceStatus>>,
    authority: Arc<AtomicBool>,
    epoch: Arc<AtomicU64>,
    active: Arc<AtomicBool>,
}
impl Manager {
    pub fn start(
        settings: Settings,
        save: Save,
        credentials: async_channel::Sender<CredentialRequest>,
    ) -> Self {
        let (tx, rx) = mpsc::sync_channel(16);
        let status = Arc::new(Mutex::new(VoiceStatus {
            settings: settings.clone(),
            ..Default::default()
        }));
        let authority = Arc::new(AtomicBool::new(false));
        let epoch = Arc::new(AtomicU64::new(0));
        let active = Arc::new(AtomicBool::new(false));
        let (s, a, e, c) = (
            status.clone(),
            authority.clone(),
            epoch.clone(),
            active.clone(),
        );
        let handle = tokio::runtime::Handle::current();
        std::thread::spawn(move || {
            Worker::new(settings, save, credentials, s, a, e, c, handle).run(rx)
        });
        Self {
            tx,
            status,
            authority,
            epoch,
            active,
        }
    }
    pub fn snapshot(&self) -> VoiceStatus {
        self.status.lock().map(|s| s.clone()).unwrap_or_default()
    }
    pub fn command(&self, command: Command) -> Result<(), &'static str> {
        if let Command::Configure(s) = &command {
            s.validate()?;
        }
        // Muting and disabling invalidate callback playback immediately, ahead of model work.
        if matches!(&command,Command::Configure(s) if !s.enabled||s.muted) {
            self.active.store(false, Ordering::Release);
            self.epoch.fetch_add(1, Ordering::SeqCst);
        }
        self.tx
            .try_send(command)
            .map_err(|_| "Voice is busy; please try again")
    }
    pub fn authority(&self, allowed: bool, phase: Phase) {
        if self.authority.swap(allowed, Ordering::SeqCst) && !allowed {
            self.active.store(false, Ordering::Release);
            self.epoch.fetch_add(1, Ordering::SeqCst);
        }
        if !allowed {
            if let Ok(mut s) = self.status.lock() {
                s.microphone = false;
                s.cloud_audio = false;
                s.provider_connected = false;
                if s.settings.enabled && !s.settings.muted {
                    s.phase = phase;
                    s.message = match phase {
                        Phase::Lockdown => "Voice paused by security lockdown.",
                        Phase::Suspended => "Voice paused while your session is inactive.",
                        _ => "Voice needs a trusted, connected runtime.",
                    }
                    .into();
                }
            }
        }
    }
}
impl Drop for Manager {
    fn drop(&mut self) {
        self.authority.store(false, Ordering::SeqCst);
        self.active.store(false, Ordering::SeqCst);
        self.epoch.fetch_add(1, Ordering::SeqCst);
        let _ = self.tx.try_send(Command::Shutdown);
    }
}
struct SpeechJob {
    text: String,
    generation: u64,
    speed: f32,
}
enum SpeechResult {
    Ready,
    Audio(u64, Result<Vec<f32>, &'static str>),
    Failed(&'static str),
}
fn speech_worker(
    root: PathBuf,
    epoch: Arc<AtomicU64>,
) -> (SyncSender<SpeechJob>, Receiver<SpeechResult>) {
    let (tx, rx) = mpsc::sync_channel::<SpeechJob>(8);
    let (out, result) = mpsc::sync_channel(8);
    std::thread::spawn(move || {
        let engine = match Kokoro::load(&root) {
            Ok(v) => v,
            Err(e) => {
                let _ = out.send(SpeechResult::Failed(e));
                return;
            }
        };
        if out.send(SpeechResult::Ready).is_err() {
            return;
        }
        while let Ok(job) = rx.recv() {
            if epoch.load(Ordering::Acquire) != job.generation {
                continue;
            }
            let audio = engine.synthesize(&job.text, job.speed, epoch.clone(), job.generation);
            if out
                .send(SpeechResult::Audio(job.generation, audio))
                .is_err()
            {
                break;
            }
        }
    });
    (tx, result)
}
struct Connection {
    input: async_channel::Sender<crate::local::Turn>,
    interrupt: async_channel::Sender<()>,
    events: async_channel::Receiver<Event>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Connection {
    fn drop(&mut self) {
        self.task.abort();
    }
}
struct Worker {
    settings: Settings,
    settings_error: Option<&'static str>,
    save: Save,
    _credentials: async_channel::Sender<CredentialRequest>,
    status: Arc<Mutex<VoiceStatus>>,
    authority: Arc<AtomicBool>,
    epoch: Arc<AtomicU64>,
    active: Arc<AtomicBool>,
    handle: tokio::runtime::Handle,
    audio: Option<Audio>,
    wake: Option<sherpa_onnx::KeywordSpotter>,
    stream: Option<sherpa_onnx::OnlineStream>,
    stop_stream: Option<sherpa_onnx::OnlineStream>,
    speech: Option<SyncSender<SpeechJob>>,
    speech_result: Option<Receiver<SpeechResult>>,
    connection: Option<Connection>,
    stt: Option<crate::stt::Recognizer>,
    stt_item: String,
    stt_partial: bool,
    model_check: Option<oneshot::Receiver<Result<(), (crate::ModelState, &'static str)>>>,
    text: String,
    sentence: String,
    response_id: String,
    suppress_response: bool,
    interrupted_id: String,
    gate: WakeGate,
    stream_started: Instant,
    tail: crate::tail::WakeTail,
    woken: Instant,
    last_greeting: Option<Instant>,
    greet_pending: bool,
    retry_at: Instant,
    failures: u32,
    pending_speech: usize,
    voiced: u32,
    first_audio: bool,
}
impl Worker {
    #[allow(clippy::too_many_arguments)]
    fn new(
        settings: Settings,
        save: Save,
        credentials: async_channel::Sender<CredentialRequest>,
        status: Arc<Mutex<VoiceStatus>>,
        authority: Arc<AtomicBool>,
        epoch: Arc<AtomicU64>,
        active: Arc<AtomicBool>,
        handle: tokio::runtime::Handle,
    ) -> Self {
        Self {
            settings,
            settings_error: None,
            save,
            _credentials: credentials,
            status,
            authority,
            epoch,
            active,
            handle,
            audio: None,
            wake: None,
            stream: None,
            stop_stream: None,
            speech: None,
            speech_result: None,
            connection: None,
            stt: None,
            stt_item: uuid::Uuid::new_v4().to_string(),
            stt_partial: false,
            model_check: None,
            text: String::new(),
            sentence: String::new(),
            response_id: String::new(),
            suppress_response: false,
            interrupted_id: String::new(),
            gate: WakeGate::new(),
            stream_started: Instant::now(),
            tail: Default::default(),
            woken: Instant::now(),
            last_greeting: None,
            greet_pending: false,
            retry_at: Instant::now(),
            failures: 0,
            pending_speech: 0,
            voiced: 0,
            first_audio: false,
        }
    }
    fn update(&self, f: impl FnOnce(&mut VoiceStatus)) {
        if let Ok(mut s) = self.status.lock() {
            f(&mut s);
        }
    }
    fn phase(&self, phase: Phase, message: &str) {
        self.update(|s| {
            s.phase = phase;
            s.message = match self.settings_error {
                Some(error) => format!("{message} {error}"),
                None => message.into(),
            };
        });
    }
    fn cancel(&mut self) {
        self.epoch.fetch_add(1, Ordering::SeqCst);
        self.pending_speech = 0;
        self.sentence.clear();
        self.suppress_response = true;
        self.interrupted_id = self.response_id.clone();
        self.update(|s| {
            s.generation = self.epoch.load(Ordering::Acquire);
            for t in &mut s.transcripts {
                if t.role == "assistant" && !t.final_text {
                    t.interrupted = true;
                    t.final_text = true;
                }
            }
        });
        if let Some(c) = &self.connection {
            let _ = c.interrupt.try_send(());
        }
    }
    fn close(&mut self) {
        self.cancel();
        self.connection = None;
        if let Some(stt) = self.stt.as_mut() {
            stt.reset();
        }
        self.stt_partial = false;
        self.tail.clear();
        self.stream = self.wake.as_ref().map(|w| w.create_stream());
        self.stop_stream = self
            .wake
            .as_ref()
            .map(|w| w.create_stream_with_keywords(include_str!("../stop-keywords.txt")));
        self.stream_started = Instant::now();
        self.update(|s| {
            s.provider_connected = false;
            s.cloud_audio = false;
            if matches!(
                s.local_model,
                crate::ModelState::Ready | crate::ModelState::Loading
            ) {
                s.local_model = crate::ModelState::NotLoaded;
            }
        });
    }
    fn halt(&mut self) {
        self.close();
        self.greet_pending = false;
        self.active.store(false, Ordering::Release);
        self.audio = None;
        self.update(|s| {
            s.microphone = false;
            s.input_level = 0.0;
            s.output_level = 0.0;
            s.output_bands = [0.0; 3];
        });
    }
    fn failure(&mut self, message: &'static str) {
        self.halt();
        self.failures = self.failures.saturating_add(1);
        self.retry_at = Instant::now() + Duration::from_secs((5 * self.failures as u64).min(30));
        let permission = message.contains("permission");
        if permission {
            self.failures = 5;
        }
        self.phase(
            if permission {
                Phase::PermissionRequired
            } else {
                Phase::Degraded
            },
            message,
        );
        if permission {
            self.update(|s| s.permission = "REQUIRED".into());
        }
    }
    fn initialize(&mut self) -> Result<(), &'static str> {
        if !crate::permission::ready()? {
            self.update(|s| s.permission = "PENDING".into());
            self.phase(Phase::PermissionRequired, "Allow microphone access in the macOS dialog. Audio stays off until permission is granted.");
            self.retry_at = Instant::now() + Duration::from_millis(250);
            return Ok(());
        }
        if self.model_check.is_none() {
            let (tx, rx) = oneshot::channel();
            self.model_check = Some(rx);
            self.handle.spawn(async move {
                let _ = tx.send(crate::local::installed().await);
            });
        }
        self.phase(
            Phase::Starting,
            "Preparing local wake detection and British voice…",
        );
        if self.wake.is_none() {
            let root = models::model_root()?;
            models::verify(&root)?;
            self.wake = Some(models::wake(&root, self.settings.sensitivity)?);
            if self.speech.is_none() {
                let (speech, result) = speech_worker(root, self.epoch.clone());
                self.speech = Some(speech);
                self.speech_result = Some(result);
            }
            self.update(|s| s.wake_ready = true);
        }
        if self.stt.is_none() {
            self.stt = Some(crate::stt::Recognizer::load(&models::stt_root()?)?);
            self.update(|s| s.stt_ready = true);
        }
        if !self.authority.load(Ordering::Acquire) {
            return Ok(());
        }
        self.stream = self.wake.as_ref().map(|w| w.create_stream());
        self.stop_stream = self
            .wake
            .as_ref()
            .map(|w| w.create_stream_with_keywords(include_str!("../stop-keywords.txt")));
        self.stream_started = Instant::now();
        self.tail.clear();
        self.active.store(true, Ordering::Release);
        self.audio = Some(Audio::open(
            &self.settings,
            self.active.clone(),
            self.epoch.clone(),
        )?);
        self.update(|s| {
            s.microphone = true;
            s.permission = "GRANTED".into();
        });
        self.phase(
            Phase::WakeOnly,
            "Listening locally for Jarvis. No audio is being sent online.",
        );
        Ok(())
    }
    fn cue(&mut self, cue: crate::cues::Cue) -> Result<(), &'static str> {
        if self.settings.sound_cues && self.settings.enabled && !self.settings.muted {
            if let Some(audio) = self.audio.as_mut() {
                audio.play(
                    &crate::cues::render(cue),
                    self.epoch.load(Ordering::Acquire),
                    self.settings.volume,
                )?;
            }
        }
        Ok(())
    }
    fn speak(&mut self, text: String) -> Result<(), &'static str> {
        if text.trim().is_empty() {
            return Ok(());
        }
        let generation = self.epoch.load(Ordering::Acquire);
        self.speech
            .as_ref()
            .ok_or("Local voice is not ready")?
            .try_send(SpeechJob {
                text,
                generation,
                speed: self.settings.speech_rate,
            })
            .map_err(|_| "Speech synthesis fell behind")?;
        self.pending_speech += 1;
        Ok(())
    }
    fn begin(&mut self) {
        if self.connection.is_some() || self.stt.is_none() {
            return;
        }
        self.woken = Instant::now();
        self.first_audio = false;
        self.suppress_response = false;
        if let Some(stt) = self.stt.as_mut() {
            stt.reset();
        }
        self.stt_item = uuid::Uuid::new_v4().to_string();
        self.stt_partial = false;
        let (input, rx) = async_channel::channel(2);
        let (events, out) = async_channel::channel(64);
        let (interrupt, signals) = async_channel::channel(1);
        let task = self
            .handle
            .spawn(crate::local::run(rx, events, signals, self.active.clone()));
        self.connection = Some(Connection {
            input,
            interrupt,
            events: out,
            task,
        });
        self.update(|s| {
            s.wake_count = s.wake_count.saturating_add(1);
            s.last_wake = Some(chrono::Utc::now().to_rfc3339());
            s.cloud_audio = false;
        });
        let _ = self.cue(crate::cues::Cue::Wake);
        self.phase(Phase::Listening, "I’m listening locally, Sir.");
    }
    fn transcribe(&mut self, frame: &[f32]) -> Result<(), &'static str> {
        if self.connection.is_none() {
            return Ok(());
        }
        let update = self
            .stt
            .as_mut()
            .ok_or("Local speech recognition is unavailable")?
            .feed(frame)?;
        if let Some(update) = update {
            if !self.stt_partial {
                self.stt_partial = true;
                self.provider_event(Event::SpeechStarted)?;
            }
            let id = self.stt_item.clone();
            self.provider_event(Event::User(id, update.text.clone(), update.final_text))?;
            if update.final_text {
                self.stt_partial = false;
                self.stt_item = uuid::Uuid::new_v4().to_string();
                if self.connection.is_some() {
                    // A newer owner turn replaces outstanding model output, including
                    // when it has not produced its first token yet.
                    self.cancel();
                    self.provider_event(Event::SpeechStopped)?;
                    self.woken = Instant::now();
                    self.first_audio = false;
                    self.connection
                        .as_ref()
                        .unwrap()
                        .input
                        .try_send(crate::local::Turn {
                            text: update.text,
                            generation: self.epoch.load(Ordering::Acquire),
                        })
                        .map_err(|_| "Local conversation is busy. Please try again.")?;
                }
            }
        }
        Ok(())
    }
    fn provider_event(&mut self, event: Event) -> Result<(), &'static str> {
        match event {
            Event::Generation(generation, event) => {
                if generation == self.epoch.load(Ordering::Acquire) {
                    self.provider_event(*event)?;
                }
            }
            Event::Model(state) => self.update(|s| s.local_model = state),
            Event::FirstToken(ms) => self.update(|s| s.last_first_token_ms = Some(ms)),
            Event::Connected => {
                self.update(|s| {
                    s.provider_connected = true;
                    s.cloud_audio = false;
                });
                self.cue(crate::cues::Cue::Listening)?;
            }
            Event::SpeechStarted => {
                if self.pending_speech > 0 || self.audio.as_ref().is_some_and(|a| a.queued() > 0) {
                    self.cancel();
                }
                self.phase(Phase::Listening, "I’m listening, Sir.");
            }
            Event::SpeechStopped => {
                self.suppress_response = false;
                self.phase(Phase::Thinking, "One moment, Sir.");
            }
            Event::User(id, text, final_text) => {
                self.update(|s| s.transcript(&id, "owner", &text, final_text));
                if text
                    .to_lowercase()
                    .replace([',', '.', '!'], "")
                    .contains("jarvis stop listening")
                {
                    self.configure(Settings {
                        enabled: false,
                        ..self.settings.clone()
                    });
                    self.phase(
                        Phase::Disabled,
                        "Listening stopped. Turn voice on when you’re ready.",
                    );
                }
            }
            Event::Delta(id, delta) => {
                if self.suppress_response || id == self.interrupted_id {
                    return Ok(());
                }
                if id != self.response_id {
                    self.text.clear();
                    self.sentence.clear();
                    self.response_id = id.clone();
                }
                self.text.push_str(&delta);
                self.sentence.push_str(&delta);
                self.update(|s| s.transcript(&id, "assistant", &self.text, false));
                while let Some(part) = take_sentence(&mut self.sentence, false) {
                    self.speak(part)?;
                }
            }
            Event::Done(id, text) => {
                if !self.suppress_response && id != self.interrupted_id {
                    while let Some(part) = take_sentence(&mut self.sentence, true) {
                        self.speak(part)?;
                    }
                    self.update(|s| s.transcript(&id, "assistant", &text, true));
                }
            }
            Event::Ended(message, failed) => {
                self.close();
                if failed {
                    self.cue(crate::cues::Cue::Alert)?;
                }
                self.phase(
                    if failed {
                        Phase::Degraded
                    } else {
                        Phase::WakeOnly
                    },
                    message,
                );
            }
        }
        Ok(())
    }
    fn tick(&mut self) -> Result<(), &'static str> {
        if let Some(check) = self.model_check.as_mut() {
            match check.try_recv() {
                Ok(Err((state, message))) => {
                    self.model_check = None;
                    self.update(|s| s.local_model = state);
                    self.phase(Phase::Degraded, message);
                }
                Ok(Ok(())) | Err(oneshot::error::TryRecvError::Closed) => {
                    self.model_check = None;
                }
                Err(oneshot::error::TryRecvError::Empty) => {}
            }
        }
        for _ in 0..64 {
            let event = self
                .connection
                .as_mut()
                .and_then(|c| c.events.try_recv().ok());
            if let Some(e) = event {
                self.provider_event(e)?;
            } else {
                break;
            }
        }
        for _ in 0..8 {
            let result = self.speech_result.as_ref().and_then(|r| r.try_recv().ok());
            match result {
                Some(SpeechResult::Ready) => self.update(|s| s.tts_ready = true),
                Some(SpeechResult::Failed(e)) => {
                    self.speech = None;
                    self.speech_result = None;
                    self.wake = None;
                    self.update(|s| {
                        s.tts_ready = false;
                        s.wake_ready = false;
                    });
                    return Err(e);
                }
                Some(SpeechResult::Audio(generation, audio)) => {
                    if generation == self.epoch.load(Ordering::Acquire) {
                        self.pending_speech = self.pending_speech.saturating_sub(1);
                        let audio = audio?;
                        if let Some(a) = self.audio.as_mut() {
                            a.play(&audio, generation, self.settings.volume)?;
                            if !self.first_audio {
                                self.first_audio = true;
                                self.update(|s| {
                                    s.last_first_audio_ms =
                                        Some(self.woken.elapsed().as_millis() as u64)
                                });
                            }
                            self.phase(Phase::Speaking, "Speaking, Sir.");
                        }
                    }
                }
                None => break,
            }
        }
        if self.greet_pending
            && self.status.lock().is_ok_and(|s| s.tts_ready)
            && self.connection.is_none()
            && self.status.lock().is_ok_and(|s| s.input_level < 0.012)
            && self.voiced == 0
        {
            self.greet_pending = false;
            self.cue(crate::cues::Cue::Boot)?;
            self.last_greeting = Some(Instant::now());
            self.woken = Instant::now();
            let hour = chrono::Utc::now()
                .with_timezone(&chrono_tz::America::New_York)
                .hour();
            if self.settings.greeting {
                self.speak(crate::greeting(hour).into())?;
            }
        }
        let Some(audio) = self.audio.as_mut() else {
            return Ok(());
        };
        if audio.devices_changed(&self.settings) {
            return Err("Audio devices changed. Reconnecting to your selected devices…");
        }
        match audio.failure.load(Ordering::Acquire) {
            1 => return Err("Microphone permission is required"),
            3 => return Err("Microphone processing fell behind. Reconnecting audio…"),
            4 => {
                return Err(
                    "The microphone supplied invalid audio. Reconnect it or select another input.",
                )
            }
            5 => return Err("The microphone buffer is unsupported. Select another input."),
            6 => return Err("The audio format changed. Reconnecting…"),
            7 => return Err("An audio device is busy. Reconnecting…"),
            8 => return Err("The system audio service reported a failure. Reconnecting…"),
            2.. => return Err("An audio device changed or stopped. Reconnecting…"),
            _ => {}
        }
        let level = f32::from_bits(audio.output_level.load(Ordering::Relaxed));
        let bands =
            std::array::from_fn(|i| f32::from_bits(audio.output_bands[i].load(Ordering::Relaxed)));
        let queued = audio.queued();
        let frames = audio.read()?;
        self.update(|s| {
            s.output_level = level;
            s.output_bands = bands;
            if queued == 0 && self.pending_speech == 0 && s.phase == Phase::Speaking {
                s.phase = if self.connection.is_some() {
                    Phase::Listening
                } else {
                    Phase::WakeOnly
                };
                s.message = if self.connection.is_some() {
                    "I’m listening, Sir."
                } else {
                    "Listening locally for Jarvis."
                }
                .into();
            }
        });
        for frame in frames {
            if !self.authority.load(Ordering::Acquire) || !self.active.load(Ordering::Acquire) {
                break;
            }
            let rms = (frame.iter().map(|x| x * x).sum::<f32>() / 160.0).sqrt();
            self.update(|s| s.input_level = rms);
            if rms > 0.025 {
                self.voiced = self.voiced.saturating_add(1);
            } else {
                self.voiced = 0;
            }
            if self.voiced >= 18 && (queued > 0 || self.pending_speech > 0) {
                self.cancel();
                self.phase(Phase::Interrupted, "Go ahead, Sir.");
                self.voiced = 0;
            }
            self.tail.push(&frame);
            let mut keyword = None;
            let mut wake_end = None;
            if let (Some(wake), Some(stream)) = (&self.wake, &self.stream) {
                stream.accept_waveform(16000, &frame);
                while wake.is_ready(stream) {
                    wake.decode(stream);
                    if let Some(r) = wake.get_result(stream) {
                        if !r.keyword.is_empty() {
                            keyword = Some(r.keyword.replace('_', " "));
                            wake_end = r.timestamps.last().map(|last| (r.start_time, *last));
                            wake.reset(stream);
                        }
                    }
                }
            }
            if let (Some(wake), Some(stream)) = (&self.wake, &self.stop_stream) {
                stream.accept_waveform(16000, &frame);
                while wake.is_ready(stream) {
                    wake.decode(stream);
                    if let Some(r) = wake.get_result(stream) {
                        if r.keyword == "Stop_listening" {
                            keyword = Some("Stop listening".into());
                            wake.reset(stream);
                        }
                    }
                }
            }
            if keyword.as_deref() == Some("Stop listening") {
                self.configure(Settings {
                    enabled: false,
                    ..self.settings.clone()
                });
                self.phase(
                    Phase::Disabled,
                    "Listening stopped. Turn voice on when you’re ready.",
                );
                break;
            }
            let recording = self.connection.is_some();
            if recording {
                self.transcribe(&frame)?;
            }
            if let Some(phrase) = keyword {
                if self.gate.accept(
                    Instant::now(),
                    &phrase,
                    !recording && queued == 0 && self.pending_speech == 0,
                ) {
                    self.begin();
                    if self.connection.is_some() {
                        if let Some((start, last)) = wake_end {
                            let tail = self.tail.after(start, last);
                            self.transcribe(&tail)?;
                        }
                    }
                }
            }
        }
        if self.stream_started.elapsed() > Duration::from_secs(30) {
            self.stream = self.wake.as_ref().map(|w| w.create_stream());
            self.stop_stream = self
                .wake
                .as_ref()
                .map(|w| w.create_stream_with_keywords(include_str!("../stop-keywords.txt")));
            self.stream_started = Instant::now();
            self.tail.clear();
        }
        Ok(())
    }
    fn configure(&mut self, settings: Settings) {
        if settings.validate().is_err() {
            return;
        }
        if (self.save)(&settings).is_err() {
            // Disk failure must never undo an owner's immediate privacy choice.
            // Keep mute/off in memory even though persistence needs another retry.
            if !settings.enabled || settings.muted {
                self.halt();
                self.settings.enabled = settings.enabled;
                self.settings.muted = settings.muted;
                self.update(|s| s.settings = self.settings.clone());
            }
            self.settings_error =
                Some("This change could not be saved. Retry before restarting JARVIS.");
            self.phase(Phase::Degraded, "Voice settings need attention.");
            return;
        }
        self.settings_error = None;
        let sensitivity = settings.sensitivity != self.settings.sensitivity;
        let restart = sensitivity
            || settings.enabled != self.settings.enabled
            || settings.muted != self.settings.muted
            || settings.input_device != self.settings.input_device
            || settings.output_device != self.settings.output_device;
        if restart {
            self.halt();
        }
        self.settings = settings;
        self.update(|s| s.settings = self.settings.clone());
        if sensitivity {
            self.wake = None;
        }
        self.failures = 0;
        self.retry_at = Instant::now();
    }
    fn run(mut self, commands: Receiver<Command>) {
        loop {
            for _ in 0..16 {
                match commands.try_recv() {
                    Ok(Command::Shutdown) | Err(mpsc::TryRecvError::Disconnected) => {
                        self.halt();
                        return;
                    }
                    Ok(Command::Configure(settings)) => {
                        self.configure(settings);
                    }
                    Ok(Command::Retry) => {
                        self.halt();
                        self.failures = 0;
                        self.retry_at = Instant::now();
                    }
                    Ok(Command::Clear) => {
                        self.close();
                        self.update(|s| s.transcripts.clear());
                        if self.audio.is_some() {
                            self.phase(
                                Phase::WakeOnly,
                                "Conversation cleared. Listening locally for Jarvis.",
                            );
                        }
                    }
                    Ok(Command::Greet) => {
                        if (self.settings.greeting || self.settings.sound_cues)
                            && self
                                .last_greeting
                                .is_none_or(|t| t.elapsed() > Duration::from_secs(1800))
                        {
                            self.greet_pending = true;
                        }
                    }
                    Err(mpsc::TryRecvError::Empty) => break,
                }
            }
            if !self.settings.enabled
                || self.settings.muted
                || !self.authority.load(Ordering::Acquire)
            {
                if self.audio.is_some() || self.connection.is_some() {
                    self.halt();
                }
                if !self.settings.enabled {
                    self.phase(
                        Phase::Disabled,
                        "Voice is off. Your microphone is not in use.",
                    );
                } else if self.settings.muted {
                    self.phase(
                        Phase::Muted,
                        "Microphone muted. No audio is being captured.",
                    );
                }
            } else if self.audio.is_some() && !self.active.load(Ordering::Acquire) {
                // A brief authority loss can invalidate callbacks between worker ticks.
                // Reopen only through the normal current-authority checks next tick.
                self.halt();
            } else if self.audio.is_none() {
                if self.failures < 5 && Instant::now() >= self.retry_at {
                    if let Err(e) = self.initialize() {
                        self.failure(e);
                    }
                }
            } else if let Err(e) = self.tick() {
                self.failure(e);
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}
/// Split at sentence punctuation or a bounded whitespace boundary, preserving UTF-8.
pub fn take_sentence(buffer: &mut String, finish: bool) -> Option<String> {
    if buffer.is_empty() {
        return None;
    }
    let mut boundary = None;
    for (i, c) in buffer.char_indices() {
        if matches!(c, '.' | '?' | '!' | '\n') && (i > 12 || finish) {
            boundary = Some(i + c.len_utf8());
            break;
        }
        if i >= 220 && c.is_whitespace() {
            boundary = Some(i + c.len_utf8());
            break;
        }
        if i >= 700 {
            boundary = Some(i);
            break;
        }
    }
    let end = boundary.or(if finish { Some(buffer.len()) } else { None })?;
    Some(buffer.drain(..end).collect())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn failed_settings_write_does_not_undo_mute_or_disable() {
        for mute in [false, true] {
            let settings = Settings {
                enabled: true,
                ..Default::default()
            };
            let status = Arc::new(Mutex::new(VoiceStatus::default()));
            let active = Arc::new(AtomicBool::new(true));
            let (credentials, _requests) = async_channel::channel(1);
            let mut worker = Worker::new(
                settings.clone(),
                Arc::new(|_| Err("storage unavailable")),
                credentials,
                status.clone(),
                Arc::new(AtomicBool::new(true)),
                Arc::new(AtomicU64::new(0)),
                active.clone(),
                tokio::runtime::Handle::current(),
            );
            worker.configure(Settings {
                enabled: mute,
                muted: mute,
                ..settings
            });
            assert!(!active.load(Ordering::Acquire));
            assert!(!worker.settings.enabled || worker.settings.muted);
            worker.phase(
                if mute { Phase::Muted } else { Phase::Disabled },
                "Microphone is off.",
            );
            let snapshot = status.lock().unwrap();
            assert!(!snapshot.microphone);
            assert!(!snapshot.settings.enabled || snapshot.settings.muted);
            assert!(snapshot.message.contains("could not be saved"));
        }
    }
    #[tokio::test]
    async fn cancelled_local_tokens_cannot_resume_speech_or_transcript() {
        let status = Arc::new(Mutex::new(VoiceStatus::default()));
        let (credentials, mut requests) = async_channel::channel(1);
        let mut worker = Worker::new(
            Settings::default(),
            Arc::new(|_| Ok(())),
            credentials,
            status.clone(),
            Arc::new(AtomicBool::new(true)),
            Arc::new(AtomicU64::new(7)),
            Arc::new(AtomicBool::new(true)),
            tokio::runtime::Handle::current(),
        );
        worker
            .provider_event(Event::Generation(
                6,
                Box::new(Event::Delta("old".into(), "Must not speak.".into())),
            ))
            .unwrap();
        worker
            .provider_event(Event::Generation(
                6,
                Box::new(Event::Done("old".into(), "Must not speak.".into())),
            ))
            .unwrap();
        assert!(status.lock().unwrap().transcripts.is_empty());
        assert_eq!(worker.pending_speech, 0);
        assert!(requests.try_recv().is_err());
        worker.provider_event(Event::Connected).unwrap();
        assert!(!status.lock().unwrap().cloud_audio);
    }
    #[test]
    fn speech_chunks_preserve_unicode_and_limits() {
        let original = "Good afternoon, Sir. How may I help? ".repeat(50);
        let mut buffer = original.clone();
        let mut result = String::new();
        while let Some(part) = take_sentence(&mut buffer, true) {
            assert!(part.len() <= 1024);
            result.push_str(&part);
        }
        assert_eq!(result, original);
        let mut unicode = "界".repeat(600);
        while let Some(part) = take_sentence(&mut unicode, true) {
            assert!(part.len() <= 703);
        }
    }
}
