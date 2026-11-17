-- 主链路收敛：测试批次取代递归式测试清理；任务仍保留历史范围字段兼容。
CREATE TABLE "TestDataBatch" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "purpose" VARCHAR(500),
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT,
  "archivedAt" TIMESTAMP(3),
  "archivedById" TEXT,
  "purgedAt" TIMESTAMP(3),
  "purgedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TestDataBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestDataBatchUser" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "appUserId" TEXT NOT NULL,
  "role" VARCHAR(32) NOT NULL DEFAULT 'MEMBER',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TestDataBatchUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestDataBatchGroup" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TestDataBatchGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DailyTask" ADD COLUMN "testBatchId" TEXT;
ALTER TABLE "TaskParticipant" ADD COLUMN "testBatchId" TEXT;
ALTER TABLE "AppUserWalletLedger" ADD COLUMN "testBatchId" TEXT;
ALTER TABLE "AppUserWithdrawal" ADD COLUMN "testBatchId" TEXT;
ALTER TABLE "LeaderCommissionSettlement" ADD COLUMN "testBatchId" TEXT;

ALTER TABLE "DistributionLeaderApplication" ADD COLUMN "contactPhone" VARCHAR(20);
ALTER TABLE "DistributionLeaderApplication" ADD COLUMN "agreedToLeaderRules" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "TestDataBatch_tenantId_name_key" ON "TestDataBatch"("tenantId", "name");
CREATE INDEX "TestDataBatch_tenantId_status_idx" ON "TestDataBatch"("tenantId", "status");
CREATE INDEX "TestDataBatch_createdAt_idx" ON "TestDataBatch"("createdAt");
CREATE UNIQUE INDEX "TestDataBatchUser_batchId_appUserId_key" ON "TestDataBatchUser"("batchId", "appUserId");
CREATE INDEX "TestDataBatchUser_appUserId_createdAt_idx" ON "TestDataBatchUser"("appUserId", "createdAt");
CREATE UNIQUE INDEX "TestDataBatchGroup_batchId_groupId_key" ON "TestDataBatchGroup"("batchId", "groupId");
CREATE INDEX "TestDataBatchGroup_groupId_createdAt_idx" ON "TestDataBatchGroup"("groupId", "createdAt");
CREATE INDEX "DailyTask_testBatchId_idx" ON "DailyTask"("testBatchId");
CREATE INDEX "TaskParticipant_testBatchId_idx" ON "TaskParticipant"("testBatchId");
CREATE INDEX "AppUserWalletLedger_testBatchId_idx" ON "AppUserWalletLedger"("testBatchId");
CREATE INDEX "AppUserWithdrawal_testBatchId_idx" ON "AppUserWithdrawal"("testBatchId");
CREATE INDEX "LeaderCommissionSettlement_testBatchId_idx" ON "LeaderCommissionSettlement"("testBatchId");

ALTER TABLE "TestDataBatch" ADD CONSTRAINT "TestDataBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestDataBatchUser" ADD CONSTRAINT "TestDataBatchUser_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TestDataBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestDataBatchUser" ADD CONSTRAINT "TestDataBatchUser_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestDataBatchGroup" ADD CONSTRAINT "TestDataBatchGroup_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TestDataBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppUserWalletLedger" ADD CONSTRAINT "AppUserWalletLedger_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppUserWithdrawal" ADD CONSTRAINT "AppUserWithdrawal_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaderCommissionSettlement" ADD CONSTRAINT "LeaderCommissionSettlement_testBatchId_fkey" FOREIGN KEY ("testBatchId") REFERENCES "TestDataBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
