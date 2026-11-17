CREATE TABLE IF NOT EXISTS "PrivateMessageTaskBatch" (
  "id" TEXT PRIMARY KEY,
  "batchNo" VARCHAR(64) NOT NULL UNIQUE,
  "tenantId" VARCHAR(64) NOT NULL,
  "createdBy" VARCHAR(64),
  "selectedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "robotIds" JSONB,
  "plannedStartAt" TIMESTAMPTZ NOT NULL,
  "plannedEndAt" TIMESTAMPTZ NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  "remark" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "PrivateMessageTask" (
  "id" TEXT PRIMARY KEY,
  "taskNo" VARCHAR(64) NOT NULL UNIQUE,
  "batchId" VARCHAR(64),
  "tenantId" VARCHAR(64) NOT NULL,
  "captureId" VARCHAR(64),
  "robotId" VARCHAR(64) NOT NULL,
  "platform" VARCHAR(32) NOT NULL,
  "targetUserId" VARCHAR(128),
  "targetNickname" VARCHAR(100),
  "targetProfileUrl" TEXT,
  "sourceContentTitle" TEXT,
  "sourceContentUrl" TEXT,
  "sourceCommentId" VARCHAR(128),
  "sourceCommentText" TEXT,
  "intentLevel" VARCHAR(32),
  "intentScore" DOUBLE PRECISION,
  "entryPointSummary" TEXT,
  "messageDraft" TEXT,
  "messageFinal" TEXT,
  "messageSource" VARCHAR(32),
  "plannedStartAt" TIMESTAMPTZ NOT NULL,
  "plannedEndAt" TIMESTAMPTZ NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "claimToken" VARCHAR(64),
  "claimedAt" TIMESTAMPTZ,
  "claimedByRobotId" VARCHAR(64),
  "sendAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastSendAt" TIMESTAMPTZ,
  "sentAt" TIMESTAMPTZ,
  "sendError" TEXT,
  "sendResultRaw" JSONB,
  "riskLevel" VARCHAR(32),
  "riskReason" TEXT,
  "createdBy" VARCHAR(64),
  "approvedBy" VARCHAR(64),
  "approvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "PrivateMessageTaskBatch_tenantId_createdAt_idx" ON "PrivateMessageTaskBatch" ("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "PrivateMessageTaskBatch_status_idx" ON "PrivateMessageTaskBatch" ("status");
CREATE INDEX IF NOT EXISTS "PrivateMessageTask_tenantId_status_createdAt_idx" ON "PrivateMessageTask" ("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PrivateMessageTask_robotId_status_idx" ON "PrivateMessageTask" ("robotId", "status");
CREATE INDEX IF NOT EXISTS "PrivateMessageTask_captureId_idx" ON "PrivateMessageTask" ("captureId");
CREATE INDEX IF NOT EXISTS "PrivateMessageTask_targetUserId_idx" ON "PrivateMessageTask" ("targetUserId");
CREATE INDEX IF NOT EXISTS "PrivateMessageTask_sourceCommentId_idx" ON "PrivateMessageTask" ("sourceCommentId");
CREATE INDEX IF NOT EXISTS "PrivateMessageTask_plannedStartAt_plannedEndAt_idx" ON "PrivateMessageTask" ("plannedStartAt", "plannedEndAt");
