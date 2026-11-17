-- 团长申请、默认分佣规则、任务分佣快照及团长佣金独立结算。

-- AlterTable
ALTER TABLE "DistributionGroup"
  ADD COLUMN "commissionRuleType" VARCHAR(16),
  ADD COLUMN "commissionRuleValue" INTEGER;

-- AlterTable
ALTER TABLE "DailyTask"
  ADD COLUMN "taskBudgetAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commissionMode" VARCHAR(16),
  ADD COLUMN "commissionRuleType" VARCHAR(16),
  ADD COLUMN "commissionRuleValue" INTEGER,
  ADD COLUMN "commissionAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commissionGroupId" TEXT,
  ADD COLUMN "commissionLeaderUserId" TEXT;

-- 旧任务没有独立预算字段时，默认把原成员奖励作为任务金额，保持历史成员端金额不变。
UPDATE "DailyTask"
SET "taskBudgetAmount" = "rewardAmount"
WHERE "taskBudgetAmount" = 0 AND "rewardAmount" <> 0;

-- AlterTable
ALTER TABLE "TaskParticipant"
  ADD COLUMN "leaderCommissionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "leaderCommissionGroupId" TEXT,
  ADD COLUMN "leaderCommissionLeaderUserId" TEXT,
  ADD COLUMN "leaderCommissionMode" VARCHAR(16),
  ADD COLUMN "leaderCommissionAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leaderCommissionSettledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DistributionLeaderApplication" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "appUserId" TEXT NOT NULL,
  "currentGroupId" TEXT,
  "requestedGroupName" VARCHAR(100) NOT NULL,
  "reason" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "reviewRemark" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "groupId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DistributionLeaderApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderCommissionSettlement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "leaderUserId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "workerUserId" TEXT,
  "workerRewardAmount" INTEGER NOT NULL,
  "commissionAmount" INTEGER NOT NULL,
  "commissionMode" VARCHAR(16) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'SETTLED',
  "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledById" TEXT,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaderCommissionSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyTask_commissionGroupId_idx" ON "DailyTask"("commissionGroupId");
CREATE INDEX "DailyTask_commissionLeaderUserId_idx" ON "DailyTask"("commissionLeaderUserId");
CREATE INDEX "TaskParticipant_leaderCommissionGroupId_idx" ON "TaskParticipant"("leaderCommissionGroupId");
CREATE INDEX "TaskParticipant_leaderCommissionLeaderUserId_idx" ON "TaskParticipant"("leaderCommissionLeaderUserId");
CREATE INDEX "DistributionLeaderApplication_appUserId_status_idx" ON "DistributionLeaderApplication"("appUserId", "status");
CREATE INDEX "DistributionLeaderApplication_tenantId_status_createdAt_idx" ON "DistributionLeaderApplication"("tenantId", "status", "createdAt");
CREATE INDEX "DistributionLeaderApplication_groupId_idx" ON "DistributionLeaderApplication"("groupId");
CREATE INDEX "DistributionLeaderApplication_createdAt_idx" ON "DistributionLeaderApplication"("createdAt");
CREATE UNIQUE INDEX "LeaderCommissionSettlement_participantId_key" ON "LeaderCommissionSettlement"("participantId");
CREATE INDEX "LeaderCommissionSettlement_tenantId_settledAt_idx" ON "LeaderCommissionSettlement"("tenantId", "settledAt");
CREATE INDEX "LeaderCommissionSettlement_leaderUserId_settledAt_idx" ON "LeaderCommissionSettlement"("leaderUserId", "settledAt");
CREATE INDEX "LeaderCommissionSettlement_groupId_settledAt_idx" ON "LeaderCommissionSettlement"("groupId", "settledAt");
CREATE INDEX "LeaderCommissionSettlement_taskId_idx" ON "LeaderCommissionSettlement"("taskId");
