# Phase 4 measured performance

These observations are development measurements on the owner's 8 GB Apple Silicon
Mac and the existing Windows validation machine, not a latency guarantee. CPU
samples were taken with other development processes present. No owner audio or
transcript was recorded by these probes.

## Isolated Mac model processes

`resource_probe` loads one component per process and exercises fixed synthetic
input, with no microphone or playback. `/usr/bin/time -l` reports peak resident
memory for the entire probe process, including libraries and model initialization.
It is not an exact allocation breakdown of the long-running worker.

| Component     | Peak resident memory | Load + fixed exercise |
| ------------- | -------------------: | --------------------: |
| sherpa wake   |             62.7 MiB |               1280 ms |
| streaming STT |            180.2 MiB |               1170 ms |
| Kokoro        |            375.7 MiB |               3472 ms |

Kokoro produced 1645 ms of fixed synthetic speech in that probe. Existing Qwen
measurements recorded approximately 2.865 GB of loaded model memory; memory use
also depends on context and runtime caches. The configured context is 2048 tokens,
one loaded model, one concurrent generation and a two-minute keep-alive.

## Recovery and response measurements

The October 10 continuation deliberately stopped only the private loopback Ollama
service while native voice was disabled. The existing local probe restarted the
fixed installed runtime and completed synthetic STT → Qwen → Kokoro without cloud
access or microphone input. STT loaded in 1116 ms, decoded in 120 ms, and produced
its first partial at 780 ms of source audio. Qwen first token was 9796 ms;
first-sentence synthesis took 4488 ms; first audio was ready 15133 ms after STT.
This cold/recovery sample ran alongside development checks and is a material
latency limitation. Earlier warmer samples were faster; neither alone establishes
a reliable latency distribution.

The runtime's later native telemetry showed three wakes, a 289 ms first-token
reading and 5388 ms first-audio reading, followed by DISABLED with microphone off.
These readings are not enough to prove the exact owner's spoken test or perceived
latency. They must not replace the pending physical acceptance matrix.

Windows repeated synthetic inference at 12bc370 passed with STT decode 137 ms,
Qwen first token 4129 ms and first audio ready 6886 ms after STT. The earlier cold
probe failed and remains part of the record. Physical Windows playback is pending.

## Desktop observations

Twelve one-second `ps` samples with High-quality native presence visible averaged
5.41% desktop CPU, 8.10% WebContent CPU, 2.59% WebKit GPU-process CPU and 10.35%
audio-worker CPU. GPU-process CPU is **not GPU utilization**. Observed RSS values
were 24.0, 49.1, 16.4 and 49.7 MiB respectively; compression/paging means these are
not total model footprints. An attempted minimized-window sample was inconclusive
and is not accepted as proof of hidden-window throttling.

The renderer caps quality-specific particle count, pixel ratio, trails and frame
rate; reduced motion renders only changed states/levels. Document visibility and
intersection checks skip hidden/offscreen work. Resize/visibility invalidate the
static frame so a cleared canvas is redrawn. Controlled native hidden/visible,
quality-preset and sleep/wake measurements remain open. No privileged GPU-monitoring
or operating-system security changes were made.
