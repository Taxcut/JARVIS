# Voice boundary — not implemented

Planned path:

```text
Microphone → local sherpa-onnx wake-word detector
  → “Jarvis” / “Hey Jarvis” → wake arbitration
  → OpenAI Realtime → semantic VAD → interruptible conversation
```

Audio before activation remains local. Future activation indicators, explicit microphone permission, cross-device wake arbitration, cancellation, speech-to-speech and interruption/barge-in are required. No microphone access, audio capture, wake model, provider connection or credentials are configured in Phase 2.

Personality uses “Sir”, adaptive short/medium/long responses, a refined, competent, calm tone and optional subtle dry humor. Use original language and a legally distinct provider voice; never clone Paul Bettany or copy movie dialogue. Wake phrases are represented in the personality schema today; detection is not implemented. Provider keys belong in secure backend/device configuration, never the frontend bundle.
