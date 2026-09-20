# JARVIS setup

## Current scope

Phase 1 runs locally on macOS and provides a Windows build path. It is not ready for public hosting. Owner identity, enrollment and execution are not implemented. No paid provider accounts are needed.

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

The compose service is named `jarvis`, PostgreSQL listens at loopback port 54329 and its volume persists data. Do not use that development superuser configuration in production. Set NODE_ENV explicitly to development, test or production as appropriate; production mode does not magically enable public deployment security.

## Run

For browser preview plus Core: `pnpm dev`, then open `http://127.0.0.1:1420`.

For native desktop, in separate terminals:

```sh
pnpm --filter @jarvis/core dev
pnpm desktop
```

Do not run the browser dev script and native desktop simultaneously: both start Vite on port 1420. In the app choose **Begin Setup**, enter the Core address and the `JARVIS_API_TOKEN` value from your private `.env`, then verify Core. The real connectivity/schema check and audit event are saved atomically. The UI keeps the token only for this session. Overall setup stays incomplete because identity, devices and security onboarding are future work.

To check liveness without credentials: `curl http://127.0.0.1:4310/api/v1/health`. Other endpoints require `Authorization: Bearer <local token>`. Do not paste real tokens into shell history or issue reports. Readiness must report database and schema ready. Core can be alive while PostgreSQL is unavailable.

## Validation and builds

```sh
pnpm check
pnpm test:integration
pnpm rust:check
cargo build --workspace --locked
pnpm --filter @jarvis/desktop tauri build --no-bundle
```

Build the desktop frontend before direct Cargo builds from a fresh checkout. `pnpm build` includes it. `pnpm test` is deterministic unit/contract/API validation; `pnpm test:integration` starts and cleans up an isolated real PostgreSQL container. Docker must be running. No tests reset your development database.

Default CI validates TypeScript and real PostgreSQL on Linux and Rust/native compilation on macOS and Windows. The manual package workflow compiles unsigned release executables without installers. Signing, notarization, signed installers and automatic updates are not implemented.

Stop development processes with Ctrl+C. `pnpm db:down` stops PostgreSQL without deleting data. No background runtime/service is installed.

## Troubleshooting and recovery

- Invalid configuration: compare variable names/formats with `.env.example`; startup errors intentionally omit credentials.
- Core 401: verify the local token and restart Core after configuration changes.
- Core 503: start Docker/PostgreSQL and run migrations; do not fake readiness.
- Database password rejected after editing `.env`: the persisted volume still has the original database password. Restore the original configuration or perform coordinated credential rotation; do not delete the volume to hide the issue.
- Port conflicts: stop the conflicting project process. Vite strictly binds 1420. Core defaults to 4310.
- Rust/WebView errors: verify native prerequisites and rebuild frontend assets first.
- GitHub CI cannot start: check repository Actions access and account billing; do not repeatedly push identical commits.
- Audit rows cannot be updated/deleted: intentional append-oriented enforcement. Corrections require new audit events; never silently erase security history.

Back up development data before migration experiments. Future production recovery needs encrypted off-host backups and tested restores; Phase 1 provides no automatic recovery system.

## Future setup chapters — not implemented

VPS; domain/DNS; TLS; hardened PostgreSQL roles; device enrollment; passkeys; voice/wake word; OpenAI; LiveKit; Twilio; remote desktop; Tailscale; installers; updater; backups; monitoring; global security lockdown; recovery. These require later implementations and explicit provider/OS setup. No credentials for these systems are needed now.
