-- 团长解绑、逻辑删除与测试业务数据重置的生命周期字段。
-- 仅在显式标记为测试数据且服务端开启开关时允许清理测试业务流水。

ALTER TABLE "DistributionGroup"
  ADD COLUMN IF NOT EXISTS "isTestData" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "leaderUnboundAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "leaderUnboundById" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById" TEXT,
  ADD COLUMN IF NOT EXISTS "testResetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "testResetById" TEXT;

CREATE INDEX IF NOT EXISTS "DistributionGroup_deletedAt_idx" ON "DistributionGroup"("deletedAt");
CREATE INDEX IF NOT EXISTS "DistributionGroup_isTestData_idx" ON "DistributionGroup"("isTestData");
