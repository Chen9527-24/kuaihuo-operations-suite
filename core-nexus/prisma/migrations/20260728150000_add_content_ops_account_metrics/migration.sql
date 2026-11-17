CREATE TABLE "ContentOpsAccountMetricDaily" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "platformAccountId" TEXT NOT NULL,
  "syncJobId" TEXT,
  "platform" VARCHAR(32) NOT NULL,
  "metricDate" TIMESTAMP(3) NOT NULL,
  "publishedCount" INTEGER,
  "impressions" INTEGER,
  "views" INTEGER,
  "likes" INTEGER,
  "saves" INTEGER,
  "comments" INTEGER,
  "shares" INTEGER,
  "followersGain" INTEGER,
  "followersLost" INTEGER,
  "profileVisits" INTEGER,
  "activeFollowers" INTEGER,
  "engagementRate" DECIMAL(12,6),
  "completionRate" DECIMAL(12,6),
  "sourcePage" VARCHAR(255),
  "rawMetricsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentOpsAccountMetricDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentOpsAccountMetricDaily_platformAccountId_metricDate_key"
  ON "ContentOpsAccountMetricDaily"("platformAccountId", "metricDate");
CREATE INDEX "ContentOpsAccountMetricDaily_tenantId_platform_metricDate_idx"
  ON "ContentOpsAccountMetricDaily"("tenantId", "platform", "metricDate");
CREATE INDEX "ContentOpsAccountMetricDaily_syncJobId_idx"
  ON "ContentOpsAccountMetricDaily"("syncJobId");
ALTER TABLE "ContentOpsAccountMetricDaily"
  ADD CONSTRAINT "ContentOpsAccountMetricDaily_platformAccountId_fkey"
  FOREIGN KEY ("platformAccountId") REFERENCES "ContentOpsPlatformAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentOpsAccountMetricDaily"
  ADD CONSTRAINT "ContentOpsAccountMetricDaily_syncJobId_fkey"
  FOREIGN KEY ("syncJobId") REFERENCES "ContentOpsSyncJob"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
