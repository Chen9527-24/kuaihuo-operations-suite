-- Link real dialogue/comment records to the authoritative customer-service Reply Trace.
-- All new columns are nullable-by-behavior (empty-string defaults) for old clients and existing rows.

ALTER TABLE "CommentRecord"
  ADD COLUMN "replyAttemptId" VARCHAR(512) NOT NULL DEFAULT '',
  ADD COLUMN "replyTraceId" VARCHAR(512) NOT NULL DEFAULT '',
  ADD COLUMN "generationSource" VARCHAR(64) NOT NULL DEFAULT '';

CREATE INDEX "CommentRecord_tenant_reply_attempt_idx"
  ON "CommentRecord"("tenantId", "replyAttemptId");
CREATE INDEX "CommentRecord_tenant_reply_trace_idx"
  ON "CommentRecord"("tenantId", "replyTraceId");

ALTER TABLE "DialogueMessage"
  ADD COLUMN "replyTraceId" VARCHAR(512) NOT NULL DEFAULT '',
  ADD COLUMN "generationSource" VARCHAR(64) NOT NULL DEFAULT '';

CREATE INDEX "DialogueMessage_tenant_reply_attempt_idx"
  ON "DialogueMessage"("tenantId", "replyAttemptId");
CREATE INDEX "DialogueMessage_tenant_reply_trace_idx"
  ON "DialogueMessage"("tenantId", "replyTraceId");
