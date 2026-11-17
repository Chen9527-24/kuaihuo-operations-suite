ALTER TABLE "DailyTask"
  ADD COLUMN IF NOT EXISTS "distributionScope" VARCHAR(32) NOT NULL DEFAULT 'TENANT',
  ADD COLUMN IF NOT EXISTS "distributionGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "allowGroupCollaboration" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "commissionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "commissionRuleId" TEXT;

ALTER TABLE "TaskParticipant"
  ADD COLUMN IF NOT EXISTS "taskAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "taskAccountPhone" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "taskAccountNickname" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "primaryGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "taskOwnerGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "participantGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceCollaborationId" TEXT,
  ADD COLUMN IF NOT EXISTS "commissionBaseAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionCalculated" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "DistributionGroup" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "leaderName" VARCHAR(80),
  "leaderPhone" VARCHAR(20),
  "leaderUserId" TEXT,
  "leaderTaskAccountId" TEXT,
  "memberInviteCode" VARCHAR(32) NOT NULL UNIQUE,
  "leaderBindCode" VARCHAR(64) NOT NULL UNIQUE,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "commissionEnabled" BOOLEAN NOT NULL DEFAULT false,
  "selfCommissionEnabled" BOOLEAN NOT NULL DEFAULT false,
  "defaultCommissionRuleId" TEXT,
  "remark" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "DistributionUserBinding" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "bindSource" VARCHAR(32) NOT NULL DEFAULT 'INVITE',
  "inviteCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unbindAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "DistributionTaskAccount" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "phone" VARCHAR(20) NOT NULL UNIQUE,
  "nickname" VARCHAR(80) NOT NULL,
  "smsVerified" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "GroupCollaboration" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "sourceGroupId" TEXT NOT NULL,
  "targetGroupId" TEXT NOT NULL,
  "scopeType" VARCHAR(64) NOT NULL DEFAULT 'ALL_COLLABORATIVE_TASKS',
  "status" VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
  "allowAllCollaborativeTasks" BOOLEAN NOT NULL DEFAULT true,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "DailyTask_distributionGroupId_idx" ON "DailyTask"("distributionGroupId");
CREATE INDEX IF NOT EXISTS "DailyTask_distributionScope_idx" ON "DailyTask"("distributionScope");
CREATE INDEX IF NOT EXISTS "DailyTask_allowGroupCollaboration_idx" ON "DailyTask"("allowGroupCollaboration");
CREATE INDEX IF NOT EXISTS "TaskParticipant_taskAccountId_idx" ON "TaskParticipant"("taskAccountId");
CREATE INDEX IF NOT EXISTS "TaskParticipant_taskAccountPhone_idx" ON "TaskParticipant"("taskAccountPhone");
CREATE INDEX IF NOT EXISTS "TaskParticipant_primaryGroupId_idx" ON "TaskParticipant"("primaryGroupId");
CREATE INDEX IF NOT EXISTS "TaskParticipant_participantGroupId_idx" ON "TaskParticipant"("participantGroupId");
CREATE INDEX IF NOT EXISTS "DistributionGroup_tenantId_status_idx" ON "DistributionGroup"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "DistributionGroup_leaderUserId_idx" ON "DistributionGroup"("leaderUserId");
CREATE INDEX IF NOT EXISTS "DistributionGroup_leaderPhone_idx" ON "DistributionGroup"("leaderPhone");
CREATE INDEX IF NOT EXISTS "DistributionGroup_createdAt_idx" ON "DistributionGroup"("createdAt");
CREATE INDEX IF NOT EXISTS "DistributionUserBinding_userId_status_idx" ON "DistributionUserBinding"("userId", "status");
CREATE INDEX IF NOT EXISTS "DistributionUserBinding_tenantId_groupId_status_idx" ON "DistributionUserBinding"("tenantId", "groupId", "status");
CREATE INDEX IF NOT EXISTS "DistributionUserBinding_groupId_status_idx" ON "DistributionUserBinding"("groupId", "status");
CREATE INDEX IF NOT EXISTS "DistributionTaskAccount_userId_status_idx" ON "DistributionTaskAccount"("userId", "status");
CREATE INDEX IF NOT EXISTS "DistributionTaskAccount_tenantId_groupId_status_idx" ON "DistributionTaskAccount"("tenantId", "groupId", "status");
CREATE INDEX IF NOT EXISTS "DistributionTaskAccount_groupId_status_idx" ON "DistributionTaskAccount"("groupId", "status");
CREATE INDEX IF NOT EXISTS "GroupCollaboration_tenantId_status_idx" ON "GroupCollaboration"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "GroupCollaboration_sourceGroupId_targetGroupId_status_idx" ON "GroupCollaboration"("sourceGroupId", "targetGroupId", "status");
CREATE INDEX IF NOT EXISTS "GroupCollaboration_targetGroupId_status_idx" ON "GroupCollaboration"("targetGroupId", "status");
CREATE INDEX IF NOT EXISTS "GroupCollaboration_endAt_idx" ON "GroupCollaboration"("endAt");
