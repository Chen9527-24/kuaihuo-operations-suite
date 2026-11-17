-- 行业 AI 机器人 V4.1：行业范围与敏感消息策略。
-- 仅向独立 IndustryAiRobot 表新增带安全默认值的配置字段；不改写既有机器人、固定回复、能力包或测试记录。
ALTER TABLE "IndustryAiRobot"
  ADD COLUMN IF NOT EXISTS "outOfScopePolicy" VARCHAR(32) NOT NULL DEFAULT 'GUIDE_BACK',
  ADD COLUMN IF NOT EXISTS "outOfScopeReply" TEXT,
  ADD COLUMN IF NOT EXISTS "sensitiveMessagePolicy" VARCHAR(32) NOT NULL DEFAULT 'HANDOFF',
  ADD COLUMN IF NOT EXISTS "sensitiveReply" TEXT;
