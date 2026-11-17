ALTER TABLE "CustomerServiceRuntimeReplyRequest"
  ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "CustomerServiceRuntimeReplyRequest"
SET "expiresAt" = "createdAt" + INTERVAL '30 days'
WHERE "expiresAt" IS NULL;

ALTER TABLE "CustomerServiceRuntimeReplyRequest"
  ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX "CsRuntimeReplyRequest_tenant_expires_status"
  ON "CustomerServiceRuntimeReplyRequest"("tenantId", "expiresAt", "status");
