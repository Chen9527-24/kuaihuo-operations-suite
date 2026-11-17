CREATE TABLE "CustomerServiceRuntimeReplyRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "processingToken" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PROCESSING',
  "response" JSONB,
  "errorCode" VARCHAR(80),
  "errorMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerServiceRuntimeReplyRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CsRuntimeReplyRequest_tenant_idempotency_key"
  ON "CustomerServiceRuntimeReplyRequest"("tenantId", "idempotencyKey");

CREATE INDEX "CsRuntimeReplyRequest_tenant_status_created"
  ON "CustomerServiceRuntimeReplyRequest"("tenantId", "status", "createdAt");

CREATE INDEX "CsRuntimeReplyRequest_request_hash"
  ON "CustomerServiceRuntimeReplyRequest"("requestHash");

ALTER TABLE "CustomerServiceRuntimeReplyRequest"
  ADD CONSTRAINT "CustomerServiceRuntimeReplyRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
