-- Default new H5 withdrawal records to real WeChat merchant transfer mode.
ALTER TABLE "AppUserWithdrawal"
ALTER COLUMN "transferMode" SET DEFAULT 'WECHAT';
