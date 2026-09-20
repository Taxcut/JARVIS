# Security foundation

## Threat model

Treat model output, web pages, emails, device traffic and prompt content as untrusted. Risks include prompt injection, forged or replayed execution requests, compromised/revoked devices, malicious websites reaching localhost, leaked bootstrap/database credentials, audit alteration and unauthorized remote/telephony activity. A local OS administrator or database superuser can bypass local protections; Phase 1 does not claim resistance to host compromise.

## Existing controls

- Core binds only `127.0.0.1`. All routes except minimal liveness require a randomly generated 256-bit bootstrap bearer token, compared using constant-time comparison. Browser origins are explicitly allowed. CORS is not authentication. No cookie credentials are used.
- Tauri exposes no privileged commands or plugins. Its CSP limits resources and loopback connections. Tokens remain in UI memory and must be entered again after restart.
- Zod validates configuration, messages, identities, API responses and events. Client IDs are not trusted as request IDs; Core generates UUIDs and validates optional correlation IDs.
- The policy registry classifies LOW/MEDIUM/HIGH/CRITICAL. Unknown or ungranted capability, revoked/untrusted device or lockdown yields DENY. DENY outranks ASK and ALLOW. Only an explicit LOW risk ALLOW rule can allow without approval. Every other authorized capability defaults to ASK, including all sensitive actions even under an ALLOW rule.
- Policy results always contain `executionAuthorized: false`. There is no executor, root shell, signed request issuer or bypass for an LLM. Device context must eventually be derived from verified server-side identity, never caller claims.
- Audit insertions validate an explicit metadata allowlist. Setup and audit are atomic. PostgreSQL rejects UPDATE, DELETE and TRUNCATE of audit events via triggers. These are append-oriented safeguards, not cryptographic tamper evidence; database owners can disable triggers.
- Logs avoid raw requests, bodies, headers and exception strings. Errors expose fixed messages and correlation IDs. The environment generator writes a private `.env` without printing credentials; repository ignore rules exclude environment files and private keys.

## Required future controls, not implemented

Owner identity/passkeys, authenticated sessions, device enrollment/challenges, device-local key storage, least-privilege database runtime role, scoped and expiring signed execution requests, nonce/replay protection, revocation delivery, durable approval workflows and global lockdown enforcement across runtime processes must exist before enabling privileged actions. The current lockdown input is a policy primitive, not a working product-wide switch.

Remote access must be visible and auditable. Telephony must never trust caller ID alone. Prompt injection cannot alter external policy. AURA agents receive explicit limited delegation and never inherit unrestricted privileges. Secrets must not unnecessarily enter prompts, logs, audit metadata or the central device table. Device private keys belong in macOS Keychain or Windows DPAPI/Credential Manager.

Phase 1 is a **local development foundation**, not an Internet-facing production deployment. Do not expose Core through port forwarding or deploy it to a VPS yet. Bootstrap access is not owner identity. HTTPS, credential rotation, rate limiting for remote exposure, role separation and recovery policies are deployment prerequisites for later phases. No system-admin capabilities are active today.

## Operational practices

Keep `.env` out of commits and screenshots. Replace the local token and restart Core to revoke bootstrap access. Database credentials require coordinated PostgreSQL rotation; changing `.env` alone does not change an existing volume's password. Apply reviewed forward migrations, back up before changes, and validate restores. Security-sensitive features require a PR and meaningful adversarial tests.
