CREATE TABLE "CustomerServiceQualityRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "category" VARCHAR(32) NOT NULL,
  "severity" VARCHAR(16) NOT NULL DEFAULT 'ERROR',
  "ruleType" VARCHAR(48) NOT NULL,
  "config" JSONB NOT NULL,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceQualityRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceEvaluationCase" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "merchantRoleId" TEXT,
  "industryNodeId" TEXT,
  "key" VARCHAR(100) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "message" TEXT NOT NULL,
  "expectedScenario" VARCHAR(64),
  "expectedIntent" VARCHAR(64),
  "expectedRiskLevel" VARCHAR(16) NOT NULL DEFAULT 'LOW',
  "expectedRoute" VARCHAR(48),
  "serviceGoal" TEXT,
  "customerState" JSONB,
  "variables" JSONB,
  "expectedRequiredPoints" JSONB,
  "expectedWorkflowSteps" JSONB,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sort" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceEvaluationCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerServiceQualityRule_tenantId_key_key" ON "CustomerServiceQualityRule"("tenantId", "key");
CREATE INDEX "CustomerServiceQualityRule_tenantId_status_sort_idx" ON "CustomerServiceQualityRule"("tenantId", "status", "sort");
CREATE INDEX "CustomerServiceQualityRule_tenantId_category_severity_idx" ON "CustomerServiceQualityRule"("tenantId", "category", "severity");
CREATE INDEX "CustomerServiceQualityRule_deletedAt_idx" ON "CustomerServiceQualityRule"("deletedAt");

CREATE UNIQUE INDEX "CustomerServiceEvaluationCase_tenantId_key_key" ON "CustomerServiceEvaluationCase"("tenantId", "key");
CREATE INDEX "CustomerServiceEvaluationCase_tenantId_status_sort_idx" ON "CustomerServiceEvaluationCase"("tenantId", "status", "sort");
CREATE INDEX "CustomerServiceEvaluationCase_tenantId_merchantRoleId_idx" ON "CustomerServiceEvaluationCase"("tenantId", "merchantRoleId");
CREATE INDEX "CustomerServiceEvaluationCase_tenantId_industryNodeId_idx" ON "CustomerServiceEvaluationCase"("tenantId", "industryNodeId");
CREATE INDEX "CustomerServiceEvaluationCase_tenantId_expectedScenario_expectedRiskLevel_idx" ON "CustomerServiceEvaluationCase"("tenantId", "expectedScenario", "expectedRiskLevel");
CREATE INDEX "CustomerServiceEvaluationCase_deletedAt_idx" ON "CustomerServiceEvaluationCase"("deletedAt");

ALTER TABLE "CustomerServiceQualityRule" ADD CONSTRAINT "CustomerServiceQualityRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceQualityRule" ADD CONSTRAINT "CustomerServiceQualityRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceQualityRule" ADD CONSTRAINT "CustomerServiceQualityRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceEvaluationCase" ADD CONSTRAINT "CustomerServiceEvaluationCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceEvaluationCase" ADD CONSTRAINT "CustomerServiceEvaluationCase_merchantRoleId_fkey" FOREIGN KEY ("merchantRoleId") REFERENCES "CustomerServiceMerchantRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceEvaluationCase" ADD CONSTRAINT "CustomerServiceEvaluationCase_industryNodeId_fkey" FOREIGN KEY ("industryNodeId") REFERENCES "CustomerServiceIndustryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceEvaluationCase" ADD CONSTRAINT "CustomerServiceEvaluationCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceEvaluationCase" ADD CONSTRAINT "CustomerServiceEvaluationCase_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
