//! Bounded native audio I/O. Callbacks never perform inference, networking or disk I/O.
use crate::Settings;
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    FromSample, Sample, SampleFormat, SizedSample,
};
use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering},
        mpsc::{self, Receiver, SyncSender},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub input: bool,
    pub output: bool,
}
pub fn devices() -> Result<Vec<Device>, &'static str> {
    let host = cpal::default_host();
    let list = host
        .devices()
        .map_err(|_| "Audio devices are unavailable")?;
    Ok(list
        .take(24)
        .filter_map(|d| {
            Some(Device {
                id: d.id().ok()?.to_string(),
                name: d.description().ok()?.name().chars().take(100).collect(),
                input: d.supports_input(),
                output: d.supports_output(),
            })
        })
        .collect())
}
struct Playback {
    generation: u64,
    samples: VecDeque<f32>,
}
pub struct Audio {
    _input: cpal::Stream,
    _output: cpal::Stream,
    input: Receiver<Vec<f32>>,
    render: Receiver<Vec<f32>>,
    input_resampler: Convert,
    render_resampler: Convert,
    pub failure: Arc<AtomicU8>,
    pub output_level: Arc<AtomicU32>,
    pub output_bands: Arc<[AtomicU32; 3]>,
    playback: Arc<Mutex<Playback>>,
    output_rate: u32,
    input_id: String,
    output_id: String,
    device_check: Instant,
    last_capture: Instant,
    capture_pending: VecDeque<f32>,
    render_pending: VecDeque<f32>,
    apm: sonora::AudioProcessing,
}
struct Convert {
    resampler: SincFixedIn<f32>,
    pending: VecDeque<f32>,
    chunk: usize,
}
impl Convert {
    fn new(rate: u32) -> Result<Self, &'static str> {
        if !(8000..=192000).contains(&rate) {
            return Err("This audio sample rate is unsupported");
        }
        let chunk = (rate / 100) as usize;
        let params = SincInterpolationParameters {
            sinc_len: 128,
            f_cutoff: 0.9,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 128,
            window: WindowFunction::BlackmanHarris2,
        };
        Ok(Self {
            resampler: SincFixedIn::new(16000.0 / f64::from(rate), 1.0, params, chunk, 1)
                .map_err(|_| "Audio conversion is unavailable")?,
            pending: VecDeque::with_capacity(chunk * 3),
            chunk,
        })
    }
    fn push(&mut self, samples: &[f32], out: &mut VecDeque<f32>) -> Result<(), &'static str> {
        if samples.len() > 8192 || samples.iter().any(|v| !v.is_finite()) {
            return Err("Audio input exceeded its buffer limit");
        }
        self.pending.extend(samples.iter().copied());
        while self.pending.len() >= self.chunk {
            let frame: Vec<f32> = self.pending.drain(..self.chunk).collect();
            let converted = self
                .resampler
                .process(&[frame], None)
                .map_err(|_| "Audio conversion failed")?;
            out.extend(converted[0].iter().copied());
        }
        if out.len() > 16000 {
            out.clear();
            return Err("Audio processing fell behind; reconnect the microphone");
        }
        Ok(())
    }
}
fn choose(
    host: &cpal::Host,
    id: &Option<String>,
    input: bool,
) -> Result<cpal::Device, &'static str> {
    match id {
        Some(id) => host
            .devices()
            .ok()
            .and_then(|mut ds| ds.find(|d| d.id().ok().is_some_and(|v| v.to_string() == *id))),
        None => {
            if input {
                host.default_input_device()
            } else {
                host.default_output_device()
            }
        }
    }
    .ok_or(if input {
        "Selected microphone is unavailable"
    } else {
        "Selected speaker is unavailable"
    })
}
fn mark_failure(e: cpal::Error, f: &AtomicU8) {
    // CPAL reports advisory events through the same callback as fatal errors.
    // Xrun is a transient glitch; DeviceChanged already rerouted the stream;
    // RealtimeDenied leaves playback active. Reopening on these can create a
    // self-sustaining overload/retry loop. The capture watchdog and device check
    // still detect genuinely stalled or disconnected streams.
    let code = match e.kind() {
        cpal::ErrorKind::Xrun
        | cpal::ErrorKind::DeviceChanged
        | cpal::ErrorKind::RealtimeDenied => return,
        cpal::ErrorKind::PermissionDenied => 1,
        cpal::ErrorKind::StreamInvalidated => 6,
        cpal::ErrorKind::DeviceBusy => 7,
        cpal::ErrorKind::BackendError => 8,
        _ => 2,
    };
    f.store(code, Ordering::Release);
}
fn input_stream<T: Sample + SizedSample>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    tx: SyncSender<Vec<f32>>,
    active: Arc<AtomicBool>,
    failure: Arc<AtomicU8>,
) -> Result<cpal::Stream, cpal::Error>
where
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    let fail = failure.clone();
    device.build_input_stream(
        config,
        move |data: &[T], _| {
            if !active.load(Ordering::Acquire) {
                return;
            }
            if data.len() / channels > 8192 {
                fail.store(5, Ordering::Release);
                return;
            }
            let mono: Vec<f32> = data
                .chunks_exact(channels)
                .map(|f| {
                    f.iter()
                        .map(|x| x.to_sample::<f32>().clamp(-1.0, 1.0))
                        .sum::<f32>()
                        / channels as f32
                })
                .collect();
            if mono.iter().any(|v| !v.is_finite()) {
                fail.store(4, Ordering::Release);
            } else if tx.try_send(mono).is_err() {
                fail.store(3, Ordering::Release);
            }
        },
        move |e| mark_failure(e, &failure),
        Some(Duration::from_secs(2)),
    )
}
struct OutputState {
    playback: Arc<Mutex<Playback>>,
    active: Arc<AtomicBool>,
    epoch: Arc<AtomicU64>,
    level: Arc<AtomicU32>,
    bands: Arc<[AtomicU32; 3]>,
    render: SyncSender<Vec<f32>>,
    failure: Arc<AtomicU8>,
}
fn output_stream<T: Sample + SizedSample + FromSample<f32>>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    s: OutputState,
) -> Result<cpal::Stream, cpal::Error> {
    let channels = config.channels as usize;
    let rate = config.sample_rate as f32;
    let mut low = 0.0f32;
    let mut mid = 0.0f32;
    let fail = s.failure.clone();
    device.build_output_stream(
        config,
        move |data: &mut [T], _| {
            let mut reference = Vec::with_capacity((data.len() / channels).min(8192));
            let mut sum = 0.0;
            let mut energy = [0.0f32; 3];
            let mut queue = s.playback.try_lock().ok();
            if let Some(q) = queue.as_mut() {
                if q.generation != s.epoch.load(Ordering::Acquire)
                    || !s.active.load(Ordering::Acquire)
                {
                    q.samples.clear();
                }
            }
            for frame in data.chunks_exact_mut(channels) {
                let x = if s.active.load(Ordering::Acquire) {
                    queue
                        .as_mut()
                        .and_then(|q| q.samples.pop_front())
                        .unwrap_or(0.0)
                } else {
                    0.0
                };
                for value in frame {
                    *value = T::from_sample(x);
                }
                if reference.len() < 8192 {
                    reference.push(x);
                }
                sum += x * x;
                low += (x - low) * (800.0 / rate).min(1.0);
                mid += (x - mid) * (6000.0 / rate).min(1.0);
                energy[0] += low * low;
                energy[1] += (mid - low).powi(2);
                energy[2] += (x - mid).powi(2);
            }
            let n = reference.len().max(1) as f32;
            s.level.store((sum / n).sqrt().to_bits(), Ordering::Relaxed);
            for (i, part) in energy.iter().enumerate() {
                s.bands[i].store((part / n).sqrt().to_bits(), Ordering::Relaxed);
            }
            let _ = s.render.try_send(reference);
        },
        move |e| mark_failure(e, &fail),
        Some(Duration::from_secs(2)),
    )
}
impl Audio {
    pub fn open(
        settings: &Settings,
        active: Arc<AtomicBool>,
        epoch: Arc<AtomicU64>,
    ) -> Result<Self, &'static str> {
        let host = cpal::default_host();
        let mic = choose(&host, &settings.input_device, true)?;
        let speaker = choose(&host, &settings.output_device, false)?;
        let ic = mic
            .default_input_config()
            .map_err(|_| "Microphone configuration is unavailable")?;
        let oc = speaker
            .default_output_config()
            .map_err(|_| "Speaker configuration is unavailable")?;
        let ir = ic.sample_rate();
        let or = oc.sample_rate();
        let (tx, input) = mpsc::sync_channel(32);
        let (render_tx, render) = mpsc::sync_channel(32);
        let failure = Arc::new(AtomicU8::new(0));
        let output_level = Arc::new(AtomicU32::new(0));
        let output_bands = Arc::new([AtomicU32::new(0), AtomicU32::new(0), AtomicU32::new(0)]);
        let playback = Arc::new(Mutex::new(Playback {
            generation: epoch.load(Ordering::Acquire),
            samples: VecDeque::new(),
        }));
        let input_stream = match ic.sample_format() {
            SampleFormat::F32 => {
                input_stream::<f32>(&mic, ic.config(), tx, active.clone(), failure.clone())
            }
            SampleFormat::I16 => {
                input_stream::<i16>(&mic, ic.config(), tx, active.clone(), failure.clone())
            }
            SampleFormat::I32 => {
                input_stream::<i32>(&mic, ic.config(), tx, active.clone(), failure.clone())
            }
            SampleFormat::U16 => {
                input_stream::<u16>(&mic, ic.config(), tx, active.clone(), failure.clone())
            }
            _ => return Err("Microphone sample format is unsupported"),
        }
        .map_err(|e| {
            if e.kind() == cpal::ErrorKind::PermissionDenied {
                "Microphone permission is required"
            } else {
                "Microphone could not start"
            }
        })?;
        let s = OutputState {
            playback: playback.clone(),
            active,
            epoch,
            level: output_level.clone(),
            bands: output_bands.clone(),
            render: render_tx,
            failure: failure.clone(),
        };
        let output_stream = match oc.sample_format() {
            SampleFormat::F32 => output_stream::<f32>(&speaker, oc.config(), s),
            SampleFormat::I16 => output_stream::<i16>(&speaker, oc.config(), s),
            SampleFormat::I32 => output_stream::<i32>(&speaker, oc.config(), s),
            SampleFormat::U16 => output_stream::<u16>(&speaker, oc.config(), s),
            _ => return Err("Speaker sample format is unsupported"),
        }
        .map_err(|_| "Speaker could not start")?;
        input_stream
            .play()
            .map_err(|_| "Microphone could not start")?;
        output_stream
            .play()
            .map_err(|_| "Speaker could not start")?;
        let config = sonora::Config {
            echo_canceller: Some(sonora::config::EchoCanceller::default()),
            ..Default::default()
        };
        let stream = sonora::StreamConfig::new(16000, 1);
        Ok(Self {
            _input: input_stream,
            _output: output_stream,
            input,
            render,
            input_resampler: Convert::new(ir)?,
            render_resampler: Convert::new(or)?,
            failure,
            output_level,
            output_bands,
            playback,
            output_rate: or,
            input_id: mic
                .id()
                .map_err(|_| "Microphone identity is unavailable")?
                .to_string(),
            output_id: speaker
                .id()
                .map_err(|_| "Speaker identity is unavailable")?
                .to_string(),
            device_check: Instant::now(),
            last_capture: Instant::now(),
            capture_pending: VecDeque::new(),
            render_pending: VecDeque::new(),
            apm: sonora::AudioProcessing::builder()
                .config(config)
                .capture_config(stream)
                .render_config(stream)
                .build(),
        })
    }
    pub fn devices_changed(&mut self, settings: &Settings) -> bool {
        if self.device_check.elapsed() < Duration::from_secs(2) {
            return false;
        }
        self.device_check = Instant::now();
        let host = cpal::default_host();
        let id = |input| {
            choose(
                &host,
                if input {
                    &settings.input_device
                } else {
                    &settings.output_device
                },
                input,
            )
            .ok()
            .and_then(|d| d.id().ok())
            .map(|id| id.to_string())
        };
        id(true).as_deref() != Some(&self.input_id) || id(false).as_deref() != Some(&self.output_id)
    }
    pub fn read(&mut self) -> Result<Vec<[f32; 160]>, &'static str> {
        for _ in 0..32 {
            match self.render.try_recv() {
                Ok(data) => self
                    .render_resampler
                    .push(&data, &mut self.render_pending)?,
                Err(_) => break,
            }
        }
        while self.render_pending.len() >= 160 {
            let data: Vec<f32> = self.render_pending.drain(..160).collect();
            let mut out = [0.0; 160];
            self.apm
                .process_render_f32(&[&data], &mut [&mut out])
                .map_err(|_| "Echo processing failed")?;
        }
        for _ in 0..32 {
            match self.input.try_recv() {
                Ok(data) => {
                    self.last_capture = Instant::now();
                    self.input_resampler
                        .push(&data, &mut self.capture_pending)?;
                }
                Err(_) => break,
            }
        }
        let mut frames = Vec::new();
        if self.last_capture.elapsed() > Duration::from_secs(3) {
            return Err("The microphone stopped delivering audio. Check microphone access and reconnect audio.");
        }
        while self.capture_pending.len() >= 160 {
            let data: Vec<f32> = self.capture_pending.drain(..160).collect();
            let mut out = [0.0; 160];
            self.apm
                .process_capture_f32(&[&data], &mut [&mut out])
                .map_err(|_| "Echo processing failed")?;
            frames.push(out);
        }
        Ok(frames)
    }
    pub fn queued(&self) -> usize {
        self.playback.lock().map(|q| q.samples.len()).unwrap_or(0)
    }
    pub fn play(
        &mut self,
        samples: &[f32],
        generation: u64,
        volume: f32,
    ) -> Result<(), &'static str> {
        if samples.len() > 24000 * 30
            || samples.iter().any(|v| !v.is_finite())
            || !volume.is_finite()
        {
            return Err("Speech audio was invalid");
        }
        let output = resample_playback(samples, 24000, self.output_rate);
        let mut p = self
            .playback
            .lock()
            .map_err(|_| "Speaker queue is unavailable")?;
        if p.generation != generation {
            p.samples.clear();
            p.generation = generation;
        }
        if p.samples.len() + output.len() > self.output_rate as usize * 30 {
            return Err("Speech queue is full");
        }
        p.samples
            .extend(output.into_iter().map(|v| (v * volume).clamp(-0.95, 0.95)));
        Ok(())
    }
}
pub fn resample_playback(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if input.is_empty() {
        return Vec::new();
    }
    let n = input.len() as u64 * u64::from(to) / u64::from(from);
    let ratio = f64::from(from) / f64::from(to);
    (0..n as usize)
        .map(|i| {
            let pos = i as f64 * ratio;
            let a = pos as usize;
            let b = (a + 1).min(input.len() - 1);
            let fraction = (pos - a as f64) as f32;
            input[a] * (1.0 - fraction) + input[b] * fraction
        })
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn advisory_audio_events_do_not_destroy_a_live_stream_or_clear_failure() {
        for initial in [0, 1, 2] {
            let failure = AtomicU8::new(initial);
            for kind in [
                cpal::ErrorKind::Xrun,
                cpal::ErrorKind::DeviceChanged,
                cpal::ErrorKind::RealtimeDenied,
            ] {
                mark_failure(cpal::Error::new(kind), &failure);
                assert_eq!(failure.load(Ordering::Acquire), initial);
            }
        }
        let failure = AtomicU8::new(0);
        mark_failure(
            cpal::Error::new(cpal::ErrorKind::PermissionDenied),
            &failure,
        );
        assert_eq!(failure.load(Ordering::Acquire), 1);
        mark_failure(
            cpal::Error::new(cpal::ErrorKind::DeviceNotAvailable),
            &failure,
        );
        assert_eq!(failure.load(Ordering::Acquire), 2);
        mark_failure(
            cpal::Error::new(cpal::ErrorKind::StreamInvalidated),
            &failure,
        );
        assert_eq!(failure.load(Ordering::Acquire), 6);
    }
    #[test]
    fn local_capture_preserves_near_end_audio_without_playback() {
        let stream = sonora::StreamConfig::new(16000, 1);
        let mut apm = sonora::AudioProcessing::builder()
            .config(sonora::Config {
                echo_canceller: Some(sonora::config::EchoCanceller::default()),
                ..Default::default()
            })
            .capture_config(stream)
            .render_config(stream)
            .build();
        let mut converter = Convert::new(48000).unwrap();
        let mut pending = VecDeque::new();
        let mut energy = 0.0;
        for block in 0..100 {
            let input: Vec<f32> = (0..480)
                .map(|i| ((block * 480 + i) as f32 * 0.07).sin() * 0.1)
                .collect();
            converter.push(&input, &mut pending).unwrap();
            while pending.len() >= 160 {
                let frame: Vec<f32> = pending.drain(..160).collect();
                let mut output = [0.0; 160];
                apm.process_render_f32(&[&[0.0; 160]], &mut [&mut output])
                    .unwrap();
                apm.process_capture_f32(&[&frame], &mut [&mut output])
                    .unwrap();
                energy += output.iter().map(|v| v * v).sum::<f32>();
            }
        }
        assert!(energy > 1.0, "near-end microphone audio was suppressed");
    }
    #[test]
    fn resampler_is_bounded_and_preserves_duration() {
        let input = vec![0.25; 2400];
        let output = resample_playback(&input, 24000, 48000);
        assert_eq!(output.len(), 4800);
        assert!(output.iter().all(|v| (*v - 0.25).abs() < 0.0001));
        assert!(resample_playback(&[], 24000, 48000).is_empty());
    }
}
