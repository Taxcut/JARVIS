# JARVIS setup

## Current scope

Phase 2 runs locally with single-owner passkeys, trusted devices, native secure storage and realtime security state. It is not ready for public hosting. No computer execution or paid provider integrations are enabled. Owner-reported existing accounts do not establish integration readiness.

## Prerequisites

Mac: Node 24, pnpm 12.4.2, stable Rust with rustfmt/clippy, Xcode Command Line Tools and running Docker Desktop. Apple Silicon and Intel use their native Rust target. Install missing tools from their official providers. The app requests no microphone, capture or Accessibility permission in this phase.

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

`pnpm --filter @jarvis/core start` runs the compiled Core after `pnpm build`. For a local macOS app bundle, use `pnpm --filter @jarvis/desktop tauri build --debug --bundles app`. This is a development bundle, not a signed/notarized installer.

Build the desktop frontend before direct Cargo builds from a fresh checkout. `pnpm build` includes it. `pnpm test` is deterministic unit/contract/API validation; `pnpm test:integration` starts and cleans up an isolated real PostgreSQL container. Docker must be running. No tests reset your development database.

Default CI validates TypeScript and real PostgreSQL on Linux and Rust/native compilation on macOS and Windows. The manual package workflow compiles unsigned release executables without installers. Signing, notarization, signed installers and automatic updates are not implemented.

Stop development processes with Ctrl+C. `pnpm db:down` stops PostgreSQL without deleting data. No background runtime/service is installed.

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
