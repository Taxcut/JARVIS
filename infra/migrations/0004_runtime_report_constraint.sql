-- SQL CHECK accepts NULL; require an explicit JSON boolean false, not a missing key.
ALTER TABLE runtime_presence DROP CONSTRAINT runtime_presence_report_check;
ALTER TABLE runtime_presence ADD CONSTRAINT runtime_presence_report_check
 CHECK(jsonb_typeof(report)='object' AND report ? 'executionAvailable' AND report->'executionAvailable'='false'::jsonb);
UPDATE schema_metadata SET version=5;
