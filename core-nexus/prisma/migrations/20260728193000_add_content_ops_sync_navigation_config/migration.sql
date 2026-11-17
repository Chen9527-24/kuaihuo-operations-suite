ALTER TABLE "ContentOpsPlatformAccount"
  ADD COLUMN "contentPageUrl" TEXT,
  ADD COLUMN "metricPageUrl" TEXT,
  ADD COLUMN "syncConfig" JSONB;
