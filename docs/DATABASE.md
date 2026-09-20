# Database

PostgreSQL 17 is authoritative; local Docker Compose publishes only `127.0.0.1:54329`. No product records are seeded. The sole initial row is technical schema version metadata. No fake users, devices, events or setup completion are inserted.

## Tables

| Table                        | Purpose                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| users                        | Future owner identity anchor; no authentication implemented                                                     |
| devices                      | Owner reference, UUID, OS/architecture, runtime version, public key, enrollment/trust, last seen and revocation |
| capabilities                 | Future persisted registry, separate from the versioned code registry used by policy today                       |
| device_capabilities          | Normalized device capability assignments                                                                        |
| policy_rules                 | Device-scoped ALLOW/ASK/DENY rules; persistence boundary, not an exposed configuration API                      |
| audit_events                 | Validated events with actor/device, action, outcome, request/correlation/approval references and safe metadata  |
| setup_state                  | Singleton row created only by real Core verification                                                            |
| schema_metadata              | Application schema compatibility version                                                                        |
| drizzle.__drizzle_migrations | Drizzle migration ledger                                                                                        |

Stable entity IDs use UUIDs. All instants use `timestamptz`; connections use UTC and API timestamps use ISO 8601. Integration tests verify offset input normalizes correctly. Typed relational fields and constraints carry the domain; JSON is restricted to extension metadata. No private key columns exist. Approval references are nullable identifiers pending a future approval domain, not evidence that an approval occurred.

## Migrations

`pnpm db:migrate` applies the checked-in SQL and Drizzle journal in `infra/migrations`. Migrations are explicit, reviewed SQL mirrored in `packages/database/src/schema.ts`, including native constraints/triggers. Do not use schema push in deployment or rewrite an applied migration. Add numbered forward migrations and update the journal plus compatibility version check. Run migration tests from an empty database and against a representative previous schema before rollout. Run one migration job at a time; Core never auto-migrates.

Readiness checks connectivity and supported schema version, so an empty or unsupported database is not ready. Liveness does not depend on PostgreSQL. Setup verification persists its check and audit event atomically. Audit mutations are rejected by database triggers; owners/superusers remain able to alter the schema. A separate least-privilege runtime role and migration role are required before production deployment.

`pnpm test:integration` creates a uniquely named ephemeral PostgreSQL container with random credentials and an ephemeral loopback port, runs migration, constraints, UTC, audit and transaction tests, then removes only that container. Test fixtures never enter the development volume. Tests do not accept the development DATABASE_URL as a reset target.

## Future domains and recovery

Passkeys, sessions, credentials history and approvals require real authentication/enrollment implementation first. Conversations/messages, missions/steps, memories, automations, notifications, calls/SMS, remote sessions and system-event projections are future domains, not placeholder tables. Audit is the initial event persistence store. pgvector can be introduced by a future extension migration without replacing PostgreSQL.

Development data survives `pnpm db:down`. Before future deployments, define encrypted scheduled `pg_dump` backups, retention, off-host storage, tested restores and recovery objectives. None of those services is configured by Phase 1. Never delete volumes as routine troubleshooting.
