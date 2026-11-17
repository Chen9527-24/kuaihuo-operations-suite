-- 商机客户 V3：补齐关键联系人角色、线索来源、现有方案/竞品，以及首次实际跟进投影。
-- CustomerLeadFollowUp 仍是完整历史的唯一事实来源；firstFollowUpAt 仅用于列表/详情高效展示。
ALTER TABLE "CustomerLead"
  ADD COLUMN IF NOT EXISTS "contactPosition" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "leadSource" VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "leadSourceDetail" VARCHAR(300),
  ADD COLUMN IF NOT EXISTS "currentSolution" TEXT,
  ADD COLUMN IF NOT EXISTS "firstFollowUpAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CustomerLead_leadSource_idx" ON "CustomerLead"("leadSource");
CREATE INDEX IF NOT EXISTS "CustomerLead_firstFollowUpAt_idx" ON "CustomerLead"("firstFollowUpAt");

-- 为已有跟进历史回填首次实际跟进时间，避免旧数据在新列表中出现“未跟进”。
UPDATE "CustomerLead" AS lead
SET "firstFollowUpAt" = history."firstFollowUpAt"
FROM (
  SELECT "customerLeadId", MIN("followedUpAt") AS "firstFollowUpAt"
  FROM "CustomerLeadFollowUp"
  GROUP BY "customerLeadId"
) AS history
WHERE lead."id" = history."customerLeadId"
  AND lead."firstFollowUpAt" IS NULL;

-- 兼容在 V2 前已存在、但未生成历史明细的旧记录。
UPDATE "CustomerLead"
SET "firstFollowUpAt" = "lastFollowUpAt"
WHERE "firstFollowUpAt" IS NULL
  AND "lastFollowUpAt" IS NOT NULL;
