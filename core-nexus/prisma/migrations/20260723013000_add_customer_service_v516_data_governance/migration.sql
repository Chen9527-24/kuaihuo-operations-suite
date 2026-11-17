ALTER TABLE "CustomerServiceIntentCandidate"
  ADD COLUMN "retentionClass" VARCHAR(24) NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "CustomerServiceTuningSession"
  ADD COLUMN "retentionClass" VARCHAR(24) NOT NULL DEFAULT 'SHORT',
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "CustomerServiceTuningAnalysis"
  ADD COLUMN "primaryScenario" VARCHAR(64),
  ADD COLUMN "primaryIntent" VARCHAR(64),
  ADD COLUMN "dominantTurnGoal" VARCHAR(64),
  ADD COLUMN "recognitionPath" VARCHAR(32),
  ADD COLUMN "generationModel" VARCHAR(120),
  ADD COLUMN "qualityStatus" VARCHAR(24),
  ADD COLUMN "configurationHash" VARCHAR(64),
  ADD COLUMN "contentHash" VARCHAR(64),
  ADD COLUMN "payloadBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "payloadState" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "retentionClass" VARCHAR(24) NOT NULL DEFAULT 'SHORT',
  ADD COLUMN "compactedAt" TIMESTAMP(3),
  ADD COLUMN "purgedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "CustomerServiceCalibrationRecord"
  ADD COLUMN "sourceAnalysisId" TEXT,
  ADD COLUMN "userFeedback" VARCHAR(24),
  ADD COLUMN "correctionTarget" VARCHAR(32),
  ADD COLUMN "rejectedMoves" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "dominantTurnGoal" VARCHAR(64),
  ADD COLUMN "currentResponseObligation" TEXT,
  ADD COLUMN "contentHash" VARCHAR(64),
  ADD COLUMN "payloadBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "payloadState" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "retentionClass" VARCHAR(24) NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "compactedAt" TIMESTAMP(3),
  ADD COLUMN "purgedAt" TIMESTAMP(3);

CREATE TABLE "CustomerServiceDataGovernanceRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "mode" VARCHAR(24) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "scope" JSONB,
  "configurationSnapshot" JSONB NOT NULL,
  "cursor" VARCHAR(160),
  "batchSize" INTEGER NOT NULL DEFAULT 100,
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedBytes" BIGINT NOT NULL DEFAULT 0,
  "releasedBytes" BIGINT NOT NULL DEFAULT 0,
  "result" JSONB,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceDataGovernanceRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerServiceCalibrationRecord"
  ADD CONSTRAINT "CustomerServiceCalibrationRecord_sourceAnalysisId_fkey"
  FOREIGN KEY ("sourceAnalysisId") REFERENCES "CustomerServiceTuningAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceDataGovernanceRun"
  ADD CONSTRAINT "CustomerServiceDataGovernanceRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CsTuningAnalysis_created_payload_state" ON "CustomerServiceTuningAnalysis"("createdAt", "payloadState");
CREATE INDEX "CsTuningAnalysis_configuration_hash" ON "CustomerServiceTuningAnalysis"("configurationHash");
CREATE INDEX "CsTuningAnalysis_content_hash" ON "CustomerServiceTuningAnalysis"("contentHash");
CREATE INDEX "CustomerServiceCalibrationRecord_sourceAnalysisId_idx" ON "CustomerServiceCalibrationRecord"("sourceAnalysisId");
CREATE INDEX "CustomerServiceCalibrationRecord_contentHash_idx" ON "CustomerServiceCalibrationRecord"("contentHash");
CREATE INDEX "CustomerServiceCalibrationRecord_tenantId_correctionTarget_createdAt_idx" ON "CustomerServiceCalibrationRecord"("tenantId", "correctionTarget", "createdAt");
CREATE INDEX "CustomerServiceCalibrationRecord_tenantId_payloadState_createdAt_idx" ON "CustomerServiceCalibrationRecord"("tenantId", "payloadState", "createdAt");
CREATE INDEX "CustomerServiceDataGovernanceRun_tenantId_createdAt_idx" ON "CustomerServiceDataGovernanceRun"("tenantId", "createdAt");
CREATE INDEX "CustomerServiceDataGovernanceRun_tenantId_mode_status_idx" ON "CustomerServiceDataGovernanceRun"("tenantId", "mode", "status");
