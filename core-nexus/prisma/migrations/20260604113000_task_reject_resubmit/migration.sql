-- Add explicit rejection/resubmission timestamps for H5 task resubmission flow.
ALTER TABLE "TaskParticipant"
ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "resubmitStartedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "TaskParticipant_rejectedAt_idx" ON "TaskParticipant"("rejectedAt");
CREATE INDEX IF NOT EXISTS "TaskParticipant_resubmitStartedAt_idx" ON "TaskParticipant"("resubmitStartedAt");
