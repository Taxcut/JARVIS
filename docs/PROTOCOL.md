# Protocol v1

Zod contracts in `packages/protocol` define versioned authentication, pairing, mutations, snapshots and realtime handshakes. Unsupported versions fail closed. Phase 2 extends the coordinated private desktop/Core contract; Phase 1 clients must upgrade alongside Core (system phase is now 3 and setup states have expanded). No public compatibility promise is made for an old private preview client.

## HTTP surface

| Route                                                                          | Authorization / behavior                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| GET /api/v1/health                                                             | Public minimal process liveness                                                     |
| GET /api/v1/readiness, /system/version, /setup/status                          | Signed session; bootstrap bearer allowed only before owner creation                 |
| POST /api/v1/setup/core/verify                                                 | Same boundary; empty JSON object; atomic real check/audit                           |
| POST /api/v1/auth/prepare                                                      | Versioned bootstrap/login/recovery; signed session required for step-up/add         |
| POST /api/v1/auth/activate, /auth/redeem                                       | Separate native secret + Ed25519 proof over immutable server challenge              |
| POST /api/v1/auth/browser/context, /auth/browser/options, /auth/browser/verify | Browser secret + exact configured Origin; WebAuthn UV required                      |
| GET /auth, /auth/browser.js, /auth/style.css                                   | Local passkey UI/assets; no session material                                        |
| POST /api/v1/enrollment/prepare                                                | Versioned one-use pairing secret and candidate; activation still requires key proof |
| POST /api/v1/session/refresh                                                   | Signed request with current refresh credential; rotates both secrets                |
| GET /api/v1/identity/snapshot                                                  | Signed session, safe authoritative owner projection                                 |
| POST /api/v1/identity/mutate                                                   | Versioned discriminated mutation, scoped grant where required, optimistic revision  |
| POST /api/v1/sync/ticket                                                       | Signed session; 30-second one-use socket ticket                                     |
| GET /api/v1/realtime                                                           | WebSocket; versioned ticket handshake within five seconds                           |

Every HTTP response has server-generated request and validated correlation UUIDs. Errors use `{error:{code,message,requestId,correlationId}}`; fixed messages never echo secrets or raw database/WebAuthn errors. Authentication failure is 401, forbidden/step-up/lockdown 403, malformed contracts 400, stale revisions 409, limits 429 and dependency/unexpected errors 5xx. CORS is an allowlist, not authentication. No cookie credentials are used.

## Canonical device request

All authenticated device requests carry `Authorization: Bearer <access>` (refresh on the refresh route), `X-Jarvis-Version: 1`, `X-Device-ID`, `X-Session-ID`, `X-Timestamp` (13-digit Unix milliseconds), `X-Nonce` (32 random bytes, unpadded base64url), `X-Correlation-ID` and `X-Signature` (64-byte Ed25519, unpadded base64url).

Sign the UTF-8 bytes of these newline-separated fields, with **no trailing newline**:

```text
JARVIS-REQUEST-V1
device UUID
session UUID
uppercase GET or POST
exact /api/v1/ lowercase path
lowercase hex SHA-256 of exact UTF-8 body (empty for GET)
timestamp
nonce
correlation UUID
```

Canonical paths contain only lowercase letters, digits, slash and hyphen. Queries, percent encodings, fragments and ambiguous variants are rejected. Do not reserialize the body after signing. Proxy/Host headers are not signed. Native/Core interoperability shares a public test fixture. ±60-second skew and a unique session/nonce hash protect against replay; nonce retention exceeds the complete acceptance window.

Proof of possession signs `JARVIS-PROOF-V1`, ceremony UUID, server challenge, device UUID and unpadded base64url public key, likewise joined by newlines with no trailing newline. The server-persisted ceremony fixes all inputs. Browser and redemption tokens are different; only native owns redemption proof/session material.

## Mutations and authority

The discriminated mutation schema lists owner updates; device/passkey rename/revoke; session revoke; exact-state lockdown; recovery regeneration; pairing creation/decision; approval creation/decision. Mutable resources require the last observed revision. A 409 requires review of current authoritative data, never silent overwrite. Sensitive actions consume exact purpose/target/session grants. Approval creation/decision idempotency keys bind their original context and cannot issue execution authority.

Setup always reports `configured: false`. Core verification, owner presence, device enrollment and recovery availability are real database state. Current-device trust is resolved from the signed session/snapshot. Voice, phone and system testing remain future/unconfigured.

## Realtime

Client handshake: `{version:1,ticket,lastSequence}`. Sequence values are decimal strings to preserve 64-bit precision. A ticket is obtained through native signed IPC, held only in UI memory and never placed in the URL. Server messages are `snapshot`, `update` or `heartbeat`, all version 1.

A snapshot/update includes `fromSequence`, ordered `events` and a current safe `snapshot`. Each event carries UUID, monotonic sequence, type, schema version, owner/resource UUID, resource revision, timestamp, correlation ID and `{changed:true}`. Payloads contain no credentials. Events are committed transactionally with state. Sequence allocation may contain rollback gaps; order is monotonic, not assumed contiguous. The batch cursor binds the entire missed interval.

Clients apply authoritative snapshots, ignore duplicate update batches, validate increasing event sequences/unique IDs and reject mismatched batch cursors. An unavailable retention window, future cursor or detected ordering fault causes a full snapshot. Fresh app starts begin at sequence zero. Socket heartbeat is 15 seconds; the UI declares stale after 40 seconds and reconnects with capped exponential backoff. CONNECTING/SYNCING/LIVE/DEGRADED/OFFLINE reflect actual transport state. No periodic product-state polling is used; only an explicitly initiated browser ceremony uses short bounded completion polling.

The original generic heartbeat/ack schemas are not runtime commands. Sync events and approval decisions are never commands. Breaking public API generations will require a new explicit envelope/path and reviewed compatibility fixtures.

## Runtime protocol v1

`packages/protocol/src/runtime.ts` is the strict presence/capability contract. Runtime protocol compatibility is separate from the application version. Signed `GET /api/v1/runtime/compatibility` returns current/minimum runtime protocol 1, heartbeat 30 seconds, lease 90 seconds and `executionAvailable:false`. Unsupported reports return 426 `RUNTIME_UPDATE_REQUIRED` before persistence.

`POST /api/v1/runtime/session` accepts an empty object from an owner session and issues a restricted session for that same trusted device. Only native setup may consume its response; the React fixed-route bridge rejects this route. Runtime-scoped sessions cannot mutate owners/devices/approvals or start step-up/add ceremonies.

Signed runtime-only `POST /api/v1/runtime/register`, `/heartbeat` and `/stop` accept the strict report: device-bound platform/architecture, runtime and protocol versions, instance UUID, build label, start timestamp, lifecycle/startup state, wake generation, capability states and false execution availability. Unknown keys, future available capabilities and platform substitution are rejected. Heartbeat/stop require the registered instance and session; stop requires STOPPING and projects OFFLINE. A runtime restart uses a new instance UUID with the same trusted device. A replacement session must also begin a new instance.

Snapshots include `runtimePresence`, independently of device enrollment. Each row contains a server-issued revision, last-seen and expiry. Expired leases project OFFLINE immediately; revoked devices project REVOKED, invalid sessions AUTH_REQUIRED. One current row per device avoids heartbeat history growth. Changes share the existing bounded replay stream. The worker requests sequence zero after every reconnect/wake, validates the authoritative snapshot and subsequent ordered batches, then renews presence. Sync data is never executable instruction.

The local IPC protocol is length-prefixed JSON, maximum 16 KiB, with a closed command set. Native startup/start controls choose fixed OS mechanisms and a bundled helper; callers cannot provide executable paths, process IDs or shell text. The dashboard polls local health only while its runtime panel is mounted; authoritative product state still uses Core WebSocket events.
