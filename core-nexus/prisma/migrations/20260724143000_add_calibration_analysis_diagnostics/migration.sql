ALTER TABLE "CustomerServiceCalibrationRecord"
ADD COLUMN "aiAnalysisStatus" VARCHAR(32),
ADD COLUMN "aiAnalysisAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "aiAnalysisDiagnostics" JSONB,
ADD COLUMN "aiAnalysisStartedAt" TIMESTAMP(3);

CREATE INDEX "CustomerServiceCalibrationRecord_tenantId_aiAnalysisStatus_updatedAt_idx"
ON "CustomerServiceCalibrationRecord"("tenantId", "aiAnalysisStatus", "updatedAt");
