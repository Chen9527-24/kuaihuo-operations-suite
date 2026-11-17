-- CreateTable
CREATE TABLE "RobotDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "platform" VARCHAR(32),
    "deviceCode" VARCHAR(64) NOT NULL,
    "deviceSecretHash" VARCHAR(255),
    "status" VARCHAR(32) NOT NULL DEFAULT 'OFFLINE',
    "clientVersion" VARCHAR(32),
    "osName" VARCHAR(64),
    "ip" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "remark" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotPlatformAuth" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "authType" VARCHAR(32) NOT NULL DEFAULT 'QR_SESSION',
    "accountUid" VARCHAR(100),
    "accountName" VARCHAR(100),
    "accountAvatarUrl" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'UNBOUND',
    "sessionData" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "authorizedByUserId" TEXT,
    "deviceId" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "remark" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotPlatformAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Robot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "authId" TEXT,
    "deviceId" TEXT,
    "expireAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "stopReason" VARCHAR(32),
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastError" TEXT,
    "config" JSONB,
    "remark" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Robot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "authId" TEXT,
    "deviceId" TEXT,
    "createdById" TEXT,
    "runToken" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
    "stopReason" VARCHAR(32),
    "lastHeartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RobotDevice_deviceCode_key" ON "RobotDevice"("deviceCode");

-- CreateIndex
CREATE INDEX "RobotDevice_tenantId_status_idx" ON "RobotDevice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RobotDevice_platform_idx" ON "RobotDevice"("platform");

-- CreateIndex
CREATE INDEX "RobotDevice_lastHeartbeatAt_idx" ON "RobotDevice"("lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "RobotDevice_deletedAt_idx" ON "RobotDevice"("deletedAt");

-- CreateIndex
CREATE INDEX "RobotPlatformAuth_tenantId_platform_idx" ON "RobotPlatformAuth"("tenantId", "platform");

-- CreateIndex
CREATE INDEX "RobotPlatformAuth_status_idx" ON "RobotPlatformAuth"("status");

-- CreateIndex
CREATE INDEX "RobotPlatformAuth_deviceId_idx" ON "RobotPlatformAuth"("deviceId");

-- CreateIndex
CREATE INDEX "RobotPlatformAuth_sessionExpiresAt_idx" ON "RobotPlatformAuth"("sessionExpiresAt");

-- CreateIndex
CREATE INDEX "RobotPlatformAuth_deletedAt_idx" ON "RobotPlatformAuth"("deletedAt");

-- CreateIndex
CREATE INDEX "Robot_tenantId_platform_idx" ON "Robot"("tenantId", "platform");

-- CreateIndex
CREATE INDEX "Robot_tenantId_type_idx" ON "Robot"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Robot_status_idx" ON "Robot"("status");

-- CreateIndex
CREATE INDEX "Robot_authId_idx" ON "Robot"("authId");

-- CreateIndex
CREATE INDEX "Robot_deviceId_idx" ON "Robot"("deviceId");

-- CreateIndex
CREATE INDEX "Robot_expireAt_idx" ON "Robot"("expireAt");

-- CreateIndex
CREATE INDEX "Robot_deletedAt_idx" ON "Robot"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RobotRun_runToken_key" ON "RobotRun"("runToken");

-- CreateIndex
CREATE INDEX "RobotRun_tenantId_status_idx" ON "RobotRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RobotRun_robotId_status_idx" ON "RobotRun"("robotId", "status");

-- CreateIndex
CREATE INDEX "RobotRun_authId_idx" ON "RobotRun"("authId");

-- CreateIndex
CREATE INDEX "RobotRun_deviceId_idx" ON "RobotRun"("deviceId");

-- CreateIndex
CREATE INDEX "RobotRun_startedAt_idx" ON "RobotRun"("startedAt");

-- AddForeignKey
ALTER TABLE "RobotDevice" ADD CONSTRAINT "RobotDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotPlatformAuth" ADD CONSTRAINT "RobotPlatformAuth_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotPlatformAuth" ADD CONSTRAINT "RobotPlatformAuth_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotPlatformAuth" ADD CONSTRAINT "RobotPlatformAuth_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RobotDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_authId_fkey" FOREIGN KEY ("authId") REFERENCES "RobotPlatformAuth"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RobotDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotRun" ADD CONSTRAINT "RobotRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotRun" ADD CONSTRAINT "RobotRun_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotRun" ADD CONSTRAINT "RobotRun_authId_fkey" FOREIGN KEY ("authId") REFERENCES "RobotPlatformAuth"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotRun" ADD CONSTRAINT "RobotRun_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RobotDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotRun" ADD CONSTRAINT "RobotRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
