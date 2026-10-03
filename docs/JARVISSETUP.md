# JARVIS setup

## Current scope

Phase 3 runs locally with single-owner passkeys, trusted devices, native secure storage, realtime security state and an independent user-session runtime. It is not ready for public hosting. No computer execution or paid provider integrations are enabled. Owner-reported existing accounts do not establish integration readiness.

## Prerequisites

Mac: macOS 13 or later, Node 24, pnpm 12.4.2, stable Rust with rustfmt/clippy, Xcode Command Line Tools and running Docker Desktop. Apple Silicon and Intel use their native Rust target. Install missing tools from their official providers. The app requests no microphone, capture or Accessibility permission in this phase.

Windows: Node 24, pnpm 12.4.2, stable Rust MSVC toolchain, Visual Studio Build Tools with Desktop development with C++, WebView2 runtime and Docker Desktop using Linux containers. Use PowerShell in the repository root. GitHub Actions compiles on Windows; real Gaming PC interactive validation is still separate.

## Install and configure

```sh
git clone https://github.com/Taxcut/JARVIS.git
cd JARVIS
pnpm install --frozen-lockfile
pnpm exec tsx infra/scripts/configure.ts
pnpm db:up
pnpm db:migrate
```

The generator creates an ignored `.env` with random local API/database credentials and restrictive permissions. It refuses to replace an existing file. Do not copy `.env.example` first when using the generator. `.env.example` documents names only and contains no password. For manual setup, copy the example and fill valid values locally; the API token must be 32 random bytes encoded as 64 lowercase hex characters. No phone number is required.

The Compose project is named `jarvis`, its database service is `postgres`, PostgreSQL listens at loopback port 54329 and its volume persists data. Do not use that development superuser configuration in production. Set NODE_ENV explicitly to development, test or production as appropriate; production mode does not magically enable public deployment security.

## Run

For browser preview plus Core: `pnpm dev`, then open `http://127.0.0.1:1420`.

For native desktop, in separate terminals:

```sh
pnpm --filter @jarvis/core dev
pnpm desktop
```

Do not run the browser dev script and native desktop simultaneously: both start Vite on port 1420. In the app choose **Begin Setup**, enter the Core address and the `JARVIS_API_TOKEN` value from your private `.env`, then verify Core. The real connectivity/schema check and audit event are saved atomically. The UI keeps the token only for this session. After verification, use **Create owner & register passkey**, then complete the system-browser passkey prompt. macOS uses its normal passkey/Touch ID flow; Windows uses the normal browser/Windows Hello path. Bootstrap access is permanently disabled after owner creation. Generate recovery codes from Security using fresh passkey verification, save them offline, then hide them. Overall product setup remains incomplete because voice, phone, remote and deployment are future work.

To check liveness without credentials: `curl http://127.0.0.1:4310/api/v1/health`. Before owner creation, foundation endpoints require the bootstrap bearer token. After creation, use the native signed client; a bare token is insufficient. Do not paste real tokens into shell history or issue reports. Readiness must report database and schema ready. Core can be alive while PostgreSQL is unavailable.

## Validation and builds

```sh
pnpm check
pnpm test:integration
pnpm rust:check
cargo build --workspace --locked
pnpm --filter @jarvis/desktop tauri build --no-bundle
```

`pnpm --filter @jarvis/core start` runs the compiled Core after `pnpm build`. For a local macOS app bundle, first run `pnpm runtime:prepare`, then `pnpm --filter @jarvis/desktop tauri build --debug --bundles app`. This is a development bundle, not a signed/notarized installer.

Build the desktop frontend and run `pnpm runtime:prepare` before direct Cargo builds from a fresh checkout. `pnpm build` includes it. `pnpm test` is deterministic unit/contract/API validation; `pnpm test:integration` starts and cleans up an isolated real PostgreSQL container. Docker must be running. No tests reset your development database.

Default CI validates TypeScript and real PostgreSQL on Linux and Rust/native compilation on macOS and Windows. The manual package workflow compiles unsigned release executables without installers. Signing, notarization, signed installers and automatic updates are not implemented.

Stop development processes with Ctrl+C. `pnpm db:down` stops PostgreSQL without deleting data. The dashboard does not automatically enable login startup. If you explicitly enabled it, disable it in Settings before removing the app.

## Troubleshooting and recovery

- Invalid configuration: compare variable names/formats with `.env.example`; startup errors intentionally omit credentials.
- Core 401: before owner creation, verify the bootstrap token; afterward, sign in with your passkey. The bootstrap token cannot restore an owner session. Verify system clock (signed requests allow ±60 seconds).
- Core 503: start Docker/PostgreSQL and run migrations; do not fake readiness.
- Database password rejected after editing `.env`: the persisted volume still has the original database password. Restore the original configuration or perform coordinated credential rotation; do not delete the volume to hide the issue.
- Port conflicts: stop the conflicting project process. Vite strictly binds 1420. Core defaults to 4310.
- Rust/WebView errors: verify native prerequisites and rebuild frontend assets first.
- GitHub CI cannot start: check repository Actions access and account billing; do not repeatedly push identical commits.
- Audit rows cannot be updated/deleted: intentional append-oriented enforcement. Corrections require new audit events; never silently erase security history.

Back up development data before migration experiments. Future production disaster recovery needs encrypted off-host backups and tested restores. Phase 2 owner recovery codes do not replace backups.

## Future setup chapters — not implemented

VPS; domain/DNS; TLS; hardened PostgreSQL roles; voice/wake word; OpenAI; LiveKit; Twilio; remote desktop; Tailscale; installers; updater; backups; monitoring; offline recovery after loss of all trusted device keys. These require later implementations and explicit provider/OS setup. No credentials for these systems are needed now.

## Future VPS deployment constraint — planning only

The initial owner-selected baseline is **InterServer, 1 Slice, New Jersey / US East**, running **Ubuntu 24.04 LTS** with **1 vCPU, 2,048 MB RAM, 40 GB SSD and 2,000 GB/month transfer**. Planned hostname: `jarvis-core-01`; region label: `us-east-nj`. These are requirements supplied by the owner, not a claim that a server has been purchased, provisioned or benchmarked. No VPS deployment or Prompt #11 work is part of Phase 2.

Future deployment must support this constrained machine:

- Configure approximately **2–4 GB swap** as a safety margin; sustained swapping is an upgrade signal, not a replacement for RAM.
- Tune PostgreSQL for low memory: bound connections, pool sizes, per-query memory, shared buffers and maintenance jobs against a measured total-memory budget. Do not carry development superuser credentials into deployment.
- Keep Node/Core memory controlled with measured heap/process limits, bounded concurrency and bounded queues. Reject, queue or degrade nonessential work under pressure; never permit unbounded backlogs or memory exhaustion.
- Minimize Docker and service overhead. Start only essential Core/PostgreSQL/supporting services; keep builds, browser automation workers, model inference and other heavy processing off the starter VPS unless later capacity testing explicitly permits them.
- Set strict log rotation and retention, with size limits. Keep encrypted backups off-box, verify restores and budget temporary backup/migration disk usage.
- Monitor RAM, swap, disk space, OOM events, CPU and service/database health. Alert on persistent pressure before service loss; provide backpressure and graceful shutdown/recovery.
- Preserve portable configuration, PostgreSQL migrations and externalized secrets so a move to **4 GB+ RAM** or a replacement host needs no architectural redesign.

Provisional upgrade triggers for future deployment validation: any OOM kill or resource-driven restart; available RAM below 15% for 15 minutes; swap above 25% with sustained paging for 15 minutes; CPU above 80% for 30 minutes with growing queues or missed latency targets; disk above 75% or forecast to exhaust within 30 days; or monthly transfer above 80% of the allowance. Tune these starting thresholds using measured workload data before go-live. Crossing a trigger requires load shedding/capacity review and, where sustained, a larger plan. Do not automatically purchase an upgrade.

Before that future deployment, complete production database role separation, TLS/private networking, credential rotation, backup/restore and monitoring requirements described in SECURITY. The current authenticated loopback service is not an Internet-ready deployment.

## Phase 2 owner operations

Use the native desktop for identity; a plain browser preview cannot access native secure storage. Owner/Profile, Devices, Security and Approvals show only real Core data. LIVE indicates authoritative sync; stale/offline views disable changes. Device rename, revocation, session/passkey management and lockdown update other connected clients automatically. Approvals record decisions only and cannot execute tools.

For another device, choose **Add a device** on a trusted client, transfer the one-time pairing secret privately, and enter it on the new native client. Compare its displayed fingerprint and use **Verify & approve** on the trusted client. Secrets expire after five minutes; the new device must finish its three-minute proof/redemption ceremony. Local Core is not remotely exposed in this phase; distributed topology is tested with simulated clients. Real cross-machine networking belongs to the later deployment/private-network setup.

On restart, the desktop resumes from native secure storage. If the session expired, use **Sign in with passkey**. If all passkeys are unavailable but a trusted device key remains, use a one-time recovery code and register a new passkey. Successful recovery revokes previous passkeys/sessions and outstanding grants/enrollments. If all trusted device keys are lost, stop: no insecure bootstrap reset is available. Corrupted native storage fails closed; do not delete it as a shortcut.

`JARVIS_RP_ID` defaults to `localhost`; `JARVIS_AUTH_ORIGIN` defaults to `http://localhost:4310`. If changing the Core port, also change the exact auth origin. Core validates HTTPS or local browser origins and RP matching. The Phase 2 native browser adapter uses localhost on the Core port; non-local authentication hosting is reserved for the future deployment adapter. Never weaken validation or expose the development Core to work around passkey errors.

Physical verification: macOS Keychain has a real isolated roundtrip test (`cargo test -p jarvis-identity native_store_roundtrip -- --ignored`). The explicit operator example `owner_setup` exercises the same native browser adapter and can test `bootstrap`, `login` or `resume`; bootstrap credentials must be passed in the environment, never a command argument. It prints only success/status. Native GUI validation and Touch ID outcome are recorded in IMPLEMENTATION_STATUS. On the Gaming PC, later verify a real Windows Hello registration/assertion, Credential Manager persistence across restart and revoked-session rejection; hosted Windows compilation does not establish those physical results.

## Owner configuration ingestion

[OWNER_CONFIGURATION](OWNER_CONFIGURATION.md) records the sanitized owner document, provider readiness, voice/timezone/wake-up preferences and unresolved future phone settings. Supplied provider credentials are held only in the ignored local `.env` with restrictive permissions; `.env.example` lists blank names for future use. Phase 2 does not use these credentials or validate provider access. Preserve existing database/bootstrap values and native secure storage; do not recreate `.env` or reset ownership. The owner's phone requires private E.164 format confirmation before import. No provider purchase, deployment, model installation or operational schedule is part of this ingestion.

The owner subsequently resumed and completed real Mac Keychain/restart/sign-in/UI/recovery-setup checks on 2026-09-20/21. One Keychain approval sufficed for relaunching the same native build. If macOS asks again after a changed development build, approve only the expected JARVIS item using the login Keychain password (usually the Mac login password); never send that password to chat or replace native storage with plaintext. A changed Keychain password may differ from the current login password.

Save all eight recovery codes privately before selecting **I have saved these codes · Hide**. Hidden codes cannot be retrieved. If a set was not saved, use **Replace recovery codes** with fresh passkey verification; all previous codes become invalid. The owner confirmed saving the current replacement set. Core persists only hashes, and recovery still needs a trusted device. Gaming PC physical testing remains intentionally deferred and does not block this Mac closure.

## Phase 3 runtime installation and operations

1. Preserve existing `.env`, database and native identity. Install dependencies, start PostgreSQL, apply migrations and start Core as above. Core and PostgreSQL are separate processes; runtime login startup does not install or start either one.
2. Run `pnpm runtime:prepare` to compile/stage the target-specific helper, then `pnpm --filter @jarvis/desktop tauri build --debug --bundles app` on macOS. For a release bundle use `pnpm desktop:bundle`. Windows direct builds likewise require `pnpm runtime:prepare` before Cargo/Tauri; the unsigned-package workflow prepares the release helper automatically.
3. On macOS place the complete app bundle in a stable user application location such as `~/Applications/JARVIS.app`. Keep its `Contents/MacOS/jarvis-runtime` and `Contents/Library/LaunchAgents/com.taxcut.jarvis.runtime.plist` together. Do not register a disposable target directory or modify a registered bundle while it is running. No administrator or root service is needed. Use a protected installation location on Windows with the helper beside the desktop executable.
4. Open the native dashboard and sign in/resume the existing owner. In Settings or Diagnostics choose **Start runtime**, then **Connect runtime to Core** once. This creates a restricted session on the existing trusted device; it does not enroll another device. Approve only the expected `jarvis-runtime` Keychain request for the existing identity when macOS asks. Enter OS credentials only into the real OS dialog, never chat or JARVIS fields.
5. Confirm ONLINE, a real last heartbeat and the same trusted device. Then choose **Enable start at login**. On macOS this registers the bundled SMAppService agent and launches it in the GUI user session. If APPROVAL REQUIRED appears, allow JARVIS under System Settings → General → Login Items & Extensions. On Windows the control writes a fixed quoted executable plus `--supervise` to this user's Run key. It takes effect at the next login; Start runtime launches it immediately.
6. Closing or quitting the dashboard leaves the runtime active. Reopening discovers the current instance over protected IPC. **Reconnect runtime** discards the socket and revalidates/resyncs; it does not create credentials. **Stop runtime** ends the worker and supervisor cleanly, while leaving enrollment and the login registration intact. **Disable start at login** removes persistence. macOS unregistering also stops the managed job; Windows removes the next-login entry without stopping the current worker. Use Stop runtime separately when needed.

The runtime credential expires under the existing 7-day idle/30-day absolute policy. AUTH REQUIRED means sign in to the dashboard if needed, then Connect runtime to Core; it will replace the old restricted session. A revoked device must be explicitly re-enrolled through the established owner flow. Never delete secure storage or edit trust rows to bypass this boundary. UPDATE REQUIRED means install matching runtime/Core versions. OFFLINE/DEGRADED requires checking Core/PostgreSQL, the loopback address and system clock; retries are bounded and jittered. Missing/denied secure storage requires OS access repair, not a plaintext fallback.

Diagnostics shows public instance/version, startup state, heartbeat/reconnect/wake information and fixed error codes. Logs live in the platform local data directory under `com.taxcut.jarvis/runtime` (`~/Library/Application Support/com.taxcut.jarvis/runtime` on macOS), with `runtime.log` and three bounded rotations. These logs contain no request payloads or credentials. Do not distribute private `.env` or OS credential entries for troubleshooting. The runtime only discovers platform, architecture and its own lifecycle/version facts.

For uninstall: disable login startup, stop runtime, quit the dashboard, then remove the installed app. Keep native identity and database unless you intentionally plan separate recovery/data removal. Moving or updating a registered bundle requires disable/stop, replace the complete bundle, then enable again. This phase provides local ad-hoc signing only, not a notarized distribution/update pipeline. Stage the new complete bundle separately and replace the old bundle as a unit after stopping it; do not overwrite its executable files in place. During final development validation, macOS rejected a launch from the earlier in-place replacement despite successful on-disk signature verification. Unregistering, quitting, installing a fresh complete bundle and registering again restored the supported launch. No OS security setting or credential was reset.

## Deferred Gaming PC physical runtime checklist

- Install the same verified build and keep the helper in its protected stable path; confirm exactly one supervisor/worker pair.
- Enroll the PC explicitly, verify Windows Hello and Credential Manager, then provision only its runtime session.
- Enable per-user login startup, sign out/in, verify the quoted Run path and no elevation; disable and verify removal.
- Close/reopen the dashboard, terminate/restart the worker and restart Core; confirm unchanged trusted device identity and no duplicate runtime row.
- Suspend/resume, lock/unlock and session transitions: stale sockets discarded, current auth checked, full resync and heartbeats resumed.
- Verify revoked/expired credentials fail closed, lockdown remains visible, future capabilities unavailable and execution false.
- Measure idle CPU/memory and inspect sanitized bounded logs on the physical PC. Hosted Windows tests do not substitute for these checks.

## Phase 4 voice setup

This supersedes earlier instructions that classify voice as future-only. Preserve
existing owner identity, database, recovery codes and native secure storage.

1. Keep the provider key in the Core's private `OPENAI_API_KEY`; never enter it in
   the UI. The default `JARVIS_REALTIME_MODEL` is `gpt-realtime-2.1`. API credit is
   separate from ChatGPT/model usage subscriptions.
2. Run `pnpm runtime:prepare --release`, then `pnpm voice:models` on the device that
   will run voice. Fixed model/native archives are integrity-checked. Models are
   local user data, not frontend assets or Git content.
3. Build/open the native app, connect its trusted background runtime, and select
   the microphone/speaker in Settings. Choose visual quality and motion/startup
   preferences. Browser preview cannot claim native microphone readiness.
4. Enable voice deliberately. Approve the operating-system microphone dialog if
   requested. Permission denial stops automatic retries; correct OS access, then
   choose Reconnect audio. Device loss is shown explicitly.
5. Test Jarvis, Hey Jarvis, immediate follow-on speech, George output, interruption,
   mute and “Jarvis, stop listening.” Wake-only audio stays local; an active
   conversation sends audio to OpenAI. Transcripts are transient and clearable.
6. Confirm real provider response, restart/resume and sleep/wake before treating
   voice as accepted. Missing models, exhausted provider credit or unperformed
   physical checks must remain incomplete.

For local Mac validation the signed application bundle is built with
`pnpm runtime:prepare --release && pnpm --filter @jarvis/desktop tauri build --bundles app`.
The optional DMG decoration step failed during this checkpoint and is not claimed
as validated. Developer ID/notarization is still separate distribution work. Never
clear owner storage to resolve an ordinary build or voice setup problem.

On macOS, enabling native voice may show a separate microphone dialog after
Keychain approval. These permissions are distinct. JARVIS waits without capturing
until macOS grants microphone access. If denied, enable JARVIS in System Settings
→ Privacy & Security → Microphone, then choose Settings → Reconnect audio. Do not
reset Keychain or TCC permissions as a workaround. A ready label is not a substitute
for a spoken acceptance check. Model installation now verifies into a fresh private
staging directory and retains the previous model directory for recovery.

### Local-default transition (2026-10-02)

The owner superseded the OpenAI-default instructions above: paid API credit is
**not required** for Prompt #4. Local streaming STT and Qwen setup are being
integrated; keep voice off until the local stack is installed and verified.
Kokoro and wake models remain local. Historical provider setup is optional only.
After building a Mac app, run `pnpm desktop:verify-macos` before installation.
This checks the final desktop/helper audio-input entitlements, hardened-runtime
flags, nested signature integrity and microphone usage description. The optional
path argument checks an installed bundle. Do not work around missing entitlements
by weakening macOS protections.
