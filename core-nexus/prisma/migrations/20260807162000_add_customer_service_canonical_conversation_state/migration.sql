-- V5.20-C5-A: persist the existing bounded customer-service Conversation State
-- against the authoritative server-side canonical DialogueConversation.

CREATE TABLE "CustomerServiceConversationState" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "robotId" TEXT NOT NULL,
  "dialogueConversationId" TEXT NOT NULL,
  "stateSchemaVersion" INTEGER NOT NULL DEFAULT 2,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "stateHash" VARCHAR(64) NOT NULL DEFAULT '',
  "statePayload" JSONB NOT NULL,
  "payloadBytes" INTEGER NOT NULL DEFAULT 0,
  "lastProcessedMessageId" VARCHAR(128) NOT NULL DEFAULT '',
  "lastProcessedIngestKey" VARCHAR(64) NOT NULL DEFAULT '',
  "lastProcessedSortKey" VARCHAR(192) NOT NULL DEFAULT '',
  "recentProcessedMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rebuildRequired" BOOLEAN NOT NULL DEFAULT false,
  "stateUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerServiceConversationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerServiceConversationState_dialogueConversationId_key"
  ON "CustomerServiceConversationState"("dialogueConversationId");
CREATE INDEX "CsConversationState_tenant_robot_updated"
  ON "CustomerServiceConversationState"("tenantId", "robotId", "updatedAt");
CREATE INDEX "CsConversationState_tenant_conversation"
  ON "CustomerServiceConversationState"("tenantId", "dialogueConversationId");
CREATE INDEX "CsConversationState_last_message"
  ON "CustomerServiceConversationState"("lastProcessedMessageId");

ALTER TABLE "CustomerServiceConversationState"
  ADD CONSTRAINT "CustomerServiceConversationState_conversation_fkey"
  FOREIGN KEY ("dialogueConversationId") REFERENCES "DialogueConversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
