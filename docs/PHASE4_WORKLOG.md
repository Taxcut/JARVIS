# Phase 4 working record

Prompt #4 is in progress on `feat/phase4-voice-cinematic`, based on main
`be25b3c723e8c2460055c86d0337a3c9324d80b0`. Phase 3 remains merged and
approved. Prompt #5 is not started. This record is not acceptance evidence.

## Decisions in implementation

- Native Rust audio and local sherpa-onnx keyword spotting own microphone input.
  Voice is disabled on fresh installation. No ambient audio goes to a provider
  before a recognized wake phrase. Disable, mute, lockdown, expired authority,
  suspend and shutdown invalidate pending output and close provider transport.
- Core holds the durable OpenAI key. A signed runtime-only request obtains a
  60-second Realtime client credential, kept native and never returned to React.
  The configured session uses text responses, semantic VAD and no tools. An
  ephemeral credential is not an execution authorization boundary: provider
  session options can be overridden by a credential holder. JARVIS exposes no
  arbitrary execution capability.
- Local Kokoro int8 v1.0 uses the documented `bm_george` speaker index 26,
  British lexicon and initial speed 0.96. ONNX is the shared Mac/Windows adapter;
  an MLX adapter remains optional pending measured justification. No automatic
  cloud TTS fallback. The pinned archive reports 54 speakers through the C API,
  despite the upstream overview saying 53; the archive README explains the
  added final speaker. Existing indices are unchanged and the manifest pins
  this exact model.
- Models live outside Git. Download digests and individual file hashes are
  checked. Native sherpa release archives are also pinned and verified before the
  standard runtime preparation/build command.
- Owner-approved branding source was located in Downloads:
  `futuristic_holographic_j_emblem.png`; an unchanged copy is in desktop public
  assets. Preserve its angular, icy-blue holographic J.
- Transcripts remain bounded in native memory and are not persisted or logged.
  UI visibility does not authorize microphone capture. Runtime identity and
  authority remain those established in Phases 2 and 3.

## Verified so far

- Current OpenAI model discovery: configured account can access
  `gpt-realtime-2.1`; this is not a paid conversation or physical voice test.
- Core credential-boundary unit tests: 3 passing, Core typecheck passing.
- Voice state unit tests: 5 passing; native audio dependencies compile on Mac.
- Wake and Kokoro archives downloaded and digest-verified on this Mac.
- Standard-user SSH to the prepared Windows machine succeeds; no security
  policy has been changed.

## Still required

Native controller and provider integration; bounded input/output and barge-in;
model installation and dependency integrity workflow; lifecycle/authority tests;
UI, branding, procedural body, accessibility and visual regression; actual Mac
microphone permission and spoken acceptance; Windows build/remote checks;
full quality gates, hosted CI, security review, secret scan and an unmerged PR.
Do not claim Phase 4 complete until these gates have real evidence.

## References

- [Realtime client secrets](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create)
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Kokoro models and speaker mapping](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html)

## Second checkpoint

Native controller, signed credential delegation and protocol 2 are integrated.
Voice settings persist privately beside runtime state; transcripts and all audio
remain in memory. A bounded local ring recovers only the verified post-keyword
suffix for immediate follow-on speech. Capture and playback queues are bounded,
playback is generation-cancelled, provider sessions expire after five minutes or
45 seconds without speech/response activity, and retries are capped.

The homepage now uses procedural WebGL particles/trails and four actual render
budgets, with local fonts and the approved master icon. Voice/privacy/transcript
panels consume native status. Settings and boot are implemented but remain under
product review. Native icons were regenerated with Tauri's packaging tool.

Verification: all TypeScript/static/build gates passed before the small system
phase/setup label update; 19 isolated PostgreSQL integration tests passed;
9 runtime unit tests and 10 voice tests passed; targeted Core/UI tests passed.
Synthetic Jarvis, Hey Jarvis, immediate-question and two negative fixtures pass.
Expanded local stop/OOV tests, live provider probe, physical acceptance, Windows,
visual regression, performance refinement and hosted CI remain pending.

Observed local Kokoro synthesis: approximately 1.4 seconds for a 0.95-second
phrase; 2.7 seconds for a 2.25-second phrase. These are model probe measurements,
not conversational latency acceptance. Further tuning is needed. Models loaded
in about 2.6 seconds in release mode. No microphone test has yet occurred.

## Live provider check — owner action outstanding

The actual Realtime credential endpoint issued a short-lived credential and the
TLS WebSocket opened. The provider then returned `credit_balance_exhausted`.
No successful model conversation, streaming response or physical barge-in is
claimed. The owner has been asked to correct API billing; credentials and billing
data were not printed. Native UI now has a specific safe billing message and
waits for the provider's safe session configuration before sending queued audio.
A fixed synthetic arithmetic probe is available after the owner confirms billing.

The expanded local probe now also passes stop-listening and an out-of-vocabulary
sentence. The stop detector recognizes the short privacy command independently
of the wake-prefix graph, including the acoustically similar "stopped listening"
variant; false activation of this command disables capture rather than granting
any authority. The new Mac app is installed with the previous bundle backed up
outside Git. Existing owner sign-in resumed successfully, without resetting data.

The signed `.app` bundle succeeds. The optional DMG decoration script failed;
no distributable DMG is claimed. Apple notarization is not configured. Structural
UI snapshots cover six real state mappings; pixel review/regression and physical
voice acceptance are still outstanding.
