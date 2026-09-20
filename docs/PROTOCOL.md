# Protocol v1

`packages/protocol` is the Zod source of truth; schemas reject unsupported message versions and unexpected envelope fields. TypeScript types derive from schemas. `packages/schemas` provides device identity, capability/risk/decision and personality types. Rust runtime reports protocol version 1 but no device transport is implemented yet.

## HTTP API

| Route                          | Authorization          | Behavior                                                                  |
| ------------------------------ | ---------------------- | ------------------------------------------------------------------------- |
| GET /api/v1/health             | None                   | Process liveness only                                                     |
| GET /api/v1/readiness          | Bootstrap bearer token | Checks PostgreSQL connection and schema version; 503 on failure           |
| GET /api/v1/system/version     | Bootstrap bearer token | Core, application, protocol and phase versions                            |
| GET /api/v1/setup/status       | Bootstrap bearer token | Persisted Core verification; overall configured remains false             |
| POST /api/v1/setup/core/verify | Bootstrap bearer token | Empty object only; real dependency check plus atomic progress/audit write |

No device enrollment or business actions are exposed. Their setup status is explicitly `not_implemented`. API response shapes are runtime-validated. Errors use `{error:{code,message,requestId,correlationId}}`; validation/auth/not-found/dependency/unexpected errors use appropriate 4xx/5xx codes and never echo internal exceptions.

Every response carries `X-Request-ID` and `X-Correlation-ID`. Request IDs are generated per request; a valid incoming correlation UUID is retained, otherwise a new one is generated. They support tracing, never confer authority. Structured logs and persisted setup events reference them.

## Future device transport

The heartbeat and acknowledgement contracts document device → Core and Core → device directions. They are schemas only, not an open enrollment or messaging endpoint. Future handshakes must authenticate device key possession, trust and revocation before accepting traffic. Execution messages require separate signed/scoped/expiring authorization and replay protection; an event or policy decision is not an execution command.

Breaking changes require a new envelope version and API major path. Unknown versions fail closed; negotiation must be explicit and capability-aware. Additive HTTP response fields can be introduced only with coordinated client compatibility; current strict schemas intentionally detect drift. Versioned fixtures and contract tests must accompany changes. Audit events retain their version at write time.
