-- 行业 AI 机器人专用：店铺固定回复规则库。
-- 仅新增独立 IndustryAiFixedReplyRule 表；不改写既有机器人、能力包、评论数据集或历史测试数据。
CREATE TABLE "IndustryAiFixedReplyRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "robotId" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "channel" VARCHAR(16) NOT NULL DEFAULT 'BOTH',
  "matchType" VARCHAR(32) NOT NULL,
  "triggerPhrases" JSONB NOT NULL DEFAULT '[]',
  "requiredKeywords" JSONB NOT NULL DEFAULT '[]',
  "excludedKeywords" JSONB NOT NULL DEFAULT '[]',
  "replyType" VARCHAR(32) NOT NULL DEFAULT 'DIRECT_REPLY',
  "replyContent" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustryAiFixedReplyRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IndustryAiFixedReplyRule_tenantId_robotId_enabled_idx" ON "IndustryAiFixedReplyRule"("tenantId", "robotId", "enabled");
CREATE INDEX "IndustryAiFixedReplyRule_robotId_priority_idx" ON "IndustryAiFixedReplyRule"("robotId", "priority");
CREATE INDEX "IndustryAiFixedReplyRule_robotId_channel_idx" ON "IndustryAiFixedReplyRule"("robotId", "channel");

ALTER TABLE "IndustryAiFixedReplyRule"
  ADD CONSTRAINT "IndustryAiFixedReplyRule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IndustryAiFixedReplyRule"
  ADD CONSTRAINT "IndustryAiFixedReplyRule_robotId_fkey"
  FOREIGN KEY ("robotId") REFERENCES "IndustryAiRobot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
