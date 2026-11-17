CREATE TABLE "CustomerServiceKnowledgeEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "scopeType" VARCHAR(24) NOT NULL,
  "scopeKey" VARCHAR(500) NOT NULL,
  "category" VARCHAR(40) NOT NULL DEFAULT 'OTHER',
  "title" VARCHAR(200) NOT NULL,
  "question" TEXT,
  "content" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceType" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  "sourceReference" VARCHAR(1000),
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "freshnessPolicy" VARCHAR(120),
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceKnowledgeEntry_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CustomerServiceReplyTrace" ADD COLUMN "knowledgeEntryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "CsKnowledgeEntry_tenant_status_updated" ON "CustomerServiceKnowledgeEntry"("tenantId", "status", "updatedAt");
CREATE INDEX "CsKnowledgeEntry_tenant_scope_status" ON "CustomerServiceKnowledgeEntry"("tenantId", "scopeType", "scopeKey", "status");
CREATE INDEX "CsKnowledgeEntry_tenant_category_status" ON "CustomerServiceKnowledgeEntry"("tenantId", "category", "status");
CREATE INDEX "CsKnowledgeEntry_effective_window" ON "CustomerServiceKnowledgeEntry"("effectiveFrom", "effectiveTo");
CREATE INDEX "CsKnowledgeEntry_deletedAt" ON "CustomerServiceKnowledgeEntry"("deletedAt");
ALTER TABLE "CustomerServiceKnowledgeEntry" ADD CONSTRAINT "CustomerServiceKnowledgeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeEntry" ADD CONSTRAINT "CustomerServiceKnowledgeEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeEntry" ADD CONSTRAINT "CustomerServiceKnowledgeEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
