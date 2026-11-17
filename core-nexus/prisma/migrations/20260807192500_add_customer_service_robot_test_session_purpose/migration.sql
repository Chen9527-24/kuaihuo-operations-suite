ALTER TABLE "CustomerServiceTuningSession"
ADD COLUMN "purpose" VARCHAR(32) NOT NULL DEFAULT 'TUNING';

CREATE INDEX "CsTuningSession_tenant_purpose_status_updated"
ON "CustomerServiceTuningSession"("tenantId", "purpose", "status", "updatedAt");
