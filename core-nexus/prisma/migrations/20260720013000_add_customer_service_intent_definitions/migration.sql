CREATE TABLE "CustomerServiceIntentDefinition" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(48) NOT NULL,
  "description" TEXT,
  "scenario" VARCHAR(64) NOT NULL,
  "primaryIntent" VARCHAR(64) NOT NULL,
  "defaultRiskLevel" VARCHAR(16) NOT NULL DEFAULT 'LOW',
  "supportedIndustryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "recognitionConfig" JSONB NOT NULL,
  "strategyConfig" JSONB NOT NULL,
  "flowConfig" JSONB NOT NULL,
  "replyConfig" JSONB NOT NULL,
  "examples" JSONB,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceIntentDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CsIntentDefinition_tenant_key" ON "CustomerServiceIntentDefinition"("tenantId", "key");
CREATE INDEX "CsIntentDefinition_tenant_status_category" ON "CustomerServiceIntentDefinition"("tenantId", "status", "category", "sort");
CREATE INDEX "CsIntentDefinition_tenant_scenario_intent" ON "CustomerServiceIntentDefinition"("tenantId", "scenario", "primaryIntent", "status");
CREATE INDEX "CsIntentDefinition_industry_codes" ON "CustomerServiceIntentDefinition" USING GIN ("supportedIndustryCodes");
CREATE INDEX "CsIntentDefinition_deleted_at" ON "CustomerServiceIntentDefinition"("deletedAt");

ALTER TABLE "CustomerServiceIntentDefinition"
  ADD CONSTRAINT "CsIntentDefinition_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceIntentDefinition"
  ADD CONSTRAINT "CsIntentDefinition_created_by_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceIntentDefinition"
  ADD CONSTRAINT "CsIntentDefinition_updated_by_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
