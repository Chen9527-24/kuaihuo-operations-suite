CREATE TABLE "CustomerServiceResponseRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "responseAssetId" TEXT NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "conditions" JSONB NOT NULL,
  "exclusions" JSONB,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "exclusive" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceResponseRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerServiceResponseRule_tenantId_key_key" ON "CustomerServiceResponseRule"("tenantId", "key");
CREATE INDEX "CustomerServiceResponseRule_tenantId_status_priority_sort_idx" ON "CustomerServiceResponseRule"("tenantId", "status", "priority", "sort");
CREATE INDEX "CustomerServiceResponseRule_tenantId_responseAssetId_idx" ON "CustomerServiceResponseRule"("tenantId", "responseAssetId");
CREATE INDEX "CustomerServiceResponseRule_deletedAt_idx" ON "CustomerServiceResponseRule"("deletedAt");

ALTER TABLE "CustomerServiceResponseRule" ADD CONSTRAINT "CustomerServiceResponseRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceResponseRule" ADD CONSTRAINT "CustomerServiceResponseRule_responseAssetId_fkey" FOREIGN KEY ("responseAssetId") REFERENCES "CustomerServiceAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceResponseRule" ADD CONSTRAINT "CustomerServiceResponseRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceResponseRule" ADD CONSTRAINT "CustomerServiceResponseRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
