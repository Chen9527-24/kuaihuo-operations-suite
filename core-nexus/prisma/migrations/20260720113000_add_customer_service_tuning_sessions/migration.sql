CREATE TABLE "CustomerServiceTuningSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "merchantRoleId" TEXT NOT NULL,
  "industryNodeId" TEXT,
  "title" VARCHAR(160) NOT NULL DEFAULT '新调优对话',
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  "contextSnapshot" JSONB,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "analysisCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceTuningSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceTuningMessage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "clientMessageId" VARCHAR(120),
  "role" VARCHAR(16) NOT NULL,
  "content" TEXT NOT NULL,
  "turnNo" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerServiceTuningMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceTuningAnalysis" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "customerMessageId" TEXT,
  "runType" VARCHAR(16) NOT NULL,
  "sequenceNo" INTEGER NOT NULL,
  "latestMessage" TEXT NOT NULL,
  "understanding" JSONB NOT NULL,
  "runtimeContract" JSONB NOT NULL,
  "generation" JSONB,
  "quality" JSONB,
  "warnings" JSONB,
  "summary" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerServiceTuningAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CsTuningSession_tenant_status_updated" ON "CustomerServiceTuningSession"("tenantId", "status", "updatedAt");
CREATE INDEX "CsTuningSession_tenant_role_updated" ON "CustomerServiceTuningSession"("tenantId", "merchantRoleId", "updatedAt");
CREATE INDEX "CsTuningSession_industry" ON "CustomerServiceTuningSession"("industryNodeId");
CREATE UNIQUE INDEX "CsTuningMessage_session_turn" ON "CustomerServiceTuningMessage"("sessionId", "turnNo");
CREATE UNIQUE INDEX "CsTuningMessage_session_client" ON "CustomerServiceTuningMessage"("sessionId", "clientMessageId");
CREATE INDEX "CsTuningMessage_session_created" ON "CustomerServiceTuningMessage"("sessionId", "createdAt");
CREATE UNIQUE INDEX "CsTuningAnalysis_session_sequence" ON "CustomerServiceTuningAnalysis"("sessionId", "sequenceNo");
CREATE INDEX "CsTuningAnalysis_session_created" ON "CustomerServiceTuningAnalysis"("sessionId", "createdAt");
CREATE INDEX "CsTuningAnalysis_customer_message" ON "CustomerServiceTuningAnalysis"("customerMessageId");

ALTER TABLE "CustomerServiceTuningSession"
  ADD CONSTRAINT "CsTuningSession_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceTuningSession"
  ADD CONSTRAINT "CsTuningSession_role_fkey" FOREIGN KEY ("merchantRoleId") REFERENCES "CustomerServiceMerchantRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceTuningSession"
  ADD CONSTRAINT "CsTuningSession_industry_fkey" FOREIGN KEY ("industryNodeId") REFERENCES "CustomerServiceIndustryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceTuningSession"
  ADD CONSTRAINT "CsTuningSession_creator_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceTuningMessage"
  ADD CONSTRAINT "CsTuningMessage_session_fkey" FOREIGN KEY ("sessionId") REFERENCES "CustomerServiceTuningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceTuningAnalysis"
  ADD CONSTRAINT "CsTuningAnalysis_session_fkey" FOREIGN KEY ("sessionId") REFERENCES "CustomerServiceTuningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceTuningAnalysis"
  ADD CONSTRAINT "CsTuningAnalysis_customer_message_fkey" FOREIGN KEY ("customerMessageId") REFERENCES "CustomerServiceTuningMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceTuningAnalysis"
  ADD CONSTRAINT "CsTuningAnalysis_creator_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
