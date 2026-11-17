-- PC stage modules: tenants, dictionaries, media accounts, daily tasks, file usages and extended RBAC.
-- This migration intentionally keeps existing data and converts User.status from the old enum into varchar values.

-- Convert User.status enum to varchar and normalize ACTIVE -> ENABLED.
ALTER TABLE "User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE VARCHAR(32) USING (
  CASE WHEN "status"::text = 'ACTIVE' THEN 'ENABLED' ELSE "status"::text END
);
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'ENABLED';
DROP TYPE IF EXISTS "UserStatus";

-- Tenant
CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "industry" VARCHAR(255),
  "productIntro" TEXT,
  "coreSellingPoint" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "expiredAt" TIMESTAMP(3) NOT NULL,
  "remark" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");
CREATE INDEX "Tenant_expiredAt_idx" ON "Tenant"("expiredAt");
CREATE INDEX "Tenant_deletedAt_idx" ON "Tenant"("deletedAt");

-- User extensions
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" VARCHAR(20);
ALTER TABLE "User" ADD COLUMN "avatarFileId" TEXT;
ALTER TABLE "User" ADD COLUMN "remark" TEXT;
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX "User_phone_idx" ON "User"("phone");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Role extensions
ALTER TABLE "Role" ALTER COLUMN "code" TYPE VARCHAR(64);
ALTER TABLE "Role" ALTER COLUMN "name" TYPE VARCHAR(100);
ALTER TABLE "Role" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Role" ADD COLUMN "scope" VARCHAR(32) NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "Role" ADD COLUMN "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED';
ALTER TABLE "Role" ADD COLUMN "description" TEXT;
ALTER TABLE "Role" ADD COLUMN "remark" TEXT;
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");
CREATE INDEX "Role_scope_idx" ON "Role"("scope");
CREATE INDEX "Role_status_idx" ON "Role"("status");

-- Permission extensions
ALTER TABLE "Permission" ALTER COLUMN "code" TYPE VARCHAR(100);
ALTER TABLE "Permission" ALTER COLUMN "name" TYPE VARCHAR(100);
ALTER TABLE "Permission" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Permission" ADD COLUMN "type" VARCHAR(32) NOT NULL DEFAULT 'BUTTON';
ALTER TABLE "Permission" ADD COLUMN "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED';
ALTER TABLE "Permission" ADD COLUMN "sort" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Permission" ADD COLUMN "routePath" TEXT;
ALTER TABLE "Permission" ADD COLUMN "component" TEXT;
ALTER TABLE "Permission" ADD COLUMN "icon" TEXT;
ALTER TABLE "Permission" ADD COLUMN "remark" TEXT;
CREATE INDEX "Permission_parentId_idx" ON "Permission"("parentId");
CREATE INDEX "Permission_type_idx" ON "Permission"("type");
CREATE INDEX "Permission_status_idx" ON "Permission"("status");
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Permission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Dicts
CREATE TABLE "DictType" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DictType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DictType_code_key" ON "DictType"("code");
CREATE INDEX "DictType_status_idx" ON "DictType"("status");

CREATE TABLE "DictItem" (
  "id" TEXT NOT NULL,
  "typeCode" VARCHAR(64) NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "value" VARCHAR(64) NOT NULL,
  "color" TEXT,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DictItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DictItem_typeCode_value_key" ON "DictItem"("typeCode", "value");
CREATE INDEX "DictItem_typeCode_status_idx" ON "DictItem"("typeCode", "status");
ALTER TABLE "DictItem" ADD CONSTRAINT "DictItem_typeCode_fkey" FOREIGN KEY ("typeCode") REFERENCES "DictType"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- Media accounts
CREATE TABLE "MediaAccount" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "platform" VARCHAR(32) NOT NULL,
  "accountId" VARCHAR(100) NOT NULL,
  "accountName" VARCHAR(100) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
  "positioning" TEXT,
  "remark" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaAccount_platform_accountId_key" ON "MediaAccount"("platform", "accountId");
CREATE INDEX "MediaAccount_tenantId_platform_idx" ON "MediaAccount"("tenantId", "platform");
CREATE INDEX "MediaAccount_status_idx" ON "MediaAccount"("status");
CREATE INDEX "MediaAccount_deletedAt_idx" ON "MediaAccount"("deletedAt");
ALTER TABLE "MediaAccount" ADD CONSTRAINT "MediaAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Upload files extensions and usages
ALTER TABLE "UploadFile" ADD COLUMN "scene" VARCHAR(64);
ALTER TABLE "UploadFile" ADD COLUMN "status" VARCHAR(32) NOT NULL DEFAULT 'TEMP';
CREATE INDEX "UploadFile_scene_idx" ON "UploadFile"("scene");
CREATE INDEX "UploadFile_status_idx" ON "UploadFile"("status");

CREATE TABLE "FileUsage" (
  "id" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "bizType" VARCHAR(64) NOT NULL,
  "bizId" TEXT NOT NULL,
  "fieldName" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FileUsage_bizType_bizId_idx" ON "FileUsage"("bizType", "bizId");
CREATE INDEX "FileUsage_fileId_idx" ON "FileUsage"("fileId");
ALTER TABLE "FileUsage" ADD CONSTRAINT "FileUsage_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Daily tasks
CREATE TABLE "DailyTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "mediaAccountId" TEXT NOT NULL,
  "platform" VARCHAR(32) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "videoUrl" TEXT NOT NULL,
  "coverFileId" TEXT,
  "coverUrl" TEXT,
  "copywriting" TEXT,
  "commentRequirement" TEXT,
  "commentExample" TEXT,
  "targetCommentCount" INTEGER NOT NULL,
  "claimedCommentCount" INTEGER NOT NULL DEFAULT 0,
  "completedCommentCount" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "remark" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DailyTask_tenantId_platform_idx" ON "DailyTask"("tenantId", "platform");
CREATE INDEX "DailyTask_mediaAccountId_idx" ON "DailyTask"("mediaAccountId");
CREATE INDEX "DailyTask_status_idx" ON "DailyTask"("status");
CREATE INDEX "DailyTask_createdAt_idx" ON "DailyTask"("createdAt");
CREATE INDEX "DailyTask_deletedAt_idx" ON "DailyTask"("deletedAt");
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_mediaAccountId_fkey" FOREIGN KEY ("mediaAccountId") REFERENCES "MediaAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DailyTaskVideoLink" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyTaskVideoLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DailyTaskVideoLink_taskId_idx" ON "DailyTaskVideoLink"("taskId");
ALTER TABLE "DailyTaskVideoLink" ADD CONSTRAINT "DailyTaskVideoLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskComment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
  "assigneeId" TEXT,
  "assignedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "source" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  "regionCode" TEXT,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");
CREATE INDEX "TaskComment_status_idx" ON "TaskComment"("status");
CREATE INDEX "TaskComment_assigneeId_idx" ON "TaskComment"("assigneeId");
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TaskDispatch" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskDispatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskDispatch_taskId_idx" ON "TaskDispatch"("taskId");
CREATE INDEX "TaskDispatch_status_idx" ON "TaskDispatch"("status");
ALTER TABLE "TaskDispatch" ADD CONSTRAINT "TaskDispatch_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Operation logs
CREATE TABLE "OperationLog" (
  "id" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "tenantId" TEXT,
  "module" VARCHAR(64) NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "bizId" TEXT,
  "description" TEXT,
  "beforeData" JSONB,
  "afterData" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OperationLog_operatorId_idx" ON "OperationLog"("operatorId");
CREATE INDEX "OperationLog_tenantId_idx" ON "OperationLog"("tenantId");
CREATE INDEX "OperationLog_module_action_idx" ON "OperationLog"("module", "action");
CREATE INDEX "OperationLog_createdAt_idx" ON "OperationLog"("createdAt");
