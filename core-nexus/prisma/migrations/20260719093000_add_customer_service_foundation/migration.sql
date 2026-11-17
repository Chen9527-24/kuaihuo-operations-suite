CREATE TABLE "CustomerServiceAsset" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "assetType" VARCHAR(64) NOT NULL,
  "description" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "currentVersionId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceAssetVersion" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "summary" TEXT,
  "content" JSONB NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3),
  "publishedById" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceAssetVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceRolePrototype" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "identity" TEXT,
  "personality" TEXT,
  "languageStyle" TEXT,
  "servicePosture" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceRolePrototype_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceIndustryNode" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "parentId" TEXT,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "nodeType" VARCHAR(32) NOT NULL,
  "level" INTEGER NOT NULL,
  "path" VARCHAR(1000) NOT NULL,
  "description" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "sort" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceIndustryNode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerServiceAsset_tenantId_key_key" ON "CustomerServiceAsset"("tenantId", "key");
CREATE INDEX "CustomerServiceAsset_tenantId_assetType_status_idx" ON "CustomerServiceAsset"("tenantId", "assetType", "status");
CREATE INDEX "CustomerServiceAsset_tenantId_updatedAt_idx" ON "CustomerServiceAsset"("tenantId", "updatedAt");
CREATE INDEX "CustomerServiceAsset_deletedAt_idx" ON "CustomerServiceAsset"("deletedAt");

CREATE UNIQUE INDEX "CustomerServiceAssetVersion_assetId_versionNo_key" ON "CustomerServiceAssetVersion"("assetId", "versionNo");
CREATE INDEX "CustomerServiceAssetVersion_assetId_status_idx" ON "CustomerServiceAssetVersion"("assetId", "status");
CREATE INDEX "CustomerServiceAssetVersion_publishedAt_idx" ON "CustomerServiceAssetVersion"("publishedAt");

CREATE UNIQUE INDEX "CustomerServiceRolePrototype_tenantId_code_key" ON "CustomerServiceRolePrototype"("tenantId", "code");
CREATE INDEX "CustomerServiceRolePrototype_tenantId_status_idx" ON "CustomerServiceRolePrototype"("tenantId", "status");
CREATE INDEX "CustomerServiceRolePrototype_tenantId_updatedAt_idx" ON "CustomerServiceRolePrototype"("tenantId", "updatedAt");
CREATE INDEX "CustomerServiceRolePrototype_deletedAt_idx" ON "CustomerServiceRolePrototype"("deletedAt");

CREATE UNIQUE INDEX "CustomerServiceIndustryNode_tenantId_code_key" ON "CustomerServiceIndustryNode"("tenantId", "code");
CREATE INDEX "CustomerServiceIndustryNode_tenantId_parentId_sort_idx" ON "CustomerServiceIndustryNode"("tenantId", "parentId", "sort");
CREATE INDEX "CustomerServiceIndustryNode_tenantId_status_idx" ON "CustomerServiceIndustryNode"("tenantId", "status");
CREATE INDEX "CustomerServiceIndustryNode_deletedAt_idx" ON "CustomerServiceIndustryNode"("deletedAt");

ALTER TABLE "CustomerServiceAsset" ADD CONSTRAINT "CustomerServiceAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceAsset" ADD CONSTRAINT "CustomerServiceAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceAsset" ADD CONSTRAINT "CustomerServiceAsset_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceAssetVersion" ADD CONSTRAINT "CustomerServiceAssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CustomerServiceAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceAssetVersion" ADD CONSTRAINT "CustomerServiceAssetVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceAssetVersion" ADD CONSTRAINT "CustomerServiceAssetVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceRolePrototype" ADD CONSTRAINT "CustomerServiceRolePrototype_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceRolePrototype" ADD CONSTRAINT "CustomerServiceRolePrototype_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceRolePrototype" ADD CONSTRAINT "CustomerServiceRolePrototype_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceIndustryNode" ADD CONSTRAINT "CustomerServiceIndustryNode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceIndustryNode" ADD CONSTRAINT "CustomerServiceIndustryNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CustomerServiceIndustryNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceIndustryNode" ADD CONSTRAINT "CustomerServiceIndustryNode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceIndustryNode" ADD CONSTRAINT "CustomerServiceIndustryNode_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
