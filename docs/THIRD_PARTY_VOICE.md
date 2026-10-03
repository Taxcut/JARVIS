# Phase 4 voice and visual asset provenance

This is an inventory for the private development build, not a completed public
binary redistribution review. Cargo.lock and pnpm-lock.yaml pin code dependencies;
voice model manifests and the native archive verifier pin downloaded assets.

| Component                                   | Source and license evidence                                                             | Use                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| sherpa-onnx 1.13.8                          | [Apache-2.0 source license](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/LICENSE) | Native keyword/TTS inference wrapper                                                |
| Kokoro-82M v1.0                             | [Publisher model card, Apache-2.0](https://huggingface.co/hexgrad/Kokoro-82M)           | The pinned sherpa int8 multilingual conversion; George speaker 26                   |
| eSpeak NG                                   | [Upstream GPLv3 COPYING](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING)    | Native release archive contains libespeak-ng; the Kokoro pack includes phoneme data |
| Sora / Manrope                              | OFL files alongside the bundled fonts                                                   | Self-hosted interface typography                                                    |
| JARVIS master                               | Owner-selected image, unchanged                                                         | App/window branding and generated packaging icons                                   |
| Compact J, navigation glyphs and sound cues | Original project derivatives/code                                                       | Tiny branding, interface navigation and native feedback                             |

Do not describe the entire native voice stack as permissively licensed merely
because the top-level sherpa and Kokoro projects use Apache-2.0. The verified
native archive also contains ONNX Runtime, eSpeak NG, phonemizer, sentencepiece,
Kaldi/FST, PortAudio and other static libraries. Before distributing a public
installer, inventory the precise linked transitive components and data, retain
required notices and meet applicable source/license obligations. The current
private app build and unmerged PR do not claim that release review is finished.

No commercial font, stock visual, copied fictional-assistant asset, third-party
sound recording or voice-cloning training data was added. Procedural body fixtures
are isolated test inputs and are never shipped as operational data.

Local-default additions: Ollama 0.35.1 (MIT, including its separately licensed
inference dependencies), Qwen3-4B-Instruct-2507 (Apache-2.0 model family) quantized
Q4_K_M via the pinned Ollama manifest, and sherpa English streaming Zipformer
2023-06-26 converted from the referenced icefall LibriSpeech model. Exact download
hashes live in setup code and `stt-models.json`; weights and downloaded archives
remain outside Git. Preserve upstream licenses in installed archives. This
private-development inventory does not close the existing public-distribution
license/source-obligation review.
