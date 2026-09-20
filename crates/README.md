# Native boundaries

`runtime` defines the honest not-configured runtime contract used by the desktop shell. It performs no actions. Closing the desktop closes only this UI process; an independent background runtime/service is future work, not currently installed.

Future `device`, `security`, `audio`, `wakeword`, `capture`, and `remote` crates are documented boundaries, not empty packages. Device enrollment will bind public keys to owners; private keys stay in Keychain on macOS and DPAPI/Credential Manager on Windows. Native execution must verify scoped, expiring, single-use authorization outside the model. Audio, capture and remote OS permissions will be requested only when implemented and explicitly enabled.
