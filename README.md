# JARVIS

A personal AI platform for macOS and Windows. **Development Phase 3: Independent user-session runtime.** This repository establishes a real local Core, PostgreSQL persistence, a desktop Command Center and typed security boundaries. It does not provide an AI assistant, tool execution, remote control, voice, phone service yet. The background runtime maintains identity, presence and connectivity; execution is unavailable.

## Start here

Read [JARVISSETUP](docs/JARVISSETUP.md) for prerequisites and the full setup procedure. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec tsx infra/scripts/configure.ts
pnpm db:up
pnpm db:migrate
pnpm --filter @jarvis/core dev
# In another terminal:
pnpm desktop
```

`pnpm dev` starts Core and the web preview together. To use native desktop, run Core alone (`pnpm --filter @jarvis/core dev`) then `pnpm desktop`, so only one Vite process binds port 1420. Use **Begin Setup** and the local token from `.env`. Core verification persists an actual successful check and its audit event; continue with owner passkey registration and recovery setup. Voice, phone, remote and execution remain future work. No operational data is seeded.

## Architecture and layout

- `apps/desktop`: Tauri 2, React/TypeScript and Vite; narrow native identity and runtime lifecycle commands.
- `apps/core`: Node 24 / Fastify modular monolith, loopback API `/api/v1`.
- `packages/config`, `schemas`, `protocol`: Zod environment, identity, message and API contracts.
- `packages/security`: typed capability registry and fail-closed policy evaluation.
- `packages/database`: PostgreSQL/Drizzle schema and transaction/persistence services.
- `packages/api-client`: validated, authenticated local Core client.
- `crates/identity`: native secure storage, device signing and passkey browser adapter.
- `crates/runtime`: supervised Rust user-session helper, secure local IPC, presence, sleep/wake recovery and explicit per-user login startup.
- `infra/docker`, `infra/migrations`, `infra/scripts`: PostgreSQL and repeatable setup/testing.
- `docs`: architectural decisions, security limitations and future integration boundaries.

There is no shared UI package yet: one desktop consumes the styles/components. Native audio, capture and remote crates remain future work.

## Verification

```sh
pnpm check
pnpm test:integration
pnpm rust:check
cargo build --workspace --locked
```

Integration tests create and remove their own PostgreSQL container. They never reset the development database. `pnpm db:down` retains its named volume. Never remove it unless you intend to discard local data.

See [implementation status](docs/IMPLEMENTATION_STATUS.md), [architecture](docs/ARCHITECTURE.md), and [security](docs/SECURITY.md). Later work uses focused branches and PRs with green validation; initial bootstrap uses `main`. Unsigned native compilation is validated on macOS/Windows; installers, signing and updates are future work.

See [RUNTIME](docs/RUNTIME.md) for process boundaries and [JARVISSETUP](docs/JARVISSETUP.md#phase-3-runtime-installation-and-operations) for building/installing the bundled helper. Enable login startup explicitly in Settings. Closing the dashboard does not stop the runtime; stop/reconnect/disable are separate controls. Windows physical acceptance remains on the documented Gaming PC checklist.

Phase 4 voice/presence is under validation on its feature branch. See
[VOICE](docs/VOICE.md), [DESIGN](docs/DESIGN.md) and
[IMPLEMENTATION_STATUS](docs/IMPLEMENTATION_STATUS.md) for current architecture,
setup, verified checkpoints and remaining physical acceptance. Conversation does
not grant computer execution; fresh installs contain no operational demo data.

Phase 4 voice now defaults to local sherpa streaming STT, pinned Qwen3 4B
Instruct via Ollama, and Kokoro bm_george. No paid API is required. Setup and
resource limits are in [VOICE](docs/VOICE.md) and [JARVISSETUP](docs/JARVISSETUP.md).
Physical acceptance is still open; this is not a completion claim.
