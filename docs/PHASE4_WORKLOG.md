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

## Still required at the initial checkpoint (superseded below)

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

## Refined checkpoint — 2026-10-01

Implemented native original sound cues, bounded priority provider cancellation,
partial transcripts, authority checks on queued upload, finite/sample/UTF-8
limits, selected/default device hotplug detection, private staged model install
with digest verification before promotion and a retained previous-directory
backup. Added persistent startup/motion/quality preferences, original navigation
icons, platform-appropriate tray icons, explicit design tokens, accessible
source-deduplicated inline notices, small/Retina/web brand assets and six isolated
pixel baselines. The approved master stays unchanged.

Verification: 49 TypeScript tests and all static/build checks pass. Workspace
Clippy with warnings denied and 28 Rust tests pass; one existing physical secret
store test is intentionally ignored. All six fresh visual captures match reviewed
baselines exactly. Hosted Validate 36683188583 is successful on the earlier
18d922b checkpoint, not automatically on these later changes.

The four-thread Mac Kokoro fixed-phrase benchmark measured about 3.35 seconds of
synthesis for 3.12 seconds of output, compared with about 4.1 seconds at two
threads. One-thread output failed validation. This is still slower than the
streaming product target; first audible output and interruption need actual
conversation measurement. Windows retains two threads until measured there.

Owner Keychain approval restored the helper and an explicit dashboard quit/reopen
restored LIVE with the same worker. The owner's spoken stop-listening check failed
(no response). Zero input and later audio-device degradation were observed.
Opening a CPAL stream had incorrectly been treated as sufficient permission
proof. macOS now checks AVFoundation authorization before opening capture and
waits asynchronously for the native permission dialog. Further distinctions for
buffer overrun/invalid samples/oversize buffers and missing callbacks support
honest diagnostics. Physical validation remains open; this correction alone is
not proof of the exact original failure cause.

No provider retry follows a model-usage reset: API billing is a separate unresolved
owner action. Windows pnpm install remains blocked by untrusted junction policy;
security protections stay enabled. Native compilation on the real PC passed at
18d922b. Updated native tests/models and hosted CI are next. No merge, Prompt #5,
new operational fixtures, owner credential reset or execution capability.

The corrected signed Mac app was built, verified and installed as a complete
bundle, with the prior bundle preserved locally. The dashboard restored LIVE
identity. After Start runtime, the helper reports STARTING with capture/cloud
audio off while secure-storage approval is pending. The owner is away; no
password was requested, accepted or stored. Continue protected approval and
physical microphone checks when the owner returns. Supplied-secret/high-confidence
scans passed for candidate files and reachable history; private .env remains
ignored with mode 0600.

Privacy-write failure follow-up: a mute/off request remains effective in memory
even if saving settings fails. Capture stays off and an actionable warning remains
visible; successful retry clears it. A regression test covers both mute and
disable against a failing settings store. Pending startup speech is cancelled by
privacy/lifecycle shutdown, and sound cues can remain enabled independently of
the optional spoken greeting. Voice tests now total 13 on macOS.

## Local-default continuation — 2026-10-02

Owner explicitly replaced the paid default with sherpa streaming STT → local
Qwen3 4B Instruct-class inference → Kokoro. Preserve the prior implementation and
original Prompt #4 acceptance checklist; do not restart or introduce Prompt #5.
OpenAI credit is no longer a blocker or required owner action. Keep any retained
cloud adapter optional and inactive by default.

The installed package lacked the hardened-runtime audio-input entitlement. Added
the narrow entitlement to desktop/helper; both signatures and hardened runtime
now verify. The owner then approved Keychain and the actual microphone dialog.
Status showed GRANTED, nonzero input, ONLINE and both local wake/TTS models ready.
The prior failed physical stop test is not overwritten; its retest is pending.
Voice was turned off through the app while replacing the cloud-default path.

The package verifier rejects absent signed entitlements; the manual macOS package
workflow now builds/verifies the actual app. A refused OS permission callback no
longer leaves the app indefinitely pending. UI headings reflect permission,
lockdown and degraded states truthfully. 50 TypeScript tests/static/build checks,
13 targeted voice Rust tests and Clippy passed; supplied-secret/history scan passed.

Real Gaming PC at 9a242d3 passed full workspace Clippy, 28 native tests and the
native desktop/runtime build. Model execution did not complete before SSH became
unreachable; frontend artifacts were built on Mac due the documented Windows
pnpm junction policy. No Windows physical voice success is claimed.

Next: implement pinned streaming STT and a bounded local conversation adapter,
benchmark Qwen on this 8 GB Mac, update setup/privacy/readiness, then rerun the
changed-stack gates and physical acceptance. Do not merge PR #4.

## Local stack implementation checkpoint — 2026-10-02

Implemented streaming int8 English Zipformer STT, fixed-loopback Ollama adapter,
pinned Qwen3 4B Instruct Q4_K_M and local sentence-first Kokoro. The retained cloud
broker/adapter is never selected by the default worker. Capture/security authority
is unchanged. Local model streams are bounded and generation-tagged; interrupted
assistant text is excluded from subsequent history. Clear conversation drops the
model session as well as UI transcript. The spoken stop path now uses the same
fail-closed settings persistence path as the mute/off controls.

Explicit setup verifies Ollama 0.35.1 platform archives, Qwen manifest and every
local model layer. STT gets a separate pinned manifest and staged installer.
Missing/loading/ready/degraded/error model status is typed through IPC. A fixed
verified local runtime may restart on demand, with no arbitrary process/URL/model
argument exposed to the frontend. Model inference is lazy, bounded to 2048 context,
192 output tokens, one concurrent model and a two-minute idle retention.

Synthetic measurement (Mac, 8 GB): STT model load 1167 ms; 3602 ms arithmetic
fixture decoded in 133 ms, first partial at 780 ms of audio. Actual recognition was
“what is too plus two”. Qwen received that text and answered four, but added a
clarification; do not claim perfect transcription/persona. First token 1164 ms,
first sentence synthesis 3528 ms for 2665 ms output, first sentence ready 5710 ms
after STT. Earlier cold first-token samples were roughly 3.7–4.9 seconds; Ollama
reported 2865674321 bytes of model memory at 2048 context. This is not yet physical
wake-to-answer latency or voice-quality acceptance. Whole-answer TTS had been
slower; the new probe exercises the same sentence splitting as the controller.

Verification: 50 TypeScript tests and static/build gates, 19 isolated PostgreSQL
integration tests, full workspace Clippy and 33 Mac Rust tests passed (17 voice,
6 identity, 10 runtime; one physical secure-store test intentionally ignored).
The new cancellation regression rejects stale local tokens and never marks cloud
audio active. Synthetic local inference needs no paid provider. Remaining: build
and install this checkpoint, owner-only protected approvals/physical conversation,
Windows local-stack checks, expanded visual/product/accessibility/performance
acceptance and final security/CI. The Gaming PC became reachable again; no OS
security protection was changed. The owner may sleep; do not require a password or
block independent work while waiting for their return.

## Windows and product continuation — 2026-10-04

Hosted Validate 37088715100 passed Linux, macOS and Windows on e8ea51a. The real
Windows machine passed Clippy, 32 native tests and the updated native build.
Ollama setup initially encountered the OS-blocked PowerShell archive module.
Using the built-in Windows tar extractor succeeded without changing OS policy.
The optional --archive input reuses a downloaded archive only after the same
pinned SHA-256 verification. No model/runtime versions changed.

First silent Windows local probe: recognition dropped “what”, first token 49121 ms,
arithmetic answer assertion failed. A repeated probe recognized “what is too plus
two”, answered four and completed synthesis: STT load 1639 ms, decode 121 ms for
3602 ms audio, first partial at 780 ms, Qwen first token 2957 ms, first sentence
Kokoro 3294 ms for 2972 ms audio, post-STT first audio ready 6488 ms. The probe now
prints its fixed synthetic answer before the assertion to make failure diagnosable.
No microphone, speaker, owner transcript or cloud API was used. The initial failure
and cold latency remain open; physical Windows voice is still unvalidated.

Added consequence/reversal/passkey confirmation to device/passkey/session
revocation, enrollment approval, recovery replacement and lockdown. An isolated
fixture verified Cancel default focus, Escape cancellation with zero callbacks,
focus restoration and one callback after confirmation. Settings/loading fixtures
use no connected services or audio. Boot now assembles a point, ring and opposing
arcs before the approved mark; existing readiness/skip/reduced-motion gates remain.

The owner requested silence during class: native voice stayed DISABLED, microphone
and cloud audio false. They subsequently authorized audio again. After the reported
power interruption, Core health and ONLINE native state were verified; no claim of
a controlled reboot or sleep/resume acceptance is made from those observations.

### Native local audio follow-up

Installed the verified local bundle and owner approved Keychain and microphone.
ONLINE, GRANTED, wake/STT/TTS ready and real nonzero input were observed; startup
registration was restored. Native wake count and local first-token telemetry
(3771 ms) advanced, but audio subsequently entered a device-failure retry state.
No successful spoken conversation is claimed without the owner's result.

Code review found CPAL 0.18.2 advisory Xrun, automatically handled DeviceChanged
and RealtimeDenied events were all treated as fatal stream errors. These now leave
a live stream intact. Real permission/disconnect/invalidation failures still stop
audio; the existing hotplug checks, bounded queues and capture watchdog remain.
This fixes a concrete recovery defect; the old generic error did not identify
which CPAL event occurred, so it is not proof of the physical failure's exact cause.
A regression covers advisories preserving live state and preexisting failures,
plus permission, device removal and stream invalidation. All 18 voice tests and
voice Clippy passed. The full signed Mac bundle is rebuilt for physical retesting.
