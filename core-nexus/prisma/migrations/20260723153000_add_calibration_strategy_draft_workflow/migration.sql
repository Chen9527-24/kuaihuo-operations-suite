ALTER TABLE "CustomerServiceCalibrationRecord"
  ADD COLUMN "strategyDraftAssetId" TEXT,
  ADD COLUMN "strategyDraftVersionId" TEXT,
  ADD COLUMN "strategyDraftStatus" VARCHAR(32),
  ADD COLUMN "strategyDraftRegression" JSONB,
  ADD COLUMN "strategyDraftValidatedAt" TIMESTAMP(3),
  ADD COLUMN "strategyDraftPublishedAt" TIMESTAMP(3);

CREATE INDEX "CustomerServiceCalibrationRecord_strategyDraftAssetId_idx"
  ON "CustomerServiceCalibrationRecord"("strategyDraftAssetId");

CREATE INDEX "CustomerServiceCalibrationRecord_strategyDraftVersionId_idx"
  ON "CustomerServiceCalibrationRecord"("strategyDraftVersionId");

CREATE INDEX "CustomerServiceCalibrationRecord_tenantId_strategyDraftStatus_updatedAt_idx"
  ON "CustomerServiceCalibrationRecord"("tenantId", "strategyDraftStatus", "updatedAt");
