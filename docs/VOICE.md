# Voice and presence — local default, Phase 4 in validation

Fresh installs keep voice disabled. The 2026-10-02 owner decision supersedes the
former paid default: normal voice requires no OpenAI account, API key or credit.
Physical acceptance remains open; see IMPLEMENTATION_STATUS and PHASE4_WORKLOG.

## Pipeline

```text
Native CPAL microphone → bounded mono / echo processing
  → sherpa-onnx Jarvis + independent stop-listening detector
  → post-keyword suffix + subsequent audio → local streaming sherpa STT
  → bounded text → loopback Ollama / pinned Qwen3 4B Instruct
  → streamed sentences → local Kokoro bm_george → speakers + visual telemetry
```

Wake, STT, conversation inference and TTS run on the device. Core still supplies
identity, security state and synchronization. This is local voice processing,
not a claim that every JARVIS subsystem works offline. Loss of current
ONLINE/NORMAL runtime authority, revocation, lockdown or suspension stops capture
and conversation. OpenAI availability is irrelevant to the default path.

Wake audio never leaves the native process. A bounded two-second ring retains
only the verified post-keyword suffix for immediate questions. Wake is not
speaker authentication; false wake can produce an unwanted local conversation.
The independent local stop-listening detector turns voice off. Mute/off stop
capture and invalidate playback immediately, including if saving settings fails.
An unsaved privacy change remains effective in memory and warns before restart.

## Speech recognition

sherpa-onnx 1.13.8 uses the English streaming Zipformer 2023-06-26 int8 model,
two CPU threads and greedy decoding. Partial transcripts update incrementally;
endpointing uses 0.9 seconds of trailing silence after speech, 2.4 seconds for
empty input, and a 20-second utterance boundary. A 22-second absolute feature
bound creates a fresh stream while retaining weights. Audio is processed in
bounded frames; invalid/non-finite samples are rejected. Recognition runs off
OS callbacks, in the native voice worker. Real owner accuracy/pauses/noise need
physical acceptance; synthetic fixtures are separate evidence.

`pnpm voice:stt-models` explicitly downloads the exact archive, checks its SHA-256,
extracts safely into private staging and verifies `crates/voice/stt-models.json`
before promotion. No download occurs from microphone callbacks or ordinary model
loading. Existing wake/TTS installation remains `pnpm voice:models`.

## Local conversation and resources

`pnpm voice:local-setup` installs Ollama 0.35.1 from its platform-specific pinned
release archive, binds only 127.0.0.1:11434, disables Ollama cloud, and installs
`qwen3:4b-instruct-2507-q4_K_M`. The exact manifest digest is
`0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`.
Setup hashes every local model layer. Models/runtime stay in local user storage,
outside Git. An upstream tag change requires an explicit reviewed pin update.

The adapter rechecks the exact installed model digest, disallows proxy/redirects,
sends text only and supplies no tools. There is no configurable executable/model
URL exposed through IPC. A compact original persona addresses the owner as Sir,
uses concise British English and cannot grant execution authority. Model output
is untrusted text, never a command or security decision.

The 4-bit model download is about 2.5 GB. On the current 8 GB Mac, Ollama reported
about 2.87 GB model memory with a 2048-token context. Use one loaded model and
one parallel request, at most 192 output tokens and two-minute idle retention.
Loading is lazy on the first turn; first-token readiness is explicit. No model
warmup delays the UI. STT/wake/TTS weights are retained across conversation turns.
Under memory pressure or a crashed runtime, voice reports a safe error; no cloud
fallback occurs. Retry can restart only the fixed, previously verified local
runtime. Starts are bounded to once per 30 seconds. That per-user process may
outlive a JARVIS restart; idle weights unload independently.

Readiness distinguishes on-demand/not loaded, missing, loading, ready, degraded
and error. A fresh state does not claim inference is ready. Sessions retain at
most six model-history messages and 6000 bytes, expire after 45 seconds awaiting
a new turn and cap total conversation duration. Streams have response/line/text
size limits and a 90-second generation timeout. Cancellation drops the HTTP
request and excludes interrupted assistant text from following history. Epoch-
tagged events prevent old tokens from restoring speech after an interruption.

## Speech and barge-in

Kokoro int8 multi-language v1.0 uses bm_george (speaker 26 of 54), the supplied
British lexicon, 24 kHz output and initial speed 0.96. Mac inference uses four
threads; Windows uses two until measured. Whole sentence/clause jobs begin before
the complete model answer; bounded queues and generation fences cancel stale
synthesis/playback. No cloud TTS fallback or voice imitation is used.

Echo-reduced near-end activity can interrupt queued speech. Local STT continues
capturing the new owner turn; its final text cancels outstanding model generation
and starts a new response. Physical barge-in, voice quality and self-echo rejection
remain required. Synthetic plumbing tests do not prove these acoustic behaviors.

## Privacy, lifecycle and setup

No audio/transcript is saved to settings, Core, audit records or application logs.
Six bounded UI transcript entries and bounded model context are memory-only.
Clear conversation closes its generation/history and clears the visible transcript;
it does not promise immediate zeroization of inference-process/GPU memory.
OS crash dumps and same-user process compromise remain outside this guarantee.

macOS requires both a usage description and the signed audio-input entitlement;
`pnpm desktop:verify-macos` checks the final desktop/helper package. Owner approval
was obtained and nonzero real capture observed. Windows desktop microphone access
and physical voice tests still require device-specific validation. Device changes,
stopped callbacks, invalid audio and overload are distinguished with capped retry.
Restart/sleep/wake always pass through current identity and microphone authority.

## Optional cloud code

The earlier signed Core Realtime broker and native TLS adapter remain isolated,
with their original short-lived credential and allowlist restrictions. The current
runtime default never requests those credentials and exposes no cloud selector.
There is no automatic failover. Historical `credit_balance_exhausted` is preserved
as evidence only and is not a Phase 4 blocker. Enabling a future cloud option
requires explicit privacy/setup work; it is not required to finish this phase.

## Evidence and references

`pnpm voice:local-probe` exercises a fixed synthetic STT → Qwen → Kokoro question
without microphone/private text. Record measured timings in PHASE4_WORKLOG, not
as owner conversation acceptance. The English fixture recognized “TOO” for “TWO”;
the actual recognized text was sent to Qwen, which answered the arithmetic.

- [sherpa streaming Zipformer](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html)
- [Ollama streaming chat](https://docs.ollama.com/api/chat)
- [Ollama resource settings](https://docs.ollama.com/faq)
- [Pinned Qwen variant](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M)

See THIRD_PARTY_VOICE for model/library licenses and distribution limitations.
