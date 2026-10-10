# Database

PostgreSQL 17 is authoritative. Local Compose publishes only `127.0.0.1:54329`. A fresh schema contains only compatibility metadata, never a seeded owner, device, passkey, session, approval, event or setup completion.

## Entities

| Table                                             | Purpose                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| users                                             | Sole canonical owner: UUID, optional display name, Sir address, revisions, NORMAL/LOCKDOWN and durable sync watermark; singleton CHECK + UNIQUE |
| devices                                           | Owner-bound UUID/public key, fingerprint, platform, trust/enrollment, enrollment/last-seen/revocation timestamps and revision                   |
| passkeys                                          | Unique WebAuthn credential ID, COSE public key, counter, transports, backup metadata, name and revocation history                               |
| auth_ceremonies                                   | Immutable candidate/context, browser/redemption hashes, public challenge, proof/verification/redemption states and expiry                       |
| sessions                                          | Owner/device/security-revision binding, opaque credential hashes, access/idle/absolute expiry and revocation history                            |
| replay_nonces                                     | Unique session + nonce hash and short durable replay retention                                                                                  |
| step_up_grants                                    | Hashed one-use purpose/target/owner/device/session-bound authority                                                                              |
| recovery_codes                                    | Hashed high-entropy codes and consumption time                                                                                                  |
| device_enrollments                                | Hashed pairing secret, immutable candidate/fingerprint, source device, owner decision and revision                                              |
| approval_requests                                 | Durable source/capability/risk/summary/status/expiry, idempotency and deciding session; execution is CHECK-constrained false                    |
| sync_events / sync_tickets                        | Ordered durable safe owner events; one-use short-lived WebSocket admission                                                                      |
| security_rate_limits                              | Durable bounded-window abuse buckets                                                                                                            |
| audit_events                                      | Append-oriented safe lifecycle records with risk, outcome and tracing IDs                                                                       |
| setup_state                                       | Real Core verification progress, created only after a successful check                                                                          |
| capabilities / device_capabilities / policy_rules | Preserved Phase 1 policy persistence boundaries; no execution exposed                                                                           |
| schema_metadata / drizzle.__drizzle_migrations    | Compatibility version 5 and migration ledger                                                                                                    |

UUID entity IDs and `timestamptz` are used throughout. Connections set UTC; API timestamps are ISO 8601. JSON is limited to typed device candidates, transport metadata and safe event payloads; public projection queries explicitly exclude authentication material. No device private key columns exist. Passkey public keys and session/recovery hashes do not confer authentication by themselves.

## Migrations and transactions

`0000_foundation.sql` remains unchanged. Forward migration `0001_identity_sync.sql` extends the existing empty identity anchors, creates Phase 2 relations/indexes/constraints and advances compatibility to 2. `0002_device_key_constraints.sql` adds canonical Ed25519 encoding/fingerprint constraints and advances compatibility to 3. It is a separate migration because the first Phase 2 migration had already been applied for physical validation; applied migrations are preserved. Both fresh creation and repeated migration are covered by isolated PostgreSQL tests. Owner uniqueness intentionally refuses a previously contaminated database with multiple users; it does not silently select or delete an owner. Do not edit migrations once deployed; use another numbered migration and journal entry. Core never auto-migrates.

Drizzle provides the schema/migrator and foundation access. Phase 2 uses parameterized SQL through the same pool for explicit conditional writes, advisory transaction locks and one-use security transitions. Every externally visible mutation records an audit row and sync event in its transaction. Nonce acceptance and durable rate accounting intentionally commit independently so retries/failures cannot reset them. Assertion savepoints preserve challenge consumption when verification fails. Refresh rechecks its hash in the rotation transaction.

The single-owner advisory lock is transaction-scoped and shared across Core processes. Resource revisions prevent stale writes. Database uniqueness backs singleton ownership, credential IDs, device public keys, session hashes, nonces and idempotency keys. The migration is authoritative for all CHECKs and indexes; typed schema definitions describe access fields. Audit mutation triggers remain intact. Database owners can disable triggers; a separate least-privilege runtime role is a later production requirement.

## Retention and recovery

A minute maintenance pass expires pending approvals/enrollments with audit+sync evidence; removes expired ceremonies/grants/nonces/tickets/rate buckets; revokes expired sessions and clears their credential hashes; and prunes sync events older than 24 hours or outside approximately the latest 10,000 sequences. Sessions, revoked devices and enrollment/approval decision history are retained. Snapshots return the newest 100 sessions/enrollments/approvals and 50 audit entries; older history stays in PostgreSQL. The owner watermark persists even when the replay table empties. Requests independently enforce expiry, so delayed cleanup cannot extend authority.

`pnpm test:integration` creates a disposable PostgreSQL container with random credentials and a loopback ephemeral port. Identity tests create a second database inside that container; fixtures never enter the development volume. Tests exercise real WebAuthn cryptography, constraints, replay races, rotation, recovery and multiple sockets/Core restart. The runner never resets the development DATABASE_URL.

`pnpm db:down` preserves the development volume. Never delete volumes as troubleshooting. Encrypted scheduled off-host backups, retention, restore rehearsals and recovery objectives remain mandatory future deployment work. Passkey recovery is not a database backup. Future conversations/memory/missions/phone/remote domains are not implemented or seeded.

## Phase 3 migration and presence

`0003_runtime.sql` advances readiness to schema version 4. It adds `sessions.kind` (`owner` by default, or `runtime`) without rewriting prior migrations, with one non-revoked runtime session per device. `runtime_presence` has one primary-keyed device row bound by foreign keys to owner/session/device. The report is safe JSON; lifecycle is constrained and execution is CHECK-constrained false. Presence revisions, UTC last-seen and 90-second lease expiry are server-generated.

Registration, lease renewal and lifecycle events use the same advisory transaction lock and committed sync watermark. Stable heartbeats update current state and the existing 24-hour/approximately-10,000-event replay window. Only transitions/capability changes append runtime audit events. The maintenance pass marks an expired live row OFFLINE once and emits one expiry event; snapshot projection already treats expired leases as offline, even before maintenance. Revocation/expiry are checked independently of cleanup. New databases contain zero runtime rows; real owner state is never seeded by tests.

`0004_runtime_report_constraint.sql` hardens the JSON constraint against SQL CHECK NULL semantics: the execution key must exist and equal the JSON boolean false, not a missing key or string. Readiness advances to version 5 without editing the already-applied migration. Integration tests verify all three invalid forms are rejected.

## Phase 4 voice data boundary

No voice migration is required. Audio and bounded live transcripts are transient
native memory, not audit/event rows. Non-secret device voice preferences are stored
privately beside runtime state. Provider secrets remain backend configuration.
Core presence contains capability readiness only; it does not ingest transcripts.
