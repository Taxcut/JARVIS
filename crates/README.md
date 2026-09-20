# Native boundaries

`identity` implements device Ed25519 keys, Keychain/Credential Manager persistence, canonical signed requests, secure session resume and the system-browser passkey adapter. Its narrow desktop commands never export private keys or refresh credentials. Explicit in-memory stores exist only in tests; production has no plaintext fallback.

`runtime` remains an honest inactive contract. It performs no actions. An independent background service, computer execution, audio/sherpa-onnx, capture and remote access are future phases. Future execution must verify separate scoped, expiring, single-use authorization outside the model. A durable approval or trusted identity is never execution authority.

The ignored native-store roundtrip test uses an isolated entry and removes it. The `owner_setup` example is an explicit local operator validation tool that uses the same native adapter as the desktop, requires real owner passkey confirmation, and never prints credentials. Physical platform outcomes are tracked separately in IMPLEMENTATION_STATUS.
