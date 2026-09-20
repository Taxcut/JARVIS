# Architecture

## Implemented in Phase 1

The desktop is a presentation process: React handles navigation and clean empty states inside Tauri 2. Native IPC privileges are empty. The desktop talks to a separate Node/Fastify Core over an authenticated loopback HTTP API. The bootstrap token stays in UI memory and is never put in localStorage, source code or a frontend environment variable. Configuration is typed at startup.

Core is a modular monolith. HTTP transport, environment validation, shared contracts, policy and persistence are distinct modules. PostgreSQL is authoritative; Drizzle maps typed columns and explicit reviewed migrations. No services, Redis, Kafka or cloud orchestration are required. Setup verification and its audit event commit in one transaction.

The shared packages use TypeScript source exports for monorepo consumers; Core and desktop build pipelines resolve and validate those contracts. Native Rust workspace compilation is separate. The runtime crate reports unavailable execution; it does not claim a background agent is running.

## Process and authority boundaries

```text
Desktop UI → authenticated Core API → typed services → PostgreSQL
Future model request → capability → external policy → owner approval
  → signed, scoped execution authorization → independent native runtime
```

No model, execution gateway, credential issuer or approvals UI exists in this phase. ALLOW means a policy decision, never a signed execution credential. Closing the dashboard must eventually leave the independent runtime/service running; that service lifecycle is deferred. Today closing the UI does not stop the separately started Core, and no background runtime is installed.

Devices will enroll an owner-bound stable UUID and public key, then negotiate versioned capabilities. Enrollment, proof of possession, revocation distribution and passkeys remain unimplemented. Keys must remain local to Keychain/Windows secure storage. `devices` never stores private keys.

## Preserved future boundaries

- Voice: local Porcupine wake phrases, arbitration and Realtime conversation; see VOICE.
- Remote: native capture/encoding/secure transport; see REMOTE.
- Computer control: native APIs, then macOS Accessibility / Windows UI Automation, then shell / PowerShell, vision and input fallback. Every route requires policy authorization.
- Browser automation: future Playwright adapter behind typed capabilities.
- Phone/SMS: LiveKit, SIP and Twilio adapters; owner phone configuration is optional and currently unused.
- Semantic memory: future pgvector extension in PostgreSQL; no separate vector store.
- AURA: a separate product accessed only through an AURA Control API with narrowly delegated authority. No AURA tables or inherited JARVIS privileges.

JARVIS addresses its owner as Sir, uses adaptive response length and a refined, calm, competent tone with subtle dry humor. This is legally distinct original design; no movie dialogue, copyrighted assets or actor voice cloning.
