CREATE TABLE "CustomerServiceIntentCandidate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fingerprint" VARCHAR(160) NOT NULL,
  "recognitionKey" VARCHAR(100) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "suggestedCategory" VARCHAR(48) NOT NULL,
  "suggestedScenario" VARCHAR(64) NOT NULL,
  "suggestedPrimaryIntent" VARCHAR(64) NOT NULL,
  "suggestedRiskLevel" VARCHAR(16) NOT NULL DEFAULT 'LOW',
  "observedIndustryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "confidenceSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maxConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "latestConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "evidence" JSONB NOT NULL,
  "samples" JSONB NOT NULL,
  "sourceContext" JSONB,
  "relatedDefinitionId" TEXT,
  "convertedDefinitionId" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceIntentCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CsIntentCandidate_tenant_fingerprint" ON "CustomerServiceIntentCandidate"("tenantId", "fingerprint");
CREATE INDEX "CsIntentCandidate_tenant_status_seen" ON "CustomerServiceIntentCandidate"("tenantId", "status", "lastSeenAt");
CREATE INDEX "CsIntentCandidate_tenant_category_scenario" ON "CustomerServiceIntentCandidate"("tenantId", "suggestedCategory", "suggestedScenario");
CREATE INDEX "CsIntentCandidate_related_definition" ON "CustomerServiceIntentCandidate"("relatedDefinitionId");
CREATE INDEX "CsIntentCandidate_converted_definition" ON "CustomerServiceIntentCandidate"("convertedDefinitionId");

ALTER TABLE "CustomerServiceIntentCandidate"
  ADD CONSTRAINT "CsIntentCandidate_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
