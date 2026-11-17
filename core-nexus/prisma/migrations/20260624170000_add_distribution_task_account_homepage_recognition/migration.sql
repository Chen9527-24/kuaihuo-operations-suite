-- Homepage OCR recognition is advisory operational metadata only.
-- It does not modify existing task-account nickname/phone fields or historical orders.
CREATE TABLE IF NOT EXISTS "DistributionTaskAccountHomepageRecognition" (
  "id" TEXT NOT NULL,
  "taskAccountId" TEXT NOT NULL,
  "expectedPlatform" VARCHAR(32) NOT NULL,
  "homepageProofFileId" VARCHAR(64),
  "detectedPlatform" VARCHAR(32),
  "platformConfidence" INTEGER,
  "nicknameCandidate" VARCHAR(100),
  "accountIdCandidate" VARCHAR(100),
  "ocrStatus" VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUESTED',
  "ocrText" TEXT,
  "ocrError" VARCHAR(500),
  "ocrAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "ocrRequestedAt" TIMESTAMP(3),
  "ocrStartedAt" TIMESTAMP(3),
  "ocrCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DistributionTaskAccountHomepageRecognition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DistributionTaskAccountHomepageRecognition_taskAccountId_expectedPlatform_key"
  ON "DistributionTaskAccountHomepageRecognition"("taskAccountId", "expectedPlatform");
CREATE INDEX IF NOT EXISTS "DistributionTaskAccountHomepageRecognition_ocrStatus_updatedAt_idx"
  ON "DistributionTaskAccountHomepageRecognition"("ocrStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "DistributionTaskAccountHomepageRecognition_homepageProofFileId_idx"
  ON "DistributionTaskAccountHomepageRecognition"("homepageProofFileId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'DistributionTaskAccountHomepageRecognition_taskAccountId_fkey'
  ) THEN
    ALTER TABLE "DistributionTaskAccountHomepageRecognition"
      ADD CONSTRAINT "DistributionTaskAccountHomepageRecognition_taskAccountId_fkey"
      FOREIGN KEY ("taskAccountId") REFERENCES "DistributionTaskAccount"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
