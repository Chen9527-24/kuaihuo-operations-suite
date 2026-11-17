-- CreateTable
CREATE TABLE "ContentOpsPlatformAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "platformAccountId" VARCHAR(128) NOT NULL,
    "accountName" VARCHAR(128) NOT NULL,
    "homepageUrl" TEXT,
    "accountType" VARCHAR(64),
    "authMethod" VARCHAR(32) NOT NULL DEFAULT 'LOCAL_BROWSER',
    "authStatus" VARCHAR(32) NOT NULL DEFAULT 'LOCAL_ONLY',
    "localProfileKey" VARCHAR(255),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" VARCHAR(32),
    "remark" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentOpsPlatformAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsSyncJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "taskType" VARCHAR(64) NOT NULL DEFAULT 'PLATFORM_ACCOUNT_SYNC',
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "source" VARCHAR(32) NOT NULL DEFAULT 'WINDOWS_CLIENT',
    "clientId" VARCHAR(128),
    "idempotencyKey" VARCHAR(128),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" VARCHAR(128),
    "errorMessage" TEXT,
    "logSummary" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentOpsSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsSyncBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "syncJobId" TEXT NOT NULL,
    "batchKey" VARCHAR(128) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentOpsSyncBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsContentItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "platformContentId" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "body" TEXT,
    "url" TEXT NOT NULL,
    "contentType" VARCHAR(32) NOT NULL DEFAULT 'OTHER',
    "publishTime" TIMESTAMP(3),
    "rawJson" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentOpsContentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsMetricSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "syncJobId" TEXT,
    "snapshotTime" TIMESTAMP(3) NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "saves" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "followersGain" INTEGER,
    "profileVisits" INTEGER,
    "leads" INTEGER,
    "orders" INTEGER,
    "gmv" DECIMAL(18,2),
    "rawMetricsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentOpsMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsHotContent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "url" TEXT NOT NULL,
    "platformContentId" VARCHAR(255),
    "authorName" VARCHAR(200),
    "authorHomepage" TEXT,
    "title" VARCHAR(500),
    "summary" TEXT,
    "publishTime" TIMESTAMP(3),
    "views" INTEGER,
    "likes" INTEGER,
    "saves" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "topics" JSONB,
    "coverUrl" TEXT,
    "sourceKeyword" VARCHAR(255),
    "sourceCompetitor" VARCHAR(255),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" JSONB,
    "analysisJson" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentOpsHotContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsMaterial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "content" TEXT,
    "fileId" TEXT,
    "tags" JSONB,
    "brandTone" TEXT,
    "forbiddenTerms" JSONB,
    "remark" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentOpsMaterial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsMatrix" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "platforms" JSONB,
    "primaryProduct" TEXT,
    "targetAudience" TEXT,
    "contentGoal" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "inputJson" JSONB,
    "generatedBy" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentOpsMatrix_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsMatrixItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "platform" VARCHAR(32),
    "direction" VARCHAR(255) NOT NULL,
    "titleCandidates" JSONB,
    "bodyDraft" TEXT,
    "videoScript" TEXT,
    "imageSuggestion" TEXT,
    "ctaSuggestion" TEXT,
    "hashtags" JSONB,
    "testPurpose" TEXT,
    "riskHints" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "qualityStatus" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "qualityIssues" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentOpsMatrixItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsReviewReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platformAccountId" TEXT,
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'READY',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "platform" VARCHAR(32),
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "markdownContent" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentOpsReviewReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentOpsAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT,
    "module" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "bizType" VARCHAR(64),
    "bizId" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentOpsAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentOpsPlatformAccount_tenantId_platform_platformAccountId_key" ON "ContentOpsPlatformAccount"("tenantId", "platform", "platformAccountId");
CREATE INDEX "ContentOpsPlatformAccount_tenantId_authStatus_deletedAt_idx" ON "ContentOpsPlatformAccount"("tenantId", "authStatus", "deletedAt");
CREATE INDEX "ContentOpsPlatformAccount_tenantId_platform_deletedAt_idx" ON "ContentOpsPlatformAccount"("tenantId", "platform", "deletedAt");
CREATE UNIQUE INDEX "ContentOpsSyncJob_tenantId_idempotencyKey_key" ON "ContentOpsSyncJob"("tenantId", "idempotencyKey");
CREATE INDEX "ContentOpsSyncJob_tenantId_status_createdAt_idx" ON "ContentOpsSyncJob"("tenantId", "status", "createdAt");
CREATE INDEX "ContentOpsSyncJob_platformAccountId_createdAt_idx" ON "ContentOpsSyncJob"("platformAccountId", "createdAt");
CREATE UNIQUE INDEX "ContentOpsSyncBatch_syncJobId_batchKey_key" ON "ContentOpsSyncBatch"("syncJobId", "batchKey");
CREATE INDEX "ContentOpsSyncBatch_tenantId_createdAt_idx" ON "ContentOpsSyncBatch"("tenantId", "createdAt");
CREATE UNIQUE INDEX "ContentOpsContentItem_tenantId_platform_platformAccountId_platformContentId_key" ON "ContentOpsContentItem"("tenantId", "platform", "platformAccountId", "platformContentId");
CREATE INDEX "ContentOpsContentItem_tenantId_platform_publishTime_idx" ON "ContentOpsContentItem"("tenantId", "platform", "publishTime");
CREATE INDEX "ContentOpsContentItem_platformAccountId_publishTime_idx" ON "ContentOpsContentItem"("platformAccountId", "publishTime");
CREATE INDEX "ContentOpsContentItem_tenantId_deletedAt_idx" ON "ContentOpsContentItem"("tenantId", "deletedAt");
CREATE UNIQUE INDEX "ContentOpsMetricSnapshot_contentItemId_snapshotTime_key" ON "ContentOpsMetricSnapshot"("contentItemId", "snapshotTime");
CREATE INDEX "ContentOpsMetricSnapshot_tenantId_snapshotTime_idx" ON "ContentOpsMetricSnapshot"("tenantId", "snapshotTime");
CREATE INDEX "ContentOpsMetricSnapshot_syncJobId_idx" ON "ContentOpsMetricSnapshot"("syncJobId");
CREATE UNIQUE INDEX "ContentOpsHotContent_tenantId_url_key" ON "ContentOpsHotContent"("tenantId", "url");
CREATE INDEX "ContentOpsHotContent_tenantId_platform_status_idx" ON "ContentOpsHotContent"("tenantId", "platform", "status");
CREATE INDEX "ContentOpsHotContent_tenantId_collectedAt_idx" ON "ContentOpsHotContent"("tenantId", "collectedAt");
CREATE INDEX "ContentOpsMaterial_tenantId_type_status_idx" ON "ContentOpsMaterial"("tenantId", "type", "status");
CREATE INDEX "ContentOpsMaterial_tenantId_deletedAt_idx" ON "ContentOpsMaterial"("tenantId", "deletedAt");
CREATE INDEX "ContentOpsMatrix_tenantId_status_createdAt_idx" ON "ContentOpsMatrix"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "ContentOpsMatrixItem_matrixId_sequence_key" ON "ContentOpsMatrixItem"("matrixId", "sequence");
CREATE INDEX "ContentOpsMatrixItem_tenantId_platform_idx" ON "ContentOpsMatrixItem"("tenantId", "platform");
CREATE INDEX "ContentOpsReviewReport_tenantId_generatedAt_idx" ON "ContentOpsReviewReport"("tenantId", "generatedAt");
CREATE INDEX "ContentOpsReviewReport_platformAccountId_generatedAt_idx" ON "ContentOpsReviewReport"("platformAccountId", "generatedAt");
CREATE INDEX "ContentOpsAuditLog_tenantId_createdAt_idx" ON "ContentOpsAuditLog"("tenantId", "createdAt");
CREATE INDEX "ContentOpsAuditLog_tenantId_module_action_idx" ON "ContentOpsAuditLog"("tenantId", "module", "action");

ALTER TABLE "ContentOpsSyncJob" ADD CONSTRAINT "ContentOpsSyncJob_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "ContentOpsPlatformAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentOpsSyncBatch" ADD CONSTRAINT "ContentOpsSyncBatch_syncJobId_fkey" FOREIGN KEY ("syncJobId") REFERENCES "ContentOpsSyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentOpsContentItem" ADD CONSTRAINT "ContentOpsContentItem_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "ContentOpsPlatformAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentOpsMetricSnapshot" ADD CONSTRAINT "ContentOpsMetricSnapshot_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentOpsContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentOpsMetricSnapshot" ADD CONSTRAINT "ContentOpsMetricSnapshot_syncJobId_fkey" FOREIGN KEY ("syncJobId") REFERENCES "ContentOpsSyncJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentOpsMatrixItem" ADD CONSTRAINT "ContentOpsMatrixItem_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "ContentOpsMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentOpsReviewReport" ADD CONSTRAINT "ContentOpsReviewReport_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "ContentOpsPlatformAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
