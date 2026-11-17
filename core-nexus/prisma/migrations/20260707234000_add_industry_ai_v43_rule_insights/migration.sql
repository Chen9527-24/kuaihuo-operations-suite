-- 行业 AI 机器人 V4.3：固定回复规则命中统计与最近命中时间。
-- 仅新增 IndustryAiFixedReplyRule 统计字段；不修改既有规则内容、机器人、能力包、旧机器人或历史业务数据。
ALTER TABLE "IndustryAiFixedReplyRule"
  ADD COLUMN IF NOT EXISTS "matchCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastMatchedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "IndustryAiFixedReplyRule_robotId_lastMatchedAt_idx"
  ON "IndustryAiFixedReplyRule"("robotId", "lastMatchedAt");
