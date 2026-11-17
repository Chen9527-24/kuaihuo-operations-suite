CREATE TABLE "CustomerServiceStoreProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "profile" JSONB NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceStoreProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceAccountProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeProfileId" TEXT,
  "merchantRoleId" TEXT,
  "industryNodeId" TEXT,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "channel" VARCHAR(48) NOT NULL DEFAULT 'OTHER',
  "description" TEXT,
  "profile" JSONB NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceAccountProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerServiceLanguagePolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "scopeType" VARCHAR(32) NOT NULL DEFAULT 'GLOBAL',
  "scopeKey" VARCHAR(500) NOT NULL DEFAULT '*',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "rules" JSONB NOT NULL,
  "styleGuidance" JSONB,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceLanguagePolicy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerServiceTuningSession" ADD COLUMN "accountProfileId" TEXT;

CREATE UNIQUE INDEX "CustomerServiceStoreProfile_tenantId_code_key"
  ON "CustomerServiceStoreProfile"("tenantId", "code");
CREATE INDEX "CustomerServiceStoreProfile_tenantId_status_updatedAt_idx"
  ON "CustomerServiceStoreProfile"("tenantId", "status", "updatedAt");
CREATE INDEX "CustomerServiceStoreProfile_deletedAt_idx"
  ON "CustomerServiceStoreProfile"("deletedAt");

CREATE UNIQUE INDEX "CustomerServiceAccountProfile_tenantId_code_key"
  ON "CustomerServiceAccountProfile"("tenantId", "code");
CREATE INDEX "CustomerServiceAccountProfile_tenantId_status_updatedAt_idx"
  ON "CustomerServiceAccountProfile"("tenantId", "status", "updatedAt");
CREATE INDEX "CustomerServiceAccountProfile_tenantId_storeProfileId_idx"
  ON "CustomerServiceAccountProfile"("tenantId", "storeProfileId");
CREATE INDEX "CustomerServiceAccountProfile_tenantId_merchantRoleId_idx"
  ON "CustomerServiceAccountProfile"("tenantId", "merchantRoleId");
CREATE INDEX "CustomerServiceAccountProfile_tenantId_industryNodeId_idx"
  ON "CustomerServiceAccountProfile"("tenantId", "industryNodeId");
CREATE INDEX "CustomerServiceAccountProfile_deletedAt_idx"
  ON "CustomerServiceAccountProfile"("deletedAt");

CREATE UNIQUE INDEX "CustomerServiceLanguagePolicy_tenantId_code_key"
  ON "CustomerServiceLanguagePolicy"("tenantId", "code");
CREATE INDEX "CustomerServiceLanguagePolicy_tenantId_status_priority_idx"
  ON "CustomerServiceLanguagePolicy"("tenantId", "status", "priority");
CREATE INDEX "CustomerServiceLanguagePolicy_tenantId_scopeType_scopeKey_idx"
  ON "CustomerServiceLanguagePolicy"("tenantId", "scopeType", "scopeKey");
CREATE INDEX "CustomerServiceLanguagePolicy_deletedAt_idx"
  ON "CustomerServiceLanguagePolicy"("deletedAt");
CREATE INDEX "CsTuningSession_account_profile"
  ON "CustomerServiceTuningSession"("accountProfileId");

ALTER TABLE "CustomerServiceStoreProfile"
  ADD CONSTRAINT "CustomerServiceStoreProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceStoreProfile"
  ADD CONSTRAINT "CustomerServiceStoreProfile_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceStoreProfile"
  ADD CONSTRAINT "CustomerServiceStoreProfile_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceAccountProfile"
  ADD CONSTRAINT "CustomerServiceAccountProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceAccountProfile"
  ADD CONSTRAINT "CustomerServiceAccountProfile_storeProfileId_fkey"
  FOREIGN KEY ("storeProfileId") REFERENCES "CustomerServiceStoreProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceAccountProfile"
  ADD CONSTRAINT "CustomerServiceAccountProfile_merchantRoleId_fkey"
  FOREIGN KEY ("merchantRoleId") REFERENCES "CustomerServiceMerchantRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceAccountProfile"
  ADD CONSTRAINT "CustomerServiceAccountProfile_industryNodeId_fkey"
  FOREIGN KEY ("industryNodeId") REFERENCES "CustomerServiceIndustryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceAccountProfile"
  ADD CONSTRAINT "CustomerServiceAccountProfile_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceAccountProfile"
  ADD CONSTRAINT "CustomerServiceAccountProfile_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceLanguagePolicy"
  ADD CONSTRAINT "CustomerServiceLanguagePolicy_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceLanguagePolicy"
  ADD CONSTRAINT "CustomerServiceLanguagePolicy_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceLanguagePolicy"
  ADD CONSTRAINT "CustomerServiceLanguagePolicy_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceTuningSession"
  ADD CONSTRAINT "CsTuningSession_account_profile_fkey"
  FOREIGN KEY ("accountProfileId") REFERENCES "CustomerServiceAccountProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
