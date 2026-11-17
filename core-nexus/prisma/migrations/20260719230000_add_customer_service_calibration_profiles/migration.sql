ALTER TABLE "CustomerServiceCalibrationRecord"
  ADD COLUMN "tuningDirectives" JSONB,
  ADD COLUMN "appliedProfileId" TEXT,
  ADD COLUMN "appliedScopeType" VARCHAR(32),
  ADD COLUMN "appliedScopeKey" VARCHAR(500),
  ADD COLUMN "appliedAt" TIMESTAMP(3),
  ADD COLUMN "appliedById" TEXT;

CREATE TABLE "CustomerServiceCalibrationProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "merchantRoleId" TEXT NOT NULL,
  "industryNodeId" TEXT,
  "scopeType" VARCHAR(32) NOT NULL,
  "scopeKey" VARCHAR(500) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "scenario" VARCHAR(64),
  "intent" VARCHAR(64),
  "riskLevel" VARCHAR(16),
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "directives" JSONB NOT NULL,
  "examples" JSONB,
  "sourceRecordIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceConfigurationHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "appliedCount" INTEGER NOT NULL DEFAULT 1,
  "lastAppliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceCalibrationProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerServiceCalibrationProfile_tenantId_scopeKey_key"
  ON "CustomerServiceCalibrationProfile"("tenantId", "scopeKey");
CREATE INDEX "CustomerServiceCalibrationProfile_tenantId_merchantRoleId_status_idx"
  ON "CustomerServiceCalibrationProfile"("tenantId", "merchantRoleId", "status");
CREATE INDEX "CustomerServiceCalibrationProfile_tenantId_merchantRoleId_scenario_intent_riskLevel_idx"
  ON "CustomerServiceCalibrationProfile"("tenantId", "merchantRoleId", "scenario", "intent", "riskLevel");
CREATE INDEX "CustomerServiceCalibrationProfile_tenantId_industryNodeId_status_idx"
  ON "CustomerServiceCalibrationProfile"("tenantId", "industryNodeId", "status");
CREATE INDEX "CustomerServiceCalibrationProfile_deletedAt_idx"
  ON "CustomerServiceCalibrationProfile"("deletedAt");
CREATE INDEX "CustomerServiceCalibrationRecord_appliedProfileId_idx"
  ON "CustomerServiceCalibrationRecord"("appliedProfileId");
CREATE INDEX "CustomerServiceCalibrationRecord_appliedScopeKey_idx"
  ON "CustomerServiceCalibrationRecord"("appliedScopeKey");

ALTER TABLE "CustomerServiceCalibrationProfile" ADD CONSTRAINT "CustomerServiceCalibrationProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationProfile" ADD CONSTRAINT "CustomerServiceCalibrationProfile_merchantRoleId_fkey"
  FOREIGN KEY ("merchantRoleId") REFERENCES "CustomerServiceMerchantRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationProfile" ADD CONSTRAINT "CustomerServiceCalibrationProfile_industryNodeId_fkey"
  FOREIGN KEY ("industryNodeId") REFERENCES "CustomerServiceIndustryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationProfile" ADD CONSTRAINT "CustomerServiceCalibrationProfile_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationProfile" ADD CONSTRAINT "CustomerServiceCalibrationProfile_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_appliedProfileId_fkey"
  FOREIGN KEY ("appliedProfileId") REFERENCES "CustomerServiceCalibrationProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_appliedById_fkey"
  FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
