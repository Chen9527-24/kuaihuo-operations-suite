-- H5 public task flow: public task lookup, step config, visitor claim/completion tracking.

ALTER TABLE "DailyTask"
  ADD COLUMN "postId" VARCHAR(64),
  ADD COLUMN "authorName" VARCHAR(100),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "stepConfig" JSONB;

CREATE UNIQUE INDEX "DailyTask_tenantId_platform_postId_key" ON "DailyTask"("tenantId", "platform", "postId");

ALTER TABLE "TaskComment"
  ADD COLUMN "participantId" TEXT,
  ADD COLUMN "claimerName" VARCHAR(50);

CREATE INDEX "TaskComment_participantId_idx" ON "TaskComment"("participantId");

CREATE TABLE "TaskParticipant" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "visitorToken" VARCHAR(64) NOT NULL,
  "visitorName" VARCHAR(50),
  "status" VARCHAR(32) NOT NULL DEFAULT 'STARTED',
  "sourcePlatform" VARCHAR(32),
  "ip" TEXT,
  "userAgent" TEXT,
  "startedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastActiveAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskParticipant_visitorToken_key" ON "TaskParticipant"("visitorToken");
CREATE INDEX "TaskParticipant_taskId_idx" ON "TaskParticipant"("taskId");
CREATE INDEX "TaskParticipant_status_idx" ON "TaskParticipant"("status");
CREATE INDEX "TaskParticipant_visitorName_idx" ON "TaskParticipant"("visitorName");

ALTER TABLE "TaskParticipant"
  ADD CONSTRAINT "TaskParticipant_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment"
  ADD CONSTRAINT "TaskComment_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "TaskParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
