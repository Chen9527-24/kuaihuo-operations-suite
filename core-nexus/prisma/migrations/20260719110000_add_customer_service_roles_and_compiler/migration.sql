CREATE TABLE "CustomerServiceMerchantRole" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "prototypeId" TEXT NOT NULL,
  "industryNodeId" TEXT,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "publicIdentity" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceMerchantRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceRoleModuleDefinition" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "defaultMergeMode" VARCHAR(32) NOT NULL DEFAULT 'APPEND',
  "defaultPriority" INTEGER NOT NULL DEFAULT 100,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceRoleModuleDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceRoleModuleInstance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "merchantRoleId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "content" JSONB NOT NULL,
  "conditions" JSONB,
  "mergeMode" VARCHAR(32) NOT NULL DEFAULT 'APPEND',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceRoleModuleInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerServiceMerchantRole_tenantId_code_key" ON "CustomerServiceMerchantRole"("tenantId", "code");
CREATE INDEX "CustomerServiceMerchantRole_tenantId_status_idx" ON "CustomerServiceMerchantRole"("tenantId", "status");
CREATE INDEX "CustomerServiceMerchantRole_tenantId_prototypeId_idx" ON "CustomerServiceMerchantRole"("tenantId", "prototypeId");
CREATE INDEX "CustomerServiceMerchantRole_tenantId_industryNodeId_idx" ON "CustomerServiceMerchantRole"("tenantId", "industryNodeId");
CREATE INDEX "CustomerServiceMerchantRole_deletedAt_idx" ON "CustomerServiceMerchantRole"("deletedAt");

CREATE UNIQUE INDEX "CustomerServiceRoleModuleDefinition_code_key" ON "CustomerServiceRoleModuleDefinition"("code");
CREATE INDEX "CustomerServiceRoleModuleDefinition_status_sort_idx" ON "CustomerServiceRoleModuleDefinition"("status", "sort");

CREATE UNIQUE INDEX "CustomerServiceRoleModuleInstance_merchantRoleId_key_key" ON "CustomerServiceRoleModuleInstance"("merchantRoleId", "key");
CREATE INDEX "CustomerServiceRoleModuleInstance_tenantId_merchantRoleId_status_sort_idx" ON "CustomerServiceRoleModuleInstance"("tenantId", "merchantRoleId", "status", "sort");
CREATE INDEX "CustomerServiceRoleModuleInstance_definitionId_idx" ON "CustomerServiceRoleModuleInstance"("definitionId");
CREATE INDEX "CustomerServiceRoleModuleInstance_deletedAt_idx" ON "CustomerServiceRoleModuleInstance"("deletedAt");

ALTER TABLE "CustomerServiceMerchantRole" ADD CONSTRAINT "CustomerServiceMerchantRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceMerchantRole" ADD CONSTRAINT "CustomerServiceMerchantRole_prototypeId_fkey" FOREIGN KEY ("prototypeId") REFERENCES "CustomerServiceRolePrototype"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceMerchantRole" ADD CONSTRAINT "CustomerServiceMerchantRole_industryNodeId_fkey" FOREIGN KEY ("industryNodeId") REFERENCES "CustomerServiceIndustryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceMerchantRole" ADD CONSTRAINT "CustomerServiceMerchantRole_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceMerchantRole" ADD CONSTRAINT "CustomerServiceMerchantRole_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceRoleModuleInstance" ADD CONSTRAINT "CustomerServiceRoleModuleInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceRoleModuleInstance" ADD CONSTRAINT "CustomerServiceRoleModuleInstance_merchantRoleId_fkey" FOREIGN KEY ("merchantRoleId") REFERENCES "CustomerServiceMerchantRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceRoleModuleInstance" ADD CONSTRAINT "CustomerServiceRoleModuleInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomerServiceRoleModuleDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceRoleModuleInstance" ADD CONSTRAINT "CustomerServiceRoleModuleInstance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceRoleModuleInstance" ADD CONSTRAINT "CustomerServiceRoleModuleInstance_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
