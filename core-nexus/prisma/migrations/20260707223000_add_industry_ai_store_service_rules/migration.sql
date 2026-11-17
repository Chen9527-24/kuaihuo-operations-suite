-- V4.2：行业 AI 机器人店铺结构化处理规则。
-- 仅为 IndustryAiRobot 增加可选 JSON 配置；不回填、不改写历史机器人、固定回复或测试记录。
ALTER TABLE "IndustryAiRobot"
ADD COLUMN "storeServiceRules" JSONB;
