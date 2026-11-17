-- Add a compact business dedupe key for intercept capture rows.
-- PostgreSQL unique indexes allow multiple NULL values, so existing rows are not forced to backfill.
ALTER TABLE "InterceptCaptureRecord" ADD COLUMN IF NOT EXISTS "dedupeKey" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "InterceptCaptureRecord_dedupeKey_idx" ON "InterceptCaptureRecord"("dedupeKey");

CREATE UNIQUE INDEX IF NOT EXISTS "intercept_capture_dedupe_unique"
  ON "InterceptCaptureRecord"("tenantId", "robotId", "dedupeKey");
