ALTER TABLE "DailyTask" ADD COLUMN IF NOT EXISTS "rewardAmount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "AppUser" (
  "id" TEXT NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "nickname" VARCHAR(80),
  "avatarUrl" TEXT,
  "wechatOpenid" VARCHAR(128),
  "serviceOpenid" VARCHAR(128),
  "unionid" VARCHAR(128),
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "bannedUntil" TIMESTAMP(3),
  "banReason" TEXT,
  "totalCompletedOrders" INTEGER NOT NULL DEFAULT 0,
  "totalSettledAmount" INTEGER NOT NULL DEFAULT 0,
  "balanceAmount" INTEGER NOT NULL DEFAULT 0,
  "withdrawnAmount" INTEGER NOT NULL DEFAULT 0,
  "lastLoginAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppUser_phone_key" ON "AppUser"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "AppUser_wechatOpenid_key" ON "AppUser"("wechatOpenid");
CREATE UNIQUE INDEX IF NOT EXISTS "AppUser_serviceOpenid_key" ON "AppUser"("serviceOpenid");
CREATE INDEX IF NOT EXISTS "AppUser_status_idx" ON "AppUser"("status");
CREATE INDEX IF NOT EXISTS "AppUser_bannedUntil_idx" ON "AppUser"("bannedUntil");
CREATE INDEX IF NOT EXISTS "AppUser_createdAt_idx" ON "AppUser"("createdAt");

ALTER TABLE "TaskParticipant" ADD COLUMN IF NOT EXISTS "appUserId" TEXT;
ALTER TABLE "TaskParticipant" ADD COLUMN IF NOT EXISTS "mediaAccountNo" VARCHAR(100);
ALTER TABLE "TaskParticipant" ADD COLUMN IF NOT EXISTS "proofOcrStatus" VARCHAR(32) DEFAULT 'PENDING';
ALTER TABLE "TaskParticipant" ADD COLUMN IF NOT EXISTS "proofOcrText" TEXT;
ALTER TABLE "TaskParticipant" ADD COLUMN IF NOT EXISTS "abandonedAt" TIMESTAMP(3);
ALTER TABLE "TaskParticipant" ADD COLUMN IF NOT EXISTS "abandonReason" TEXT;
CREATE INDEX IF NOT EXISTS "TaskParticipant_appUserId_idx" ON "TaskParticipant"("appUserId");
CREATE INDEX IF NOT EXISTS "TaskParticipant_mediaAccountNo_idx" ON "TaskParticipant"("mediaAccountNo");
DO $$ BEGIN
  ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AppUserMediaAccount" (
  "id" TEXT NOT NULL,
  "appUserId" TEXT NOT NULL,
  "platform" VARCHAR(32) NOT NULL,
  "accountNo" VARCHAR(100) NOT NULL,
  "accountName" VARCHAR(100),
  "source" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  "proofFileId" TEXT,
  "proofUrl" TEXT,
  "ocrText" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppUserMediaAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppUserMediaAccount_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AppUserMediaAccount_appUserId_platform_accountNo_key" ON "AppUserMediaAccount"("appUserId", "platform", "accountNo");
CREATE INDEX IF NOT EXISTS "AppUserMediaAccount_platform_accountNo_idx" ON "AppUserMediaAccount"("platform", "accountNo");

CREATE TABLE IF NOT EXISTS "AppUserRestriction" (
  "id" TEXT NOT NULL,
  "appUserId" TEXT NOT NULL,
  "operatorId" TEXT,
  "reason" TEXT NOT NULL,
  "screenshotFileId" TEXT,
  "screenshotUrl" TEXT,
  "days" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppUserRestriction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppUserRestriction_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AppUserRestriction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AppUserRestriction_appUserId_status_idx" ON "AppUserRestriction"("appUserId", "status");
CREATE INDEX IF NOT EXISTS "AppUserRestriction_endsAt_idx" ON "AppUserRestriction"("endsAt");

CREATE TABLE IF NOT EXISTS "TaskAbandonLog" (
  "id" TEXT NOT NULL,
  "appUserId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "participantId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskAbandonLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskAbandonLog_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TaskAbandonLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TaskAbandonLog_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "TaskParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TaskAbandonLog_appUserId_createdAt_idx" ON "TaskAbandonLog"("appUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "TaskAbandonLog_taskId_idx" ON "TaskAbandonLog"("taskId");

CREATE TABLE IF NOT EXISTS "AppUserWalletLedger" (
  "id" TEXT NOT NULL,
  "appUserId" TEXT NOT NULL,
  "participantId" TEXT,
  "type" VARCHAR(32) NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppUserWalletLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppUserWalletLedger_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AppUserWalletLedger_appUserId_createdAt_idx" ON "AppUserWalletLedger"("appUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AppUserWalletLedger_participantId_idx" ON "AppUserWalletLedger"("participantId");

CREATE TABLE IF NOT EXISTS "AppUserWithdrawal" (
  "id" TEXT NOT NULL,
  "appUserId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "channel" VARCHAR(32) NOT NULL DEFAULT 'WECHAT_TRANSFER',
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "outBatchNo" VARCHAR(128),
  "outDetailNo" VARCHAR(128),
  "tradeNo" VARCHAR(128),
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppUserWithdrawal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppUserWithdrawal_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AppUserWithdrawal_appUserId_status_idx" ON "AppUserWithdrawal"("appUserId", "status");
CREATE INDEX IF NOT EXISTS "AppUserWithdrawal_createdAt_idx" ON "AppUserWithdrawal"("createdAt");
