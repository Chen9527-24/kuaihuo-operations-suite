-- CustomerLead 的 nextFollowUpAt 是“当前待办的下次计划跟进时间”，并非历史记录。
-- 每一次实际沟通均写入 CustomerLeadFollowUp，后续登记不会覆盖旧记录。
ALTER TABLE "CustomerLead"
  ADD COLUMN IF NOT EXISTS "nextFollowUpPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "lastFollowUpAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "followUpCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "CustomerLeadFollowUp" (
  "id" TEXT NOT NULL,
  "customerLeadId" TEXT NOT NULL,
  "followedUpAt" TIMESTAMP(3) NOT NULL,
  "followUpMethod" VARCHAR(32),
  "followUpOwner" VARCHAR(80),
  "summary" TEXT NOT NULL,
  "followUpStatus" VARCHAR(32) NOT NULL,
  "followUpValue" VARCHAR(32) NOT NULL,
  "nextFollowUpAt" TIMESTAMP(3),
  "nextFollowUpPlan" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerLeadFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerLead_lastFollowUpAt_idx" ON "CustomerLead"("lastFollowUpAt");
CREATE INDEX IF NOT EXISTS "CustomerLeadFollowUp_customerLeadId_followedUpAt_idx"
  ON "CustomerLeadFollowUp"("customerLeadId", "followedUpAt");
CREATE INDEX IF NOT EXISTS "CustomerLeadFollowUp_followedUpAt_idx" ON "CustomerLeadFollowUp"("followedUpAt");
CREATE INDEX IF NOT EXISTS "CustomerLeadFollowUp_followUpOwner_idx" ON "CustomerLeadFollowUp"("followUpOwner");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLeadFollowUp_customerLeadId_fkey'
  ) THEN
    ALTER TABLE "CustomerLeadFollowUp"
      ADD CONSTRAINT "CustomerLeadFollowUp_customerLeadId_fkey"
      FOREIGN KEY ("customerLeadId") REFERENCES "CustomerLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 将上一版“最近跟进说明”透明迁移为一条历史记录：该版本没有保存真实发生时间，
-- 所以用原商机记录的更新时间作为展示时间，并在摘要中明确标注来源。
INSERT INTO "CustomerLeadFollowUp" (
  "id", "customerLeadId", "followedUpAt", "summary", "followUpStatus", "followUpValue",
  "followUpOwner", "nextFollowUpAt", "nextFollowUpPlan", "createdAt", "updatedAt"
)
SELECT
  'legacy-follow-up-' || "id",
  "id",
  "updatedAt",
  '【历史迁移：原最近跟进说明】' || E'\n' || "lastFollowUpNote",
  "followUpStatus",
  "followUpValue",
  "followUpOwner",
  "nextFollowUpAt",
  "nextFollowUpPlan",
  "createdAt",
  "updatedAt"
FROM "CustomerLead"
WHERE "lastFollowUpNote" IS NOT NULL
  AND btrim("lastFollowUpNote") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "CustomerLeadFollowUp" f WHERE f."id" = 'legacy-follow-up-' || "CustomerLead"."id"
  );

UPDATE "CustomerLead"
SET
  "lastFollowUpAt" = COALESCE("lastFollowUpAt", "updatedAt"),
  "followUpCount" = GREATEST("followUpCount", 1)
WHERE "lastFollowUpNote" IS NOT NULL
  AND btrim("lastFollowUpNote") <> '';
