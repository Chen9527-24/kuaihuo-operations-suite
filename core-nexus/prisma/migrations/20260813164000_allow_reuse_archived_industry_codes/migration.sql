-- Industry tree nodes use soft deletion. Historical rows must retain their original code,
-- while a new active lifecycle is allowed to reuse the same tenant-local code.
--
-- Replace the full-lifecycle unique constraint with an active-row-only unique index.
-- Keep the replacement atomic so there is no write window without database uniqueness.
BEGIN;

DROP INDEX IF EXISTS "CustomerServiceIndustryNode_tenantId_code_key";

CREATE UNIQUE INDEX "CustomerServiceIndustryNode_tenantId_code_active_key"
  ON "CustomerServiceIndustryNode"("tenantId", "code")
  WHERE "deletedAt" IS NULL;

COMMIT;
