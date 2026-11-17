ALTER TABLE "ContentOpsSyncBatch"
  ADD COLUMN "stepType" VARCHAR(32);

ALTER TABLE "ContentOpsMetricSnapshot"
  ADD COLUMN "snapshotKind" VARCHAR(32) NOT NULL DEFAULT 'COLLECTED',
  ADD COLUMN "captureBatchKey" VARCHAR(128);

WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "contentItemId"
           ORDER BY "snapshotTime" ASC, "createdAt" ASC, "id" ASC
         ) AS row_no
  FROM "ContentOpsMetricSnapshot"
)
UPDATE "ContentOpsMetricSnapshot" AS snapshot
SET "snapshotKind" = CASE WHEN ranked.row_no = 1 THEN 'BASELINE' ELSE 'COLLECTED' END
FROM ranked
WHERE snapshot."id" = ranked."id";

CREATE INDEX "ContentOpsMetricSnapshot_tenantId_snapshotKind_snapshotTime_idx"
  ON "ContentOpsMetricSnapshot"("tenantId", "snapshotKind", "snapshotTime");


ALTER TABLE "ContentOpsSyncBatch"
  ADD CONSTRAINT "ContentOpsSyncBatch_stepType_check"
  CHECK ("stepType" IS NULL OR "stepType" IN ('VIDEO', 'IMAGE_TEXT'));

ALTER TABLE "ContentOpsMetricSnapshot"
  ADD CONSTRAINT "ContentOpsMetricSnapshot_snapshotKind_check"
  CHECK ("snapshotKind" IN ('BASELINE', 'COLLECTED'));

CREATE UNIQUE INDEX "ContentOpsMetricSnapshot_one_baseline_per_content_idx"
  ON "ContentOpsMetricSnapshot"("contentItemId")
  WHERE "snapshotKind" = 'BASELINE';
