# Voice and presence — Phase 4 implementation in validation

Voice is explicitly disabled on a fresh install. Enable it in the trusted desktop
only after installing verified local models. This phase adds conversation, not
computer execution. Physical acceptance remains tracked in IMPLEMENTATION_STATUS.

## Architecture and privacy

```text
Native microphone → bounded mono conversion → local echo processing
  → sherpa-onnx Jarvis detector + independent stop-listening detector
  → verified post-keyword suffix + subsequent conversation audio
  → signed Core credential request → fixed OpenAI Realtime TLS connection
  → streaming text → local Kokoro / bm_george → native output + amplitude/bands
```

Before wake, microphone audio remains local. A two-second ring recovers only the
suffix after the detected keyword timestamp, preventing a generic ambient pre-roll
upload. False wakes can still send subsequent ambient speech; wake detection is
not speaker authentication. Use mute or disable voice in private situations.
“Jarvis, stop listening” is recognized locally; the short “stop listening” privacy
command also disables capture without requiring a cloud response.

Mute, disable, suspend, loss of runtime authority and lockdown invalidate playback
and stop capture. Queued provider packets check the same atomic capture fence.
An already-in-flight network packet cannot be recalled. Disabling closes streams
and discards pending audio. No transcripts or audio are written to the database,
settings, audit events or application logs. Six bounded transcript items remain in
native memory and can be cleared. UI polling pauses rapid updates when hidden;
closing the dashboard does not stop the independently supervised voice runtime.
The operating system's microphone indicator remains authoritative for capture.

## Conversation boundary

Core holds `OPENAI_API_KEY` in private backend configuration. Only a current scoped
runtime session on a NORMAL trusted device can call `POST /api/v1/voice/session`.
Core validates authority before and after credential issuance and rate limits the
route. React never receives the provider credential. Native code accepts only
allowlisted models and the fixed OpenAI TLS endpoint. The default verified model
is `gpt-realtime-2.1`; explicit compatible alternatives are schema-bound.

The credential expires after 60 seconds; this does not terminate an established
connection or make provider session configuration an execution security boundary.
Sessions have a five-minute absolute limit and 45-second inactivity limit. Text
output, empty tools, semantic VAD and English input transcription are requested.
Native code verifies the text-only/no-tools session before uploading buffered
speech. Input transcription deltas and finalized text remain distinct. Provider
billing, rate limits and disconnects produce safe actionable degraded messages.

Local speech activity can immediately cancel playback. A separate priority
channel cancels provider generation; it cannot wait behind the audio queue.
Unheard assistant text is removed from provider history because a text-only
response cannot be truncated by spoken-audio duration. Echo cancellation uses
Sonora's WebRTC AEC3 implementation. Physical echo, noise and barge-in acceptance
are still required; synthetic tests cannot establish acoustic performance.

## Local models and speech

Use the standard native preparation command before Cargo builds. It verifies the
pinned sherpa-onnx 1.13.8 native archive. `pnpm voice:models` explicitly downloads
and verifies the pinned wake and Kokoro archives plus individual asset hashes.
There is no download on normal startup. Models live in the current user's local
application-data directory under `com.taxcut.jarvis/voice/models`, outside Git.

Wake uses the int8 GigaSpeech Zipformer 3.3M pack. A terminal Jarvis rule recognizes
both “Jarvis” and “Hey Jarvis”; overlapping full-phrase rules were removed after
synthetic missed-wake testing. Sensitivity, debounce and duplicate suppression are
bounded. Streams are periodically recreated to bound feature memory. Kokoro uses
the int8 multilingual v1.0 pack, British lexicon, voice index 26 (`bm_george`) and
0.96 initial pace. The `VoiceEngine` boundary permits later platform optimization.
The current Mac and Windows providers are native ONNX CPU; no MLX or automatic
system-voice substitution is claimed. Failure is explicit and retryable.

A fixed-phrase Apple Silicon comparison measured approximately 4.10–4.16 seconds
with two inference threads versus 3.34–3.35 seconds with four for about 3.12 seconds
of generated audio, with the current local runtime active. Mac now uses four;
Windows retains two pending local measurement. The one-thread experiment produced
audio that failed output validation and was rejected before playback; it is not a supported default.
These are synthesis observations, not end-to-end conversational latency. The
fixed-phrase probe includes cancellation checks and never reads the microphone.

Speech is queued incrementally at sentence/size boundaries. Generation tokens
invalidate old synthesis results and playback immediately on interruption. Native
callbacks do no inference, disk or networking. Capture/output queues and text are
bounded; non-finite samples are rejected. Device IDs are selectable and checked
every two seconds, including changes to system defaults. Device errors retry at
most five times with bounded delay; permission failures require explicit retry.

## Presentation

The persona addresses the owner as Sir, with concise, calm British presentation
and restrained original humor. It must not copy film dialogue or imitate an actor.
Startup greeting uses America/New_York, a runtime cooldown and silence check; it
does not repeat on ordinary focus or connection telemetry updates. Original quiet
additive tones cover startup, wake, listening and provider failure. They use the
selected output volume and respect sound-cue disable, microphone mute and voice
disable. A disabled voice system does not open a microphone merely for a cue.

The procedural body maps actual native states, output amplitude and frequency
bands; the isolated visual fixture is excluded from the production build. See
DESIGN for motion, accessibility, render budgets and brand assets.

## Current blockers and references

The actual credential endpoint and TLS connection succeeded, but the provider
returned `credit_balance_exhausted`. Owner API billing correction is pending;
no successful live conversation or physical barge-in is claimed.

- [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI input transcription events](https://developers.openai.com/api/docs/guides/realtime-transcription)
- [sherpa-onnx Kokoro model and speaker mapping](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html)

## Physical microphone follow-up

The owner reported no response to the real stop-listening test. macOS now checks
AVFoundation audio permission explicitly; successful stream creation alone is
insufficient. Pending access is shown as pending and capture stays off. A
three-second callback watchdog and distinct bounded-buffer errors make failures
actionable without retaining audio. A deterministic test confirms resampling
and echo processing preserve near-end audio in silence. Actual wake/stop-listening,
output and barge-in acceptance are still required after installing this correction.
