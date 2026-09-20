CREATE TABLE users (id uuid PRIMARY KEY, display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE devices (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), display_name text NOT NULL, platform text NOT NULL CONSTRAINT devices_platform CHECK(platform IN ('macos','windows')), architecture text NOT NULL CONSTRAINT devices_architecture CHECK(architecture IN ('arm64','x64')), runtime_version text NOT NULL, public_key text NOT NULL, enrollment_status text NOT NULL DEFAULT 'pending' CONSTRAINT devices_enrollment CHECK(enrollment_status IN ('pending','enrolled','rejected')), trust_state text NOT NULL DEFAULT 'untrusted' CONSTRAINT devices_trust CHECK(trust_state IN ('untrusted','trusted','revoked')), last_seen timestamptz, revoked_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}', CONSTRAINT devices_revocation CHECK((trust_state='revoked')=(revoked_at IS NOT NULL)), CONSTRAINT devices_trusted_enrollment CHECK(trust_state <> 'trusted' OR enrollment_status='enrolled'));
CREATE UNIQUE INDEX devices_public_key_unique ON devices(public_key);
CREATE TABLE capabilities(id text PRIMARY KEY, risk text NOT NULL CONSTRAINT capabilities_risk CHECK(risk IN ('LOW','MEDIUM','HIGH','CRITICAL')));
CREATE TABLE device_capabilities(id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), capability text NOT NULL REFERENCES capabilities(id));
CREATE UNIQUE INDEX device_capability_unique ON device_capabilities(device_id,capability);
CREATE TABLE policy_rules(id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES devices(id), capability text NOT NULL REFERENCES capabilities(id), decision text NOT NULL CONSTRAINT policy_decision CHECK(decision IN ('ALLOW','ASK','DENY')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_events(id uuid PRIMARY KEY, version integer NOT NULL CONSTRAINT audit_version CHECK(version=1), type text NOT NULL, timestamp timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, device_id uuid REFERENCES devices(id), correlation_id uuid NOT NULL, request_id uuid NOT NULL, capability text, outcome text NOT NULL CONSTRAINT audit_outcome CHECK(outcome IN ('requested','allowed','denied','succeeded','failed')), approval_id uuid, metadata jsonb NOT NULL);
CREATE INDEX audit_events_correlation ON audit_events(correlation_id);
CREATE INDEX audit_events_timestamp ON audit_events(timestamp);
CREATE TABLE setup_state(id integer PRIMARY KEY CONSTRAINT setup_singleton CHECK(id=1), core_verified boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE schema_metadata(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_metadata(version) VALUES(1);
--> statement-breakpoint
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit events are append-only'; END; $$;
--> statement-breakpoint
CREATE TRIGGER audit_no_update_delete BEFORE UPDATE OR DELETE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
