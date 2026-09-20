# JARVIS

A personal AI platform for macOS and Windows. **Development Phase 1: Foundation.** This repository establishes a real local Core, PostgreSQL persistence, a desktop Command Center and typed security boundaries. It does not provide an AI assistant, tool execution, remote control, voice, phone service or an always-on runtime yet.

## Start here

Read [JARVISSETUP](docs/JARVISSETUP.md) for prerequisites and the full setup procedure. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec tsx infra/scripts/configure.ts
pnpm db:up
pnpm db:migrate
pnpm dev
# In another terminal, launch the native desktop instead of the web preview:
pnpm desktop
```

`pnpm dev` starts Core and the web preview together. To use native desktop, run Core alone (`pnpm --filter @jarvis/core dev`) then `pnpm desktop`, so only one Vite process binds port 1420. Use **Begin Setup** and the local token from `.env`. Core verification persists an actual successful check and its audit event; all future setup steps stay incomplete. No operational data is seeded.

## Architecture and layout

- `apps/desktop`: Tauri 2, React/TypeScript and Vite; native permissions deliberately empty.
- `apps/core`: Node 24 / Fastify modular monolith, loopback API `/api/v1`.
- `packages/config`, `schemas`, `protocol`: Zod environment, identity, message and API contracts.
- `packages/security`: typed capability registry and fail-closed policy evaluation.
- `packages/database`: PostgreSQL/Drizzle schema and transaction/persistence services.
- `packages/api-client`: validated, authenticated local Core client.
- `crates/runtime`: explicit inactive runtime boundary; no OS actions or service.
- `infra/docker`, `infra/migrations`, `infra/scripts`: PostgreSQL and repeatable setup/testing.
- `docs`: architectural decisions, security limitations and future integration boundaries.

There is no shared UI package yet: one desktop consumes the styles/components. Native audio, capture, security and remote crates will be added when they have real implementations.

## Verification

```sh
pnpm check
pnpm test:integration
pnpm rust:check
cargo build --workspace --locked
```

Integration tests create and remove their own PostgreSQL container. They never reset the development database. `pnpm db:down` retains its named volume. Never remove it unless you intend to discard local data.

See [implementation status](docs/IMPLEMENTATION_STATUS.md), [architecture](docs/ARCHITECTURE.md), and [security](docs/SECURITY.md). Later work uses focused branches and PRs with green validation; initial bootstrap uses `main`. Unsigned native compilation is validated on macOS/Windows; installers, signing and updates are future work.
