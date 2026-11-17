-- 新行业 AI 机器人模块专用：店铺/客服服务边界和场景能力分类。
-- 仅向独立 IndustryAi* 表新增可空字段，不改写既有评论、私信、截流机器人或历史数据。
ALTER TABLE "IndustryAiScenario"
  ADD COLUMN IF NOT EXISTS "serviceKey" VARCHAR(64);

ALTER TABLE "IndustryAiRobot"
  ADD COLUMN IF NOT EXISTS "serviceCapabilities" JSONB;
