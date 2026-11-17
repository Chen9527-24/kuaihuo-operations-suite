CREATE TABLE "CustomerServiceCalibrationRecord" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "merchantRoleId" TEXT NOT NULL,
  "industryNodeId" TEXT,
  "evaluationCaseId" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  "improvementMode" VARCHAR(24) NOT NULL DEFAULT 'AI_AUTO',
  "problemTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "problemDescription" TEXT,
  "userSuggestion" TEXT,
  "customerMessage" TEXT NOT NULL,
  "originalReply" TEXT NOT NULL,
  "scenario" VARCHAR(64),
  "intent" VARCHAR(64),
  "riskLevel" VARCHAR(16),
  "generationModel" VARCHAR(120),
  "configurationHash" VARCHAR(64),
  "relatedRoleModuleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "relatedResponseRuleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "relatedAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "understanding" JSONB,
  "runtimeContract" JSONB,
  "qualityReport" JSONB,
  "sourceSnapshot" JSONB,
  "aiDiagnosis" JSONB,
  "aiRecommendations" JSONB,
  "suggestedReply" TEXT,
  "aiModel" VARCHAR(120),
  "aiRequestId" VARCHAR(160),
  "analyzedAt" TIMESTAMP(3),
  "analyzedById" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceCalibrationRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerServiceCalibrationRecord_tenantId_status_updatedAt_idx" ON "CustomerServiceCalibrationRecord"("tenantId", "status", "updatedAt");
CREATE INDEX "CustomerServiceCalibrationRecord_tenantId_merchantRoleId_updatedAt_idx" ON "CustomerServiceCalibrationRecord"("tenantId", "merchantRoleId", "updatedAt");
CREATE INDEX "CustomerServiceCalibrationRecord_tenantId_scenario_idx" ON "CustomerServiceCalibrationRecord"("tenantId", "scenario");
CREATE INDEX "CustomerServiceCalibrationRecord_problemTypes_idx" ON "CustomerServiceCalibrationRecord" USING GIN ("problemTypes");
CREATE INDEX "CustomerServiceCalibrationRecord_evaluationCaseId_idx" ON "CustomerServiceCalibrationRecord"("evaluationCaseId");
CREATE INDEX "CustomerServiceCalibrationRecord_configurationHash_idx" ON "CustomerServiceCalibrationRecord"("configurationHash");
CREATE INDEX "CustomerServiceCalibrationRecord_deletedAt_idx" ON "CustomerServiceCalibrationRecord"("deletedAt");

ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_merchantRoleId_fkey" FOREIGN KEY ("merchantRoleId") REFERENCES "CustomerServiceMerchantRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_industryNodeId_fkey" FOREIGN KEY ("industryNodeId") REFERENCES "CustomerServiceIndustryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_evaluationCaseId_fkey" FOREIGN KEY ("evaluationCaseId") REFERENCES "CustomerServiceEvaluationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_analyzedById_fkey" FOREIGN KEY ("analyzedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
