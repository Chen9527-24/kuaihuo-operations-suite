-- CreateTable
CREATE TABLE "AutoReplyPromptConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" VARCHAR(16) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "customSystemPrompt" TEXT,
    "customUserPrompt" TEXT,
    "forbiddenWords" TEXT,
    "requiredWords" TEXT,
    "replyStyle" TEXT,
    "platformLabel" TEXT,
    "accountPositioning" TEXT,
    "businessProfile" TEXT,
    "goal" TEXT,
    "policy" TEXT,
    "safetyPolicy" TEXT,
    "replyLength" INTEGER,
    "maxMsgCount" INTEGER,
    "extraParams" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoReplyPromptConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoReplyRobotSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "module" VARCHAR(16) NOT NULL,
    "promptConfigId" TEXT,
    "promptSnapshot" JSONB,
    "commentReplyMode" VARCHAR(32),
    "replyDatasetId" TEXT,
    "enableFirstReply" BOOLEAN NOT NULL DEFAULT false,
    "firstReplyContents" JSONB,
    "useConversationContext" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoReplyRobotSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentReplyDataset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentReplyDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentReplyDatasetEntry" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "commentContent" TEXT NOT NULL,
    "replyContent" TEXT NOT NULL,
    "keywords" JSONB,
    "matchType" VARCHAR(32) NOT NULL DEFAULT 'FUZZY',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentReplyDatasetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT,
    "recordId" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "botNickname" VARCHAR(100) NOT NULL,
    "postTitle" TEXT,
    "rootRecordId" TEXT NOT NULL,
    "parentRecordId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "userNickname" VARCHAR(100) NOT NULL,
    "commentContent" TEXT NOT NULL,
    "commentTime" TIMESTAMP(3),
    "shouldReply" BOOLEAN NOT NULL DEFAULT false,
    "skipReply" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT NOT NULL DEFAULT '',
    "commentType" VARCHAR(64) NOT NULL DEFAULT 'unknown',
    "intentLevel" VARCHAR(32) NOT NULL DEFAULT 'none',
    "intentLabel" VARCHAR(32) NOT NULL DEFAULT '完全无意向',
    "judgeReason" TEXT NOT NULL DEFAULT '',
    "replyStatus" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "replyContent" TEXT NOT NULL DEFAULT '',
    "replyTime" TIMESTAMP(3),
    "failReason" TEXT NOT NULL DEFAULT '',
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT,
    "conversationId" TEXT NOT NULL,
    "module" VARCHAR(16) NOT NULL DEFAULT 'dm',
    "platform" VARCHAR(32) NOT NULL,
    "botNickname" VARCHAR(100) NOT NULL,
    "userNickname" VARCHAR(100) NOT NULL,
    "manualTakeover" BOOLEAN NOT NULL DEFAULT false,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmTurn" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "botNickname" VARCHAR(100) NOT NULL,
    "userNickname" VARCHAR(100) NOT NULL,
    "messageContent" TEXT NOT NULL,
    "messageTime" TIMESTAMP(3),
    "shouldReply" BOOLEAN NOT NULL DEFAULT false,
    "skipReply" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT NOT NULL DEFAULT '',
    "messageType" VARCHAR(64) NOT NULL DEFAULT 'unknown',
    "intentLevel" VARCHAR(32) NOT NULL DEFAULT 'none',
    "intentLabel" VARCHAR(32) NOT NULL DEFAULT '完全无意向',
    "judgeReason" TEXT NOT NULL DEFAULT '',
    "replyStatus" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "replies" JSONB NOT NULL DEFAULT '[]',
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "replyTime" TIMESTAMP(3),
    "failReason" TEXT NOT NULL DEFAULT '',
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoReplyPromptConfig_tenantId_module_idx" ON "AutoReplyPromptConfig"("tenantId", "module");
CREATE INDEX "AutoReplyPromptConfig_tenantId_status_idx" ON "AutoReplyPromptConfig"("tenantId", "status");
CREATE INDEX "AutoReplyPromptConfig_deletedAt_idx" ON "AutoReplyPromptConfig"("deletedAt");

CREATE UNIQUE INDEX "AutoReplyRobotSetting_robotId_module_key" ON "AutoReplyRobotSetting"("robotId", "module");
CREATE INDEX "AutoReplyRobotSetting_tenantId_module_idx" ON "AutoReplyRobotSetting"("tenantId", "module");
CREATE INDEX "AutoReplyRobotSetting_promptConfigId_idx" ON "AutoReplyRobotSetting"("promptConfigId");
CREATE INDEX "AutoReplyRobotSetting_replyDatasetId_idx" ON "AutoReplyRobotSetting"("replyDatasetId");

CREATE INDEX "CommentReplyDataset_tenantId_robotId_idx" ON "CommentReplyDataset"("tenantId", "robotId");
CREATE INDEX "CommentReplyDataset_tenantId_status_idx" ON "CommentReplyDataset"("tenantId", "status");
CREATE INDEX "CommentReplyDataset_deletedAt_idx" ON "CommentReplyDataset"("deletedAt");

CREATE INDEX "CommentReplyDatasetEntry_datasetId_enabled_idx" ON "CommentReplyDatasetEntry"("datasetId", "enabled");
CREATE INDEX "CommentReplyDatasetEntry_datasetId_priority_idx" ON "CommentReplyDatasetEntry"("datasetId", "priority");

CREATE UNIQUE INDEX "CommentRecord_tenantId_recordId_key" ON "CommentRecord"("tenantId", "recordId");
CREATE INDEX "CommentRecord_tenantId_platform_idx" ON "CommentRecord"("tenantId", "platform");
CREATE INDEX "CommentRecord_tenantId_robotId_idx" ON "CommentRecord"("tenantId", "robotId");
CREATE INDEX "CommentRecord_rootRecordId_idx" ON "CommentRecord"("rootRecordId");
CREATE INDEX "CommentRecord_parentRecordId_idx" ON "CommentRecord"("parentRecordId");
CREATE INDEX "CommentRecord_replyStatus_idx" ON "CommentRecord"("replyStatus");
CREATE INDEX "CommentRecord_shouldReply_skipReply_idx" ON "CommentRecord"("shouldReply", "skipReply");
CREATE INDEX "CommentRecord_commentTime_idx" ON "CommentRecord"("commentTime");

CREATE UNIQUE INDEX "DmConversation_conversationId_key" ON "DmConversation"("conversationId");
CREATE INDEX "DmConversation_tenantId_platform_idx" ON "DmConversation"("tenantId", "platform");
CREATE INDEX "DmConversation_tenantId_robotId_idx" ON "DmConversation"("tenantId", "robotId");
CREATE INDEX "DmConversation_botNickname_userNickname_idx" ON "DmConversation"("botNickname", "userNickname");
CREATE INDEX "DmConversation_updatedAt_idx" ON "DmConversation"("updatedAt");

CREATE UNIQUE INDEX "DmTurn_turnId_key" ON "DmTurn"("turnId");
CREATE INDEX "DmTurn_conversationId_sortIndex_idx" ON "DmTurn"("conversationId", "sortIndex");
CREATE INDEX "DmTurn_platform_idx" ON "DmTurn"("platform");
CREATE INDEX "DmTurn_replyStatus_idx" ON "DmTurn"("replyStatus");
CREATE INDEX "DmTurn_shouldReply_skipReply_idx" ON "DmTurn"("shouldReply", "skipReply");
CREATE INDEX "DmTurn_messageTime_idx" ON "DmTurn"("messageTime");

-- AddForeignKey
ALTER TABLE "CommentReplyDatasetEntry" ADD CONSTRAINT "CommentReplyDatasetEntry_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "CommentReplyDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DmTurn" ADD CONSTRAINT "DmTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DmConversation"("conversationId") ON DELETE CASCADE ON UPDATE CASCADE;
