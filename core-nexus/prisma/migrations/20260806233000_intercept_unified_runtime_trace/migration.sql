ALTER TABLE "InterceptCaptureRecord"
  ADD COLUMN "workDecisionTraceId" VARCHAR(64),
  ADD COLUMN "workDecisionProvider" VARCHAR(40),
  ADD COLUMN "workDecisionModel" VARCHAR(120),
  ADD COLUMN "workDecisionConfigurationHash" VARCHAR(64),
  ADD COLUMN "intentReplyTraceId" VARCHAR(64),
  ADD COLUMN "intentGenerationSource" VARCHAR(64),
  ADD COLUMN "intentGenerationProvider" VARCHAR(40),
  ADD COLUMN "intentGenerationModel" VARCHAR(120),
  ADD COLUMN "intentQualityStatus" VARCHAR(32),
  ADD COLUMN "intentSafetyStatus" VARCHAR(32);

CREATE INDEX "InterceptCaptureRecord_workDecisionTraceId_idx" ON "InterceptCaptureRecord"("workDecisionTraceId");
CREATE INDEX "InterceptCaptureRecord_intentReplyTraceId_idx" ON "InterceptCaptureRecord"("intentReplyTraceId");

ALTER TABLE "PrivateMessageTask"
  ADD COLUMN "replyTraceId" VARCHAR(64),
  ADD COLUMN "generationSource" VARCHAR(64),
  ADD COLUMN "generationProvider" VARCHAR(40),
  ADD COLUMN "generationModel" VARCHAR(120),
  ADD COLUMN "qualityStatus" VARCHAR(32),
  ADD COLUMN "safetyStatus" VARCHAR(32);

CREATE INDEX "PrivateMessageTask_replyTraceId_idx" ON "PrivateMessageTask"("replyTraceId");
