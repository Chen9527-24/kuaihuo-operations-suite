ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE INDEX IF NOT EXISTS "AppUser_tenantId_idx" ON "AppUser"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AppUser_tenantId_fkey'
  ) THEN
    ALTER TABLE "AppUser"
      ADD CONSTRAINT "AppUser_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
