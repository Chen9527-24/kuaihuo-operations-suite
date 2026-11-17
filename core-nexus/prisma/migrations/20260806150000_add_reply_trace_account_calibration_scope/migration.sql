CREATE TABLE "CustomerServiceReplyTrace" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "runtimeRequestId" TEXT,
  "sourceType" VARCHAR(40) NOT NULL,
  "sourceRefId" VARCHAR(512),
  "robotId" TEXT,
  "accountProfileId" TEXT,
  "storeProfileId" TEXT,
  "merchantRoleId" TEXT,
  "industryNodeId" TEXT,
  "channel" VARCHAR(32),
  "platform" VARCHAR(64),
  "conversationId" VARCHAR(512),
  "commentThreadId" VARCHAR(512),
  "customerMessageId" VARCHAR(512),
  "replyMessageId" VARCHAR(512),
  "replyAttemptId" VARCHAR(512),
  "customerMessage" TEXT NOT NULL,
  "replySegments" JSONB NOT NULL,
  "finalReply" TEXT NOT NULL,
  "conversationSnapshot" JSONB,
  "runtimeContract" JSONB,
  "generationDetails" JSONB,
  "postContext" TEXT,
  "provider" VARCHAR(40),
  "model" VARCHAR(120),
  "generationSource" VARCHAR(64) NOT NULL,
  "configurationHash" VARCHAR(64),
  "sourceRevisions" JSONB,
  "strategyAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "strategyVersionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "languagePolicyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "understandingSummary" JSONB,
  "qualityStatus" VARCHAR(32) NOT NULL DEFAULT 'NOT_RUN',
  "safetyStatus" VARCHAR(32) NOT NULL DEFAULT 'NOT_RUN',
  "qualityReport" JSONB,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "contentHash" VARCHAR(64) NOT NULL,
  "payloadBytes" INTEGER NOT NULL DEFAULT 0,
  "retentionClass" VARCHAR(24) NOT NULL DEFAULT 'MEDIUM',
  "payloadState" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  "compactedAt" TIMESTAMP(3),
  "purgedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceReplyTrace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceReplyFeedback" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "replyTraceId" TEXT NOT NULL,
  "feedback" VARCHAR(24) NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceReplyFeedback_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerServiceCalibrationRecord"
  ADD COLUMN "sourceType" VARCHAR(40),
  ADD COLUMN "sourceRefId" VARCHAR(512),
  ADD COLUMN "replyTraceId" TEXT,
  ADD COLUMN "accountProfileId" TEXT,
  ADD COLUMN "robotId" TEXT,
  ADD COLUMN "channel" VARCHAR(32),
  ADD COLUMN "platform" VARCHAR(64),
  ADD COLUMN "conversationId" VARCHAR(512),
  ADD COLUMN "messageId" VARCHAR(512),
  ADD COLUMN "replyAttemptId" VARCHAR(512);

ALTER TABLE "CustomerServiceCalibrationProfile"
  ADD COLUMN "accountProfileId" TEXT;

CREATE INDEX "CsReplyTrace_tenant_source_created" ON "CustomerServiceReplyTrace"("tenantId", "sourceType", "createdAt");
CREATE INDEX "CsReplyTrace_tenant_source_ref" ON "CustomerServiceReplyTrace"("tenantId", "sourceRefId");
CREATE UNIQUE INDEX "CsReplyTrace_tenant_runtime_request" ON "CustomerServiceReplyTrace"("tenantId", "runtimeRequestId");
CREATE INDEX "CsReplyTrace_tenant_account_created" ON "CustomerServiceReplyTrace"("tenantId", "accountProfileId", "createdAt");
CREATE INDEX "CsReplyTrace_tenant_robot_created" ON "CustomerServiceReplyTrace"("tenantId", "robotId", "createdAt");
CREATE INDEX "CsReplyTrace_tenant_conversation_created" ON "CustomerServiceReplyTrace"("tenantId", "conversationId", "createdAt");
CREATE INDEX "CsReplyTrace_tenant_reply_attempt" ON "CustomerServiceReplyTrace"("tenantId", "replyAttemptId");
CREATE INDEX "CsReplyTrace_configuration_hash" ON "CustomerServiceReplyTrace"("configurationHash");
CREATE INDEX "CsReplyTrace_content_hash" ON "CustomerServiceReplyTrace"("contentHash");
CREATE INDEX "CsReplyTrace_tenant_payload_created" ON "CustomerServiceReplyTrace"("tenantId", "payloadState", "createdAt");
CREATE UNIQUE INDEX "CsReplyFeedback_tenant_trace_user" ON "CustomerServiceReplyFeedback"("tenantId", "replyTraceId", "createdById");
CREATE INDEX "CsReplyFeedback_tenant_feedback_created" ON "CustomerServiceReplyFeedback"("tenantId", "feedback", "createdAt");
CREATE INDEX "CsReplyFeedback_trace" ON "CustomerServiceReplyFeedback"("replyTraceId");
CREATE INDEX "CsCalibration_tenant_source_ref" ON "CustomerServiceCalibrationRecord"("tenantId", "sourceType", "sourceRefId");
CREATE INDEX "CsCalibration_tenant_trace" ON "CustomerServiceCalibrationRecord"("tenantId", "replyTraceId");
CREATE INDEX "CsCalibration_tenant_account_updated" ON "CustomerServiceCalibrationRecord"("tenantId", "accountProfileId", "updatedAt");
CREATE INDEX "CsCalibration_tenant_robot_updated" ON "CustomerServiceCalibrationRecord"("tenantId", "robotId", "updatedAt");
CREATE INDEX "CsCalibration_tenant_conversation_updated" ON "CustomerServiceCalibrationRecord"("tenantId", "conversationId", "updatedAt");
CREATE INDEX "CsCalibration_reply_attempt" ON "CustomerServiceCalibrationRecord"("replyAttemptId");
CREATE INDEX "CsCalibrationProfile_tenant_account_status" ON "CustomerServiceCalibrationProfile"("tenantId", "accountProfileId", "status");

ALTER TABLE "CustomerServiceReplyTrace" ADD CONSTRAINT "CustomerServiceReplyTrace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceReplyTrace" ADD CONSTRAINT "CustomerServiceReplyTrace_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceReplyFeedback" ADD CONSTRAINT "CustomerServiceReplyFeedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceReplyFeedback" ADD CONSTRAINT "CustomerServiceReplyFeedback_replyTraceId_fkey" FOREIGN KEY ("replyTraceId") REFERENCES "CustomerServiceReplyTrace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceReplyFeedback" ADD CONSTRAINT "CustomerServiceReplyFeedback_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationRecord" ADD CONSTRAINT "CustomerServiceCalibrationRecord_replyTraceId_fkey" FOREIGN KEY ("replyTraceId") REFERENCES "CustomerServiceReplyTrace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCalibrationProfile" ADD CONSTRAINT "CustomerServiceCalibrationProfile_accountProfileId_fkey" FOREIGN KEY ("accountProfileId") REFERENCES "CustomerServiceAccountProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
