ALTER TABLE sessions ADD COLUMN kind text NOT NULL DEFAULT 'owner' CHECK(kind IN ('owner','runtime'));
CREATE UNIQUE INDEX sessions_one_active_runtime ON sessions(device_id) WHERE kind='runtime' AND revoked_at IS NULL;
CREATE TABLE runtime_presence (
 device_id uuid PRIMARY KEY REFERENCES devices(id), owner_id uuid NOT NULL REFERENCES users(id),
 session_id uuid NOT NULL REFERENCES sessions(id), instance_id uuid NOT NULL,
 report jsonb NOT NULL CHECK(jsonb_typeof(report)='object' AND report->>'executionAvailable'='false'),
 state text NOT NULL CHECK(state IN ('UNCONFIGURED','STARTING','CONNECTING','ONLINE','DEGRADED','OFFLINE','SUSPENDING','STOPPING','AUTH_REQUIRED','REVOKED','UPDATE_REQUIRED','ERROR')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 last_seen timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE INDEX runtime_presence_expiry ON runtime_presence(expires_at);
UPDATE schema_metadata SET version=4;
