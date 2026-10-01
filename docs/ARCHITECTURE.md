# Architecture

JARVIS is a single-owner local desktop and modular Node/Fastify Core. PostgreSQL is the sole authoritative database. Phase 3 adds an independent Rust user-session runtime to the existing identity/security/realtime foundation. There is no computer executor or external identity service.

## Process boundaries

```text
React UI → narrow Tauri identity commands → Rust native client
  → signed loopback Core API → identity/security transactions → PostgreSQL
Rust → system browser → WebAuthn user verification → Core
PostgreSQL committed sync events + NOTIFY → Core WebSocket → React/runtime projections
Tauri runtime controls → protected local IPC → independent Rust runtime
Runtime → its own restricted signed Core session → leased presence
Future model request → capability/policy → owner decision
  → separate future execution authorization → independent native runtime
```

React receives public identity, safe authoritative snapshots and one-time sync tickets. It never receives device private keys or durable refresh credentials. Rust holds signing/access material and uses native Keychain/Credential Manager for persistence. Browser registration/authentication and native redemption use distinct one-use secrets. The same standards-based passkey verifier and browser UI serve macOS and Windows. Tauri webview WebAuthn is not relied upon.

## Modules

- `packages/config`, `schemas`, `protocol`: validated environment, capabilities, identities, API/auth/sync contracts.
- `packages/security`: fail-closed policy; the separate Node signing export defines canonicalization and verification without shipping Node crypto into the browser.
- `packages/database`: typed Drizzle schema, migration readiness and foundation setup persistence.
- `apps/core`: identity store, WebAuthn service, signed transport, mutation service and realtime delivery. Security queries use parameterized PostgreSQL transactions and explicit safe projections alongside Drizzle's typed schema/migrations.
- `crates/identity`: platform secure-store abstraction, signing, session rotation and system-browser adapter. `crates/runtime` owns supervised background lifecycle, OS notifications, typed local IPC, scoped Core connectivity and presence; execution remains unavailable.
- `apps/desktop`: existing visual shell, real Owner/Security/Devices/Approvals screens and in-memory authoritative projections. No independent persistent client database.

## Transaction and synchronization model

A transaction-scoped PostgreSQL advisory lock serializes mutations for the single owner. This deliberately favors clear security semantics over unnecessary multi-tenant throughput. It also ensures event sequence allocation commits in the same order. Resource revisions detect stale writes; conflicts return 409. State changes, audit rows and safe versioned sync events are atomic. PostgreSQL NOTIFY wakes connected clients only after commit, while durable events support replay after process failure. No polling loop is the primary state transport. During shutdown, realtime preClose cleanup returns the dedicated LISTEN connection before the database-owner onClose hook ends the pool; pending connection acquisition observes the stopping flag.

WebSocket entry requires a 30-second one-use ticket issued by a signed session. Batches include ordered events and a safe current snapshot from the same transaction. Clients retain the last confirmed sequence in memory, discard duplicate batches, reject out-of-order/gapped batches and request authoritative resync on reconnect. Expired retention/future cursors force a full snapshot. A persistent owner watermark survives event cleanup. On app restart, secure session resume precedes a full snapshot. A 15-second heartbeat checks connection health/session validity; the UI marks stale/disconnected state and disables changes.

A single bounded minute maintenance task expires security records, clears challenge/grant/nonce/ticket/rate debris, revokes expired sessions and retains at most a bounded replay window. Historical devices/sessions/approvals/enrollments remain inspectable; expired secret-bearing transient rows are removed. PostgreSQL pool size is five, with one connection reserved while LISTEN is active. Realtime is capped at 32 sockets and applies backpressure. These choices preserve the planned InterServer 1 vCPU/2 GB baseline; deployment has not occurred.

## Preserved future boundaries

- Voice: local **sherpa-onnx**, wake arbitration and OpenAI Realtime conversation, with a separate planned Kokoro synthesis adapter for the owner-selected `bm_george` output; documentation only in this phase. See VOICE and OWNER_CONFIGURATION.
- Remote: native capture/encoding/secure transport; no implementation.
- Computer control: future native APIs, Accessibility/UI Automation and narrowly authorized tool adapters. No privileged IPC exists today.
- Browser automation, LiveKit/Twilio phone/SMS, semantic memory/pgvector, missions and automations remain separate later work.
- AURA remains a distinct product with an explicit delegated Control API and no inherited JARVIS authority.

Closing the desktop stops neither the independent runtime nor separately started Core. Explicit login startup registers only the user-session native runtime; Core/PostgreSQL lifecycle and future deployment remain separate. See RUNTIME for supervision, platform choices and failure boundaries. JARVIS defaults to addressing the owner as Sir. Overall product setup remains false: identity completion does not imply voice/phone/remote/deployment readiness. Fresh installs seed no operational records.

## Phase 4 feature-branch implementation

The prior planned-only voice boundary is now implemented behind `crates/voice`.
The existing per-user runtime owns CPAL audio, sherpa-onnx wake detection, Sonora
echo cancellation and local Kokoro synthesis. Model work runs outside callbacks;
provider networking is asynchronous and credentials are delegated through the
existing serialized scoped runtime client. React can configure declared settings
and observe bounded local status; it receives neither provider keys nor microphone
samples. The Core remains the credential broker and security authority. No database
migration or operational fixtures are introduced by voice.

Native output telemetry drives the procedural Three.js presence. Rendering stops
when hidden/offscreen; quality and reduced-motion preferences are local. Startup
respects actual readiness. An isolated visual entry supports synthetic state
regression without adding test data to the product. See VOICE and DESIGN for exact
boundaries and remaining physical acceptance.
