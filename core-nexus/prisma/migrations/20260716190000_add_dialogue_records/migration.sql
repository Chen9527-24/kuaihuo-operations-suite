CREATE TABLE "DialogueConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "channelType" VARCHAR(16) NOT NULL DEFAULT 'dm',
    "chatType" VARCHAR(16) NOT NULL DEFAULT 'private',
    "botNickname" VARCHAR(100) NOT NULL DEFAULT '',
    "displayName" VARCHAR(100) NOT NULL,
    "normalizedDisplayName" VARCHAR(100) NOT NULL,
    "identityStatus" VARCHAR(32) NOT NULL DEFAULT 'PROVISIONAL',
    "identityConfidence" INTEGER NOT NULL DEFAULT 0,
    "lastMatchReason" TEXT NOT NULL DEFAULT '',
    "workflowConversationId" VARCHAR(256) NOT NULL DEFAULT '',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "firstMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DialogueConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DialogueConversationAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sourceClientId" VARCHAR(128) NOT NULL,
    "localConversationId" VARCHAR(128) NOT NULL,
    "aliasHash" VARCHAR(64) NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "lastWindowHash" VARCHAR(64) NOT NULL DEFAULT '',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DialogueConversationAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DialogueMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "ingestKey" VARCHAR(64) NOT NULL,
    "clientMessageId" VARCHAR(256) NOT NULL,
    "sourceClientId" VARCHAR(128) NOT NULL,
    "localConversationId" VARCHAR(128) NOT NULL,
    "senderRole" VARCHAR(32) NOT NULL,
    "actorSource" VARCHAR(64) NOT NULL DEFAULT '',
    "attributionConfidence" VARCHAR(32) NOT NULL DEFAULT '',
    "messageType" VARCHAR(32) NOT NULL DEFAULT 'unknown',
    "textContent" TEXT NOT NULL DEFAULT '',
    "typePlaceholder" VARCHAR(64) NOT NULL DEFAULT '',
    "sequenceIndex" INTEGER NOT NULL DEFAULT 0,
    "historyKind" VARCHAR(32) NOT NULL DEFAULT '',
    "timeAccuracy" VARCHAR(32) NOT NULL DEFAULT '',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "payloadFingerprint" VARCHAR(128) NOT NULL DEFAULT '',
    "replyAttemptId" VARCHAR(256) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DialogueMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DialogueConversationAlias_tenantId_robotId_sourceClientId_localConversationId_key" ON "DialogueConversationAlias"("tenantId", "robotId", "sourceClientId", "localConversationId");
CREATE INDEX "DialogueConversationAlias_conversationId_lastSeenAt_idx" ON "DialogueConversationAlias"("conversationId", "lastSeenAt");
CREATE UNIQUE INDEX "DialogueMessage_ingestKey_key" ON "DialogueMessage"("ingestKey");
CREATE INDEX "DialogueConversation_tenantId_robotId_platform_idx" ON "DialogueConversation"("tenantId", "robotId", "platform");
CREATE INDEX "DialogueConversation_tenantId_robotId_normalizedDisplayName_idx" ON "DialogueConversation"("tenantId", "robotId", "normalizedDisplayName");
CREATE INDEX "DialogueConversation_lastMessageAt_idx" ON "DialogueConversation"("lastMessageAt");
CREATE INDEX "DialogueMessage_conversationId_observedAt_idx" ON "DialogueMessage"("conversationId", "observedAt");
CREATE INDEX "DialogueMessage_tenantId_robotId_observedAt_idx" ON "DialogueMessage"("tenantId", "robotId", "observedAt");
CREATE INDEX "DialogueMessage_clientMessageId_idx" ON "DialogueMessage"("clientMessageId");

ALTER TABLE "DialogueConversationAlias" ADD CONSTRAINT "DialogueConversationAlias_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DialogueConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DialogueMessage" ADD CONSTRAINT "DialogueMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DialogueConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DialogueSyncWatermark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "sourceClientId" VARCHAR(128) NOT NULL,
    "localConversationId" VARCHAR(128) NOT NULL,
    "deletedBeforeAt" TIMESTAMP(3) NOT NULL,
    "reason" VARCHAR(32) NOT NULL DEFAULT 'USER_DELETE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DialogueSyncWatermark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DialogueSyncWatermark_tenantId_robotId_sourceClientId_localConversationId_key" ON "DialogueSyncWatermark"("tenantId", "robotId", "sourceClientId", "localConversationId");
CREATE INDEX "DialogueSyncWatermark_tenantId_robotId_updatedAt_idx" ON "DialogueSyncWatermark"("tenantId", "robotId", "updatedAt");
