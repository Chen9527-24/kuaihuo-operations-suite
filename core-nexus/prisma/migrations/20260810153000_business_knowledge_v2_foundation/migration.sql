ALTER TABLE "CustomerServiceKnowledgeEntry"
  ADD COLUMN "collectionId" TEXT,
  ADD COLUMN "entityType" VARCHAR(40) NOT NULL DEFAULT 'GENERIC',
  ADD COLUMN "entityKey" VARCHAR(240),
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "structuredData" JSONB,
  ADD COLUMN "references" JSONB,
  ADD COLUMN "authorityLevel" VARCHAR(40) NOT NULL DEFAULT 'BUSINESS_FACT',
  ADD COLUMN "chunkIndex" INTEGER,
  ADD COLUMN "sourceFileName" VARCHAR(500);

CREATE TABLE "CustomerServiceKnowledgeCollection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "code" VARCHAR(120),
  "description" TEXT,
  "industryCode" VARCHAR(80),
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceKnowledgeCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceKnowledgeBinding" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "targetType" VARCHAR(24) NOT NULL,
  "targetKey" VARCHAR(500) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceKnowledgeBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CsKnowledgeCollection_tenant_code" ON "CustomerServiceKnowledgeCollection"("tenantId", "code");
CREATE INDEX "CsKnowledgeCollection_tenant_status_updated" ON "CustomerServiceKnowledgeCollection"("tenantId", "status", "updatedAt");
CREATE INDEX "CsKnowledgeCollection_tenant_industry_status" ON "CustomerServiceKnowledgeCollection"("tenantId", "industryCode", "status");
CREATE INDEX "CsKnowledgeCollection_deletedAt" ON "CustomerServiceKnowledgeCollection"("deletedAt");
CREATE UNIQUE INDEX "CsKnowledgeBinding_unique_target" ON "CustomerServiceKnowledgeBinding"("tenantId", "collectionId", "targetType", "targetKey");
CREATE INDEX "CsKnowledgeBinding_target_status" ON "CustomerServiceKnowledgeBinding"("tenantId", "targetType", "targetKey", "status");
CREATE INDEX "CsKnowledgeBinding_collection_status" ON "CustomerServiceKnowledgeBinding"("tenantId", "collectionId", "status");
CREATE INDEX "CsKnowledgeEntry_tenant_collection_status" ON "CustomerServiceKnowledgeEntry"("tenantId", "collectionId", "status");
CREATE INDEX "CsKnowledgeEntry_tenant_entity" ON "CustomerServiceKnowledgeEntry"("tenantId", "entityType", "entityKey");

ALTER TABLE "CustomerServiceKnowledgeCollection" ADD CONSTRAINT "CustomerServiceKnowledgeCollection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeCollection" ADD CONSTRAINT "CustomerServiceKnowledgeCollection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeCollection" ADD CONSTRAINT "CustomerServiceKnowledgeCollection_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeBinding" ADD CONSTRAINT "CustomerServiceKnowledgeBinding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeBinding" ADD CONSTRAINT "CustomerServiceKnowledgeBinding_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CustomerServiceKnowledgeCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeBinding" ADD CONSTRAINT "CustomerServiceKnowledgeBinding_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeEntry" ADD CONSTRAINT "CustomerServiceKnowledgeEntry_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CustomerServiceKnowledgeCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
