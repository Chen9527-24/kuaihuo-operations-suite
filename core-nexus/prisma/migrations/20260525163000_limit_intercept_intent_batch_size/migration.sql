-- 降低截流评论意向分析单次请求子批大小，减少 Coze 工作流因单批评论过多导致的失败。
UPDATE "InterceptIntentPromptConfig"
SET "batchSize" = 20
WHERE "batchSize" > 20;

ALTER TABLE "InterceptIntentPromptConfig"
ALTER COLUMN "batchSize" SET DEFAULT 20;

ALTER TABLE "InterceptIntentAnalysisBatch"
ALTER COLUMN "batchSize" SET DEFAULT 20;
