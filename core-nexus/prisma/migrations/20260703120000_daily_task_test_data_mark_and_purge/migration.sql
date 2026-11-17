-- 每日任务测试标记与完整测试链路清理。
-- 仅在服务端显式设置 ALLOW_TEST_DATA_PURGE=true 的测试环境中，已标记任务才可物理清理。

ALTER TABLE "DailyTask"
  ADD COLUMN IF NOT EXISTS "isTestData" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "testMarkedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "testMarkedById" TEXT;

CREATE INDEX IF NOT EXISTS "DailyTask_isTestData_idx" ON "DailyTask"("isTestData");
CREATE INDEX IF NOT EXISTS "DailyTask_distributionGroupId_status_idx" ON "DailyTask"("distributionGroupId", "status");
