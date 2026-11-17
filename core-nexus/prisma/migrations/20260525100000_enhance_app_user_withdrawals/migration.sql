-- Enhance H5 user withdrawals for freeze/release, admin review and transfer provider modes.
ALTER TABLE "AppUserWithdrawal"
ADD COLUMN IF NOT EXISTS "tenantId" TEXT,
ADD COLUMN IF NOT EXISTS "transferMode" VARCHAR(32) NOT NULL DEFAULT 'MOCK',
ADD COLUMN IF NOT EXISTS "outBillNo" VARCHAR(32),
ADD COLUMN IF NOT EXISTS "transferBillNo" VARCHAR(128),
ADD COLUMN IF NOT EXISTS "transferState" VARCHAR(64),
ADD COLUMN IF NOT EXISTS "transferPackageInfo" TEXT,
ADD COLUMN IF NOT EXISTS "transferPackageExpireAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "transferMchId" VARCHAR(32),
ADD COLUMN IF NOT EXISTS "transferAppId" VARCHAR(32),
ADD COLUMN IF NOT EXISTS "rejectReason" TEXT,
ADD COLUMN IF NOT EXISTS "failReason" TEXT,
ADD COLUMN IF NOT EXISTS "operatorId" TEXT,
ADD COLUMN IF NOT EXISTS "notifyRaw" JSONB,
ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

UPDATE "AppUserWithdrawal" w
SET "tenantId" = u."tenantId"
FROM "AppUser" u
WHERE w."appUserId" = u."id" AND w."tenantId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AppUserWithdrawal_outBillNo_key" ON "AppUserWithdrawal"("outBillNo");
CREATE INDEX IF NOT EXISTS "AppUserWithdrawal_tenantId_status_idx" ON "AppUserWithdrawal"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "AppUserWithdrawal_transferMode_idx" ON "AppUserWithdrawal"("transferMode");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AppUserWithdrawal_tenantId_fkey'
  ) THEN
    ALTER TABLE "AppUserWithdrawal"
    ADD CONSTRAINT "AppUserWithdrawal_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
