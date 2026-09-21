# Voice boundary — not implemented

Planned path:

```text
Microphone → local sherpa-onnx wake-word detector
  → “Jarvis” / “Hey Jarvis” → wake arbitration
  → OpenAI Realtime → semantic VAD → interruptible conversation
```

Audio before activation remains local. Future activation indicators, explicit microphone permission, cross-device wake arbitration, cancellation, speech-to-speech and interruption/barge-in are required. Phase 2 has no microphone access, audio capture, wake model or provider connection. Provider credentials supplied by the owner are held privately for later setup; their presence does not enable voice.

Personality uses “Sir”, adaptive short/medium/long responses, a refined, competent, calm tone and optional subtle dry humor. Use original language and a legally distinct provider voice; never clone Paul Bettany or copy movie dialogue. Wake phrases are represented in the personality schema today; detection is not implemented. Provider keys belong in secure backend/device configuration, never the frontend bundle.

## Owner-selected output — planned only

The owner selected `bm_george`, a British English male voice listed in the [official Kokoro voice catalogue](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md). Preserve it as the future output preference. OpenAI Realtime remains the planned conversation provider; Kokoro synthesis is a separate output adapter, not an OpenAI voice identifier. The voice phase must verify how streamed conversation text, synthesis latency, cancellation and barge-in work together before claiming this preference is supported. Do not silently substitute another voice or download/run a model in Phase 2. Heavy inference must respect the constrained VPS plan and be placed on suitable device/worker hardware after measurement.

The owner reports sherpa-onnx and the wake model are not installed and custom keywords are not configured. Install/download/configure them in the authorized voice phase. See [OWNER_CONFIGURATION](OWNER_CONFIGURATION.md) for sanitized readiness and preferences.
