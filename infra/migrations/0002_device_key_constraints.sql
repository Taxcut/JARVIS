-- Preserve 0001 after local application; strengthen encoding and key identity.
ALTER TABLE devices ADD CONSTRAINT devices_public_key_encoding
 CHECK (public_key ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$');
ALTER TABLE devices ADD CONSTRAINT devices_fingerprint_encoding
 CHECK (fingerprint IS NULL OR fingerprint ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX devices_fingerprint_unique ON devices(fingerprint);
UPDATE schema_metadata SET version=3;
