-- 独立测试账号标记：只有被管理员明确标记的 H5 账号，才能进入“强制清理测试范围”。
-- 该标记不删除用户，也不影响正常登录；它只是高危测试清理的服务端白名单。

ALTER TABLE "AppUser"
  ADD COLUMN IF NOT EXISTS "isTestData" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "testMarkedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "testMarkedById" TEXT;

CREATE INDEX IF NOT EXISTS "AppUser_isTestData_idx" ON "AppUser"("isTestData");
