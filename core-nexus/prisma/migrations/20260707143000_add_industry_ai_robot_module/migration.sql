-- 行业 AI 机器人模块：与现有评论/私信/截流机器人隔离，仅用于行业能力包管理和 DeepSeek 后台测试。
CREATE TABLE "IndustryAiCapabilityPack" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "industryCode" VARCHAR(64) NOT NULL,
  "industryName" VARCHAR(100) NOT NULL,
  "channel" VARCHAR(16) NOT NULL DEFAULT 'BOTH',
  "description" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustryAiCapabilityPack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryAiCapabilityPackVersion" (
  "id" TEXT NOT NULL,
  "packId" TEXT NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "tone" TEXT,
  "replyPrinciples" TEXT,
  "riskPolicy" TEXT,
  "handoffPolicy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustryAiCapabilityPackVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryAiScenario" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "channel" VARCHAR(16) NOT NULL DEFAULT 'BOTH',
  "triggerPhrases" JSONB NOT NULL DEFAULT '[]',
  "intentDescription" TEXT,
  "replyGoal" TEXT,
  "replyFramework" TEXT,
  "riskLevel" VARCHAR(16) NOT NULL DEFAULT 'LOW',
  "replyMode" VARCHAR(32) NOT NULL DEFAULT 'AI_REPLY',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustryAiScenario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryAiScenarioExample" (
  "id" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "userInput" TEXT NOT NULL,
  "recommendedReply" TEXT NOT NULL,
  "notes" TEXT,
  "qualityScore" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustryAiScenarioExample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryAiGuardrail" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "ruleContent" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustryAiGuardrail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryAiRobot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "channel" VARCHAR(16) NOT NULL,
  "industryCode" VARCHAR(64) NOT NULL,
  "industryName" VARCHAR(100) NOT NULL,
  "capabilityPackId" TEXT NOT NULL,
  "capabilityPackVersionId" TEXT NOT NULL,
  "capabilityPackSnapshot" JSONB NOT NULL,
  "brandName" VARCHAR(100),
  "businessProfile" TEXT,
  "businessRules" TEXT,
  "customPrompt" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "remark" TEXT,
  "createdById" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustryAiRobot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryAiTestSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "robotId" TEXT NOT NULL,
  "capabilityPackVersionId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustryAiTestSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryAiTestMessage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" VARCHAR(16) NOT NULL,
  "content" TEXT NOT NULL,
  "trace" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndustryAiTestMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndustryAiCapabilityPackVersion_packId_versionNo_key" ON "IndustryAiCapabilityPackVersion"("packId", "versionNo");
CREATE UNIQUE INDEX "IndustryAiScenario_versionId_code_key" ON "IndustryAiScenario"("versionId", "code");
CREATE INDEX "IndustryAiCapabilityPack_tenantId_status_idx" ON "IndustryAiCapabilityPack"("tenantId", "status");
CREATE INDEX "IndustryAiCapabilityPack_tenantId_industryCode_idx" ON "IndustryAiCapabilityPack"("tenantId", "industryCode");
CREATE INDEX "IndustryAiCapabilityPack_deletedAt_idx" ON "IndustryAiCapabilityPack"("deletedAt");
CREATE INDEX "IndustryAiCapabilityPackVersion_packId_status_idx" ON "IndustryAiCapabilityPackVersion"("packId", "status");
CREATE INDEX "IndustryAiCapabilityPackVersion_status_idx" ON "IndustryAiCapabilityPackVersion"("status");
CREATE INDEX "IndustryAiScenario_versionId_enabled_idx" ON "IndustryAiScenario"("versionId", "enabled");
CREATE INDEX "IndustryAiScenario_versionId_priority_idx" ON "IndustryAiScenario"("versionId", "priority");
CREATE INDEX "IndustryAiScenarioExample_scenarioId_enabled_idx" ON "IndustryAiScenarioExample"("scenarioId", "enabled");
CREATE INDEX "IndustryAiScenarioExample_scenarioId_qualityScore_idx" ON "IndustryAiScenarioExample"("scenarioId", "qualityScore");
CREATE INDEX "IndustryAiGuardrail_versionId_enabled_idx" ON "IndustryAiGuardrail"("versionId", "enabled");
CREATE INDEX "IndustryAiGuardrail_versionId_priority_idx" ON "IndustryAiGuardrail"("versionId", "priority");
CREATE INDEX "IndustryAiRobot_tenantId_status_idx" ON "IndustryAiRobot"("tenantId", "status");
CREATE INDEX "IndustryAiRobot_tenantId_channel_idx" ON "IndustryAiRobot"("tenantId", "channel");
CREATE INDEX "IndustryAiRobot_capabilityPackId_idx" ON "IndustryAiRobot"("capabilityPackId");
CREATE INDEX "IndustryAiRobot_capabilityPackVersionId_idx" ON "IndustryAiRobot"("capabilityPackVersionId");
CREATE INDEX "IndustryAiRobot_deletedAt_idx" ON "IndustryAiRobot"("deletedAt");
CREATE INDEX "IndustryAiTestSession_tenantId_robotId_updatedAt_idx" ON "IndustryAiTestSession"("tenantId", "robotId", "updatedAt");
CREATE INDEX "IndustryAiTestSession_capabilityPackVersionId_idx" ON "IndustryAiTestSession"("capabilityPackVersionId");
CREATE INDEX "IndustryAiTestMessage_sessionId_createdAt_idx" ON "IndustryAiTestMessage"("sessionId", "createdAt");

ALTER TABLE "IndustryAiCapabilityPack" ADD CONSTRAINT "IndustryAiCapabilityPack_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiCapabilityPack" ADD CONSTRAINT "IndustryAiCapabilityPack_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiCapabilityPackVersion" ADD CONSTRAINT "IndustryAiCapabilityPackVersion_packId_fkey" FOREIGN KEY ("packId") REFERENCES "IndustryAiCapabilityPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustryAiCapabilityPackVersion" ADD CONSTRAINT "IndustryAiCapabilityPackVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiCapabilityPackVersion" ADD CONSTRAINT "IndustryAiCapabilityPackVersion_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IndustryAiScenario" ADD CONSTRAINT "IndustryAiScenario_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "IndustryAiCapabilityPackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustryAiScenarioExample" ADD CONSTRAINT "IndustryAiScenarioExample_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "IndustryAiScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustryAiGuardrail" ADD CONSTRAINT "IndustryAiGuardrail_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "IndustryAiCapabilityPackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustryAiRobot" ADD CONSTRAINT "IndustryAiRobot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiRobot" ADD CONSTRAINT "IndustryAiRobot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiRobot" ADD CONSTRAINT "IndustryAiRobot_capabilityPackId_fkey" FOREIGN KEY ("capabilityPackId") REFERENCES "IndustryAiCapabilityPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiRobot" ADD CONSTRAINT "IndustryAiRobot_capabilityPackVersionId_fkey" FOREIGN KEY ("capabilityPackVersionId") REFERENCES "IndustryAiCapabilityPackVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiTestSession" ADD CONSTRAINT "IndustryAiTestSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiTestSession" ADD CONSTRAINT "IndustryAiTestSession_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "IndustryAiRobot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustryAiTestSession" ADD CONSTRAINT "IndustryAiTestSession_capabilityPackVersionId_fkey" FOREIGN KEY ("capabilityPackVersionId") REFERENCES "IndustryAiCapabilityPackVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiTestSession" ADD CONSTRAINT "IndustryAiTestSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryAiTestMessage" ADD CONSTRAINT "IndustryAiTestMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "IndustryAiTestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
