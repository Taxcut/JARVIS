# Security foundation

## Threat model and scope

Treat model output, websites, messages and device traffic as untrusted. Phase 3 preserves the single owner's identity and adds a restricted background runtime. It does not authorize computer execution. A local OS administrator, compromised desktop process or PostgreSQL administrator remains outside this protection boundary. Do not expose Core publicly or deploy the VPS in this phase.

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

NORMAL/LOCKDOWN is persisted on the owner. Entering or leaving requires an exact-target passkey grant. Lockdown cancels pending approvals/enrollments and denies other identity mutations and passkey addition; authentication, inspection, recovery and explicit authenticated unlock remain available. The runtime observes lockdown through authoritative sync and cannot provision a replacement runtime session during lockdown. Inspection/presence may continue; execution remains unavailable in every state.

## Audit, approvals and abuse controls

Security transitions and safe sync events commit together. Audit has fixed event types, empty/allowlisted metadata, safe IDs, outcome and risk; no keys, tokens, raw WebAuthn responses or recovery codes enter it. PostgreSQL triggers reject audit update/delete/truncate. These are append-oriented protections, not cryptographic tamper evidence against a DBA. Logs omit raw requests, headers, bodies and exception messages; API errors return fixed messages and tracing IDs.

Durable approval records contain source device, capability, risk, owner-provided safe summary, expiry, revision and idempotent decision context. An approval always has `executionAuthorized: false`, enforced by a database CHECK. There is no executor or command issuer and no LLM approval path. Do not place secrets in approval summaries.

Durable rate buckets bound ceremony preparation/options/assertions, signature validation, refresh, mutations, pairing and recovery. Public authentication buckets are deliberately global for this local single-owner service; a hostile local process can temporarily deny service but cannot bypass authentication. Recovery is limited to five attempts per 15 minutes. The bounded WebSocket service allows 32 connections globally and four per session, 2 KiB handshake frames, a five-second handshake deadline and 1 MiB outbound buffered data. Replay is bounded to 24 hours/approximately 10,000 events. No Redis/Kafka is required.

## Remaining deployment boundaries

Production role separation, TLS/private networking, encrypted off-host backups with tested restores, monitoring, signed installers and OS-specific hardening remain later deployment work. Current configuration supports explicit HTTPS RP/origin settings; the native transport intentionally accepts local Core only in Phase 3. The system-browser native adapter currently constructs the local authentication origin from the configured local port; non-local browser hosting requires a future deployment adapter/configuration review.

Capability policy remains fail-closed: unknown/ungranted, untrusted/revoked or lockdown contexts deny; DENY overrides ASK/ALLOW; only explicitly allowed LOW-risk capabilities avoid ASK. Every policy result still denies execution authority. Voice, telephony, remote desktop, privileged tools and AURA are future phases. Secrets never belong in an LLM prompt. Physical platform validation is recorded separately in IMPLEMENTATION_STATUS.

## Owner configuration document handling

The 2026-09-20 owner document was reconciled into OWNER_CONFIGURATION using only nonsecret preferences, placeholder names and qualified readiness states. Supplied provider credentials were retained only in the ignored mode-0600 local environment through the existing private setup flow; none are exposed to the frontend, audit, CI or Git. These future provider fields are unused in Phase 2. A format-invalid owner phone was not imported. Credential presence is not provider verification and does not enable integrations. Device private keys and refresh material still have no environment/file fallback.

Real macOS acceptance passed on 2026-09-20/21: owner-approved Keychain access, native restart with stable device identity and rotated resume session, additional real passkey sign-in, revoked-session denial, authenticated GUI and Core reconnect. Recovery setup used fresh purpose-bound passkey verification; the owner saved and hid the replacement set privately. Replacement removed the previous hashes, and eight unused hashes remain. No raw codes were captured. Consuming a code to replace the working passkey was not physically exercised; integration tests cover that path and the all-trusted-device-loss limitation is unchanged. Windows Hello/Credential Manager physical acceptance is intentionally deferred by the owner, not failed. See IMPLEMENTATION_STATUS for exact evidence.

Realtime shutdown releases its LISTEN connection in preClose before the owner closes the database pool; reconnect acquisition checks the stopping flag. This prevents the physical shutdown deadlock without extending session lifetime or permitting protected traffic after revocation. Native UI changes remain disabled while synchronization is degraded/offline.

## Phase 3 runtime security review

The worker reads the existing device UUID/key, never creates or silently enrolls a device, and stores only its separate resume session in `com.taxcut.jarvis.runtime.v1` / `session`. The dashboard keeps its original resume entry. Both use the same server expiry, rotation, signed-request, durable nonce and revocation rules. Runtime scope permits only snapshot, sync ticket, refresh, compatibility and presence routes. Provisioning requires an authenticated owner session on that device and is denied in lockdown; it replaces the previous runtime session. Neither the React bridge nor runtime IPC exposes arbitrary signing or owner mutations. Revocation is reported specifically only after proof of the revoked device key and bound credential; unverifiable callers receive generic denial.

macOS IPC uses an owner-only directory, mode-0600 Unix socket and peer UID checks in both directions. Windows uses an explicit current-user SID DACL, rejects remote pipe clients, reserves the first pipe instance and verifies the server process SID before sending any credentials. Client identification-level impersonation prevents a pipe server from acquiring an impersonation token with broader power. Frames are limited to 16 KiB, concurrency to eight and queues to eight, with deadlines and unknown-field rejection. The fixed command set is status/reconnect/stop/native provisioning. UI provisioning responses contain status only, never session credentials.

Locks are kernel-backed, not PID-file guesses. Logs contain fixed codes, safe states/timestamps and correlation UUIDs, with a 1 MiB active file and three retained rotations. Native HTTP/WS response bounds are 2 MiB. Core heartbeats update one current row and the bounded replay stream; they do not append an audit row unless lifecycle/capabilities change. Database constraints and strict schemas prohibit execution and future capabilities becoming available.

Startup is explicit and per-user: SMAppService with a bundled Aqua LaunchAgent on macOS 13+, or one fixed quoted HKCU Run value on Windows. No root daemon, shell interpolation or configurable executable path is exposed. macOS manual launch rejects symlinked, foreign-owned or group/world-writable path components; Windows must be installed in a user-protected location. The installed development bundle is ad-hoc signed and verified locally, not Developer ID signed/notarized. Release signing/update supply-chain policy remains future deployment work; this is not a public-distribution claim.

A malicious process already running as this OS user can interfere with this user's applications, replace user-writable binaries, deny IPC or access credentials according to OS policy. Same-user process compromise, OS administrators and database administrators remain outside the boundary. This limitation is explicit; local IPC is not an app-specific enclave. A crash between Core refresh rotation and secure-store persistence can require owner reconnection. Missing, denied or corrupt storage never falls back to a file. No private key, token, recovery value, provider secret, invasive inventory, microphone permission, screen capture or Accessibility grant is part of runtime diagnostics.

Final installed-build validation encountered a macOS launch-constraint rejection after an earlier in-place bundle replacement, although on-disk signature verification passed. Unregistering, quitting and replacing the complete app bundle restored normal registration and authenticated startup. No Gatekeeper, SIP, launch constraint or Keychain protection was disabled. On-disk signature verification alone is not proof of successful startup; the acceptance check also verifies the actual managed process, protected IPC and current Core presence. Production signing and update delivery remain separate future work.

## Phase 4 voice security review — validation in progress

Voice is implemented on the feature branch, superseding the earlier future-voice
statements for this checkpoint. Execution, telephony and remote computer control
remain unavailable. Spoken content and provider text are untrusted: neither has a
native action dispatcher, shell/file API or privileged tool. Core issues voice
credentials only to the scoped runtime; React sees bounded status and transcript
text, rendered as text rather than HTML. Provider credentials never enter React.

Pre-wake audio stays local. Timestamp-limited post-keyword recovery avoids uploading
ambient pre-roll, but false wake detection may expose subsequent speech to OpenAI.
No speaker biometric authentication is implied. Capture/output and provider queues
are bounded; mute/disable/revocation/suspend fence new capture, playback and queued
network packets. A packet already sent cannot be revoked. Sessions expire locally;
provider token expiry alone is not a live-connection cutoff. Cancellation is
prioritized separately from buffered audio. Device loss has capped retries.

Local IPC still requires the same user/verified pipe peer. Its narrow commands
configure voice, retry, clear transient transcript or request a cooldown-controlled
greeting; there is no arbitrary URL, text-to-speech text, filesystem or process
execution command. A worst-case multibyte transcript/device-settings test verifies
that status stays under the unchanged 16 KiB IPC budget. Audio, model results and
settings reject non-finite/out-of-range data. Voice model/native archive hashes are
pinned, models are outside Git and runtime loads reject symlinks.

Provider error bodies and credentials are never logged. Native helper output is
suppressed by the existing supervisor; no transcript crash reporting was added.
Process memory can still contain active audio, credentials and text; operating-
system crash dumps/debuggers are a residual local-access risk, not an application
privacy guarantee. Six bounded transcript entries are memory-only. Settings contain
no secrets. Tests and visual fixtures use isolated constant input only.

Pending: real Mac wake/noise/barge-in/lifecycle acceptance, provider retry after
owner billing correction and Windows physical privacy/voice checks. Automated
passing tests do not close those requirements. See VOICE and IMPLEMENTATION_STATUS.

Phase 4 microphone follow-up: macOS capture is gated by AVFoundation audio
authorization before opening CPAL. Pending or denied permission leaves capture
off. Denial requires owner correction in System Settings and an explicit retry;
there is no TCC reset, database edit, security bypass or plaintext credential
fallback. Audio diagnostics contain fixed error categories and aggregate levels,
never samples or transcript text. The failed physical stop-listening attempt is
recorded as unresolved, not treated as a privacy-control acceptance pass.
