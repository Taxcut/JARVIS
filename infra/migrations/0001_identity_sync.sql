-- Forward-only. Existing Phase 1 installations contain no owner/device seeds.
ALTER TABLE users ALTER COLUMN display_name DROP NOT NULL;
ALTER TABLE users ADD COLUMN singleton integer NOT NULL DEFAULT 1 CHECK (singleton = 1);
ALTER TABLE users ADD CONSTRAINT single_owner UNIQUE (singleton);
ALTER TABLE users ADD COLUMN sync_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN preferred_address text NOT NULL DEFAULT 'Sir';
ALTER TABLE users ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE users ADD COLUMN security_revision integer NOT NULL DEFAULT 1 CHECK (security_revision > 0);
ALTER TABLE users ADD COLUMN security_state text NOT NULL DEFAULT 'NORMAL' CHECK (security_state IN ('NORMAL','LOCKDOWN'));
ALTER TABLE devices ADD COLUMN fingerprint text;
ALTER TABLE devices ADD COLUMN enrolled_at timestamptz;
ALTER TABLE devices ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
--> statement-breakpoint
CREATE TABLE passkeys (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), credential_id text NOT NULL UNIQUE,
 public_key text NOT NULL, counter bigint NOT NULL CHECK(counter >= 0), transports jsonb NOT NULL DEFAULT '[]',
 name text NOT NULL, device_type text NOT NULL, backed_up boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_used timestamptz, revoked_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0)
);
CREATE TABLE sessions (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), device_id uuid NOT NULL REFERENCES devices(id),
 access_hash text NOT NULL UNIQUE, refresh_hash text NOT NULL UNIQUE, security_revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_used timestamptz NOT NULL DEFAULT now(),
 access_expires_at timestamptz NOT NULL, idle_expires_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, revision integer NOT NULL DEFAULT 1 CHECK(revision > 0)
);
CREATE INDEX sessions_device ON sessions(device_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE auth_ceremonies (
 id uuid PRIMARY KEY, mode text NOT NULL CHECK(mode IN ('bootstrap','login','stepup','add','recovery','enrollment')),
 device jsonb NOT NULL, owner_id uuid REFERENCES users(id), session_id uuid REFERENCES sessions(id),
 browser_hash text NOT NULL UNIQUE, redeem_hash text NOT NULL UNIQUE, proof_challenge text NOT NULL,
 challenge text, purpose text, target text, enrollment_id uuid,
 activated_at timestamptz, challenge_used_at timestamptz, completed_at timestamptz, redeemed_at timestamptz,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_ceremonies_expiry ON auth_ceremonies(expires_at);
CREATE TABLE replay_nonces (
 session_id uuid NOT NULL REFERENCES sessions(id), nonce_hash text NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(session_id,nonce_hash)
);
CREATE INDEX replay_nonces_expiry ON replay_nonces(expires_at);
CREATE TABLE step_up_grants (
 id uuid PRIMARY KEY, secret_hash text NOT NULL UNIQUE, owner_id uuid NOT NULL REFERENCES users(id),
 device_id uuid NOT NULL REFERENCES devices(id), session_id uuid NOT NULL REFERENCES sessions(id),
 purpose text NOT NULL, target text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE INDEX step_up_grants_expiry ON step_up_grants(expires_at);
CREATE TABLE recovery_codes (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), secret_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz
);
CREATE TABLE device_enrollments (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), source_device_id uuid NOT NULL REFERENCES devices(id),
 secret_hash text NOT NULL UNIQUE, device jsonb, fingerprint text,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','REQUESTED','APPROVED','DENIED','EXPIRED','CONSUMED','CANCELLED')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 decided_at timestamptz, deciding_session_id uuid REFERENCES sessions(id)
);
CREATE INDEX device_enrollments_expiry ON device_enrollments(expires_at);
ALTER TABLE auth_ceremonies ADD CONSTRAINT ceremony_enrollment_fk FOREIGN KEY(enrollment_id) REFERENCES device_enrollments(id);
CREATE TABLE approval_requests (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), source_device_id uuid NOT NULL REFERENCES devices(id),
 capability text NOT NULL, risk text NOT NULL CHECK(risk IN ('LOW','MEDIUM','HIGH','CRITICAL')), summary text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','DENIED','EXPIRED','CANCELLED')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0), idempotency_key uuid NOT NULL UNIQUE, decision_key uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 decided_at timestamptz, deciding_session_id uuid REFERENCES sessions(id),
 execution_authorized boolean NOT NULL DEFAULT false CHECK(execution_authorized = false)
);
CREATE INDEX approval_requests_expiry ON approval_requests(expires_at);
CREATE TABLE sync_events (
 sequence bigserial PRIMARY KEY, id uuid NOT NULL UNIQUE, version integer NOT NULL CHECK(version = 1),
 owner_id uuid NOT NULL REFERENCES users(id), type text NOT NULL, resource_id uuid NOT NULL, revision integer NOT NULL CHECK(revision > 0),
 timestamp timestamptz NOT NULL DEFAULT now(), correlation_id uuid NOT NULL, payload jsonb NOT NULL CHECK(payload = '{"changed":true}'::jsonb)
);
CREATE INDEX sync_events_owner_sequence ON sync_events(owner_id,sequence);
CREATE INDEX sync_events_timestamp ON sync_events(timestamp);
CREATE TABLE sync_tickets (
 secret_hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), expires_at timestamptz NOT NULL
);
CREATE INDEX sync_tickets_expiry ON sync_tickets(expires_at);
CREATE TABLE security_rate_limits (
 key text PRIMARY KEY, count integer NOT NULL CHECK(count > 0), expires_at timestamptz NOT NULL
);
CREATE INDEX security_rate_limits_expiry ON security_rate_limits(expires_at);
ALTER TABLE audit_events ADD COLUMN risk text CHECK(risk IN ('LOW','MEDIUM','HIGH','CRITICAL'));
UPDATE schema_metadata SET version = 2;
