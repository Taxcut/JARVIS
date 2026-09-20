# Security foundation

## Threat model and scope

Treat model output, websites, messages and device traffic as untrusted. Phase 2 protects the single owner's identity and synchronizes authoritative state. It does not authorize computer execution. A local OS administrator, compromised desktop process or PostgreSQL administrator remains outside this protection boundary. Do not expose Core publicly or deploy the VPS in this phase.

## Bootstrap and passkeys

Core binds `127.0.0.1`. Before any owner exists, the 256-bit environment bearer credential permits only foundation inspection/Core verification and initiation of first-owner registration. The registration requires device Ed25519 proof and a verified, user-verified WebAuthn credential. PostgreSQL enforces one owner with a singleton unique constraint. After creation, the bootstrap token is rejected for all owner APIs, enrollment, recovery and impersonation. Changing that token never resets ownership.

SimpleWebAuthn 14 verifies registration and assertions against the configured exact origin and RP ID with user verification required and resident credentials required for registration. Three-minute challenges are single-use, including failed assertions. Unique credential IDs, COSE public keys, counters, transports and backup/device metadata are persisted; private passkey material is never collected. Counter handling follows the library, including synced credentials with zero counters.

The system browser performs ceremonies on macOS and Windows. JARVIS does not depend on WebAuthn support inside the Tauri webview. Separate random 256-bit browser and native redemption secrets are stored as SHA-256 hashes. The native client proves possession before a browser ceremony becomes active and again at redemption. Browser secrets travel in a fragment, immediately removed from history; the browser receives no owner session or device private key. Browser endpoints require the exact configured Origin. A strict CSP permits locally bundled assets only. No third-party scripts, cookies, redirects or telemetry are used.

Passkey addition requires a purpose-bound grant from an existing passkey. Revocation requires step-up, cannot remove the last active passkey, cancels outstanding ceremonies/grants and revokes other sessions. Renaming does not change authentication authority.

## Device keys and sessions

`crates/identity` uses Ed25519 and native Keychain Services on macOS / Credential Manager on Windows through maintained keyring adapters. Device UUID, private key and resume credential are stored together in the native secure store. Missing storage creates a fresh untrusted identity; corrupt/unavailable storage fails closed. There is no file, environment or browser-storage fallback. Production native storage is supported only on macOS/Windows. Explicit mocks exist solely in tests.

The narrow Tauri commands expose public identity, fixed-route authenticated requests and browser ceremony control. There is no command to export a key/refresh token, sign arbitrary bytes, run a shell or access arbitrary files/URLs. Access tokens remain in Rust memory. OS account security protects the stored device key; device signing itself does not prompt Touch ID. Passkey user verification is the separate human-authentication boundary.

Core stores SHA-256 hashes of random 256-bit access/refresh credentials. Access expires after 15 minutes; refresh/resume has a seven-day idle limit and a 30-day absolute limit. Refresh rotates both credentials transactionally, checks the old refresh hash again under the transaction lock, and never extends absolute expiry. Sessions bind owner, device and security revision. A desktop restart resumes through native storage; lost/corrupt storage requires a valid trusted-device recovery route or owner-authorized re-enrollment, never a bootstrap reset. A crash between server rotation and native persistence may require passkey sign-in again.

## Signing, enrollment and step-up

Protocol v1 binds method, exact path, raw body hash, device/session UUIDs, timestamp, random nonce and correlation UUID. Core validates trust, enrollment, revocation, ownership/session binding, signature and ±60-second skew. PostgreSQL uniqueness makes nonce acceptance race-safe and durable across Core restarts; nonce hashes persist at least 125 seconds. Authentication consumes the nonce before the business transaction, so retrying a failed mutation requires a fresh signature/nonce.

Additional enrollment uses a five-minute high-entropy pairing secret, stored hashed. The new device generates its own key, submits its immutable candidate, proves possession, and awaits an exact enrollment-targeted passkey grant from the owner. The native redemption ceremony lasts three minutes. Approval binds the candidate key/UUID; token reuse, candidate replacement, duplicates, expiry and denial fail closed. Inspect the candidate fingerprint before approving. Enrollment does not grant execution capabilities.

Step-up grants expire after two minutes and bind owner, device, session, operation and exact target. A successful operation consumes its grant in the same transaction; failed/conflicting operations roll back its consumption and may be retried only within that same scope/expiry. Device revocation preserves its record and invalidates its sessions, ceremonies, grants and pending enrollments. Session revocation cancels its grants/ceremonies. WebSocket connections revalidate on committed mutations and heartbeat, so revocation closes them and reconnect is refused.

## Recovery and lockdown

Eight random 256-bit recovery codes are displayed only when generated; Core stores hashes only. Generating/replacing them requires fresh passkey step-up and invalidates all previous codes. A code alone cannot enroll a new device. Recovery requires a still-trusted device key and consumes the code only after proof of possession. A consumed code stays spent even if the subsequent new-passkey ceremony is abandoned. Successful recovery registers a new passkey, revokes prior passkeys/sessions/grants and pending enrollments, and advances owner security revision. Recovery use is audited as CRITICAL. Keep codes offline; no email, PIN, password or security-question fallback exists. Loss of all trusted device keys requires a separately designed offline recovery process; no such reset API is exposed.

NORMAL/LOCKDOWN is persisted on the owner. Entering or leaving requires an exact-target passkey grant. Lockdown cancels pending approvals/enrollments and denies other identity mutations and passkey addition; authentication, inspection, recovery and explicit authenticated unlock remain available. This is groundwork for future runtime enforcement, not a claim that a background execution system exists.

## Audit, approvals and abuse controls

Security transitions and safe sync events commit together. Audit has fixed event types, empty/allowlisted metadata, safe IDs, outcome and risk; no keys, tokens, raw WebAuthn responses or recovery codes enter it. PostgreSQL triggers reject audit update/delete/truncate. These are append-oriented protections, not cryptographic tamper evidence against a DBA. Logs omit raw requests, headers, bodies and exception messages; API errors return fixed messages and tracing IDs.

Durable approval records contain source device, capability, risk, owner-provided safe summary, expiry, revision and idempotent decision context. An approval always has `executionAuthorized: false`, enforced by a database CHECK. There is no executor or command issuer and no LLM approval path. Do not place secrets in approval summaries.

Durable rate buckets bound ceremony preparation/options/assertions, signature validation, refresh, mutations, pairing and recovery. Public authentication buckets are deliberately global for this local single-owner service; a hostile local process can temporarily deny service but cannot bypass authentication. Recovery is limited to five attempts per 15 minutes. The bounded WebSocket service allows 32 connections globally and four per session, 2 KiB handshake frames, a five-second handshake deadline and 1 MiB outbound buffered data. Replay is bounded to 24 hours/approximately 10,000 events. No Redis/Kafka is required.

## Remaining deployment boundaries

Production role separation, TLS/private networking, encrypted off-host backups with tested restores, monitoring, signed installers and OS-specific hardening remain later deployment work. Current configuration supports explicit HTTPS RP/origin settings; the native transport intentionally accepts local Core only in Phase 2. The system-browser native adapter currently constructs the local authentication origin from the configured local port; non-local browser hosting requires a future deployment adapter/configuration review.

Capability policy remains fail-closed: unknown/ungranted, untrusted/revoked or lockdown contexts deny; DENY overrides ASK/ALLOW; only explicitly allowed LOW-risk capabilities avoid ASK. Every policy result still denies execution authority. Voice, telephony, remote desktop, privileged tools and AURA are future phases. Secrets never belong in an LLM prompt. Physical platform validation is recorded separately in IMPLEMENTATION_STATUS.

## Owner configuration document handling

The 2026-09-20 owner document was reconciled into OWNER_CONFIGURATION using only nonsecret preferences, placeholder names and qualified readiness states. Supplied provider credentials were retained only in the ignored mode-0600 local environment through the existing private setup flow; none are exposed to the frontend, audit, CI or Git. These future provider fields are unused in Phase 2. A format-invalid owner phone was not imported. Credential presence is not provider verification and does not enable integrations. Device private keys and refresh material still have no environment/file fallback.

Real owner registration and native session redemption succeeded. Additional owner passkey/Keychain/recovery and authenticated GUI checks remain explicitly deferred; Windows physical validation is pending. Do not weaken checks or claim full physical acceptance from hosted compilation or test credentials.
