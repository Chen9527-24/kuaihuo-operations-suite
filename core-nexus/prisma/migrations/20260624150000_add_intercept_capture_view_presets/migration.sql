-- Per-user, per-tenant display presets for the PC intercept capture table.
-- Does not alter or migrate existing capture records.
CREATE TABLE IF NOT EXISTS "InterceptCaptureViewPreset" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(64) NOT NULL,
  "columns" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterceptCaptureViewPreset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InterceptCaptureViewPreset_tenantId_userId_name_key"
  ON "InterceptCaptureViewPreset"("tenantId", "userId", "name");
CREATE INDEX IF NOT EXISTS "InterceptCaptureViewPreset_tenantId_userId_updatedAt_idx"
  ON "InterceptCaptureViewPreset"("tenantId", "userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "InterceptCaptureViewPreset_tenantId_userId_isDefault_idx"
  ON "InterceptCaptureViewPreset"("tenantId", "userId", "isDefault");
CREATE UNIQUE INDEX IF NOT EXISTS "InterceptCaptureViewPreset_one_default_per_user_tenant"
  ON "InterceptCaptureViewPreset"("tenantId", "userId")
  WHERE "isDefault" = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InterceptCaptureViewPreset_tenantId_fkey'
  ) THEN
    ALTER TABLE "InterceptCaptureViewPreset"
      ADD CONSTRAINT "InterceptCaptureViewPreset_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InterceptCaptureViewPreset_userId_fkey'
  ) THEN
    ALTER TABLE "InterceptCaptureViewPreset"
      ADD CONSTRAINT "InterceptCaptureViewPreset_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Supports the current-page work-level captured-comment aggregation.
CREATE INDEX IF NOT EXISTS "InterceptCaptureRecord_tenantId_platform_platformContentId_idx"
  ON "InterceptCaptureRecord"("tenantId", "platform", "platformContentId");
