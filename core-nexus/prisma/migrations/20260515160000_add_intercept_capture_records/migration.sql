-- CreateTable
CREATE TABLE "InterceptCaptureRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "runId" VARCHAR(64),
    "platform" VARCHAR(32) NOT NULL,
    "accountAlias" VARCHAR(100),
    "targetType" VARCHAR(32),
    "targetUrl" TEXT,
    "homepageUrl" TEXT,
    "contentUrl" TEXT,
    "platformContentId" VARCHAR(128),
    "contentTitle" TEXT,
    "publishTimeIso" TIMESTAMP(3),
    "commentId" VARCHAR(128),
    "parentCommentId" VARCHAR(128),
    "userId" VARCHAR(128),
    "nickname" VARCHAR(100),
    "commentText" TEXT,
    "commentTimeIso" TIMESTAMP(3),
    "visibleRegion" TEXT,
    "raw" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterceptCaptureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterceptCaptureRecord_tenantId_capturedAt_idx" ON "InterceptCaptureRecord"("tenantId", "capturedAt");
CREATE INDEX "InterceptCaptureRecord_robotId_capturedAt_idx" ON "InterceptCaptureRecord"("robotId", "capturedAt");
CREATE INDEX "InterceptCaptureRecord_platform_idx" ON "InterceptCaptureRecord"("platform");
CREATE INDEX "InterceptCaptureRecord_platformContentId_idx" ON "InterceptCaptureRecord"("platformContentId");
CREATE INDEX "InterceptCaptureRecord_commentId_idx" ON "InterceptCaptureRecord"("commentId");

-- AddForeignKey
ALTER TABLE "InterceptCaptureRecord" ADD CONSTRAINT "InterceptCaptureRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterceptCaptureRecord" ADD CONSTRAINT "InterceptCaptureRecord_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
