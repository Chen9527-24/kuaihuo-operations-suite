ALTER TABLE "CustomerServiceTuningSession"
  ADD COLUMN "stateSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "stateRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "contextPayloadBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stateUpdatedAt" TIMESTAMP(3);

ALTER TABLE "CustomerServiceTuningAnalysis"
  ADD COLUMN "feedbackType" VARCHAR(24),
  ADD COLUMN "requestedDeltas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "stateRevision" INTEGER;

CREATE INDEX "CsTuningAnalysis_feedback_created" ON "CustomerServiceTuningAnalysis"("feedbackType", "createdAt");
CREATE INDEX "CsTuningAnalysis_state_revision" ON "CustomerServiceTuningAnalysis"("sessionId", "stateRevision");
