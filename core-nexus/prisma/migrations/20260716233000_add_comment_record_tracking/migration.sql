ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "externalCommentId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "videoId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "videoTitle" TEXT;
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "senderRole" VARCHAR(32) NOT NULL DEFAULT 'user';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "actorSource" VARCHAR(64) NOT NULL DEFAULT 'platform_user';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "attributionConfidence" VARCHAR(32) NOT NULL DEFAULT 'unknown';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "messageType" VARCHAR(32) NOT NULL DEFAULT 'text';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "typePlaceholder" VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "sourceTimeRaw" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "observedAt" TIMESTAMP(3);
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "timeAccuracy" VARCHAR(32) NOT NULL DEFAULT 'unknown';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "collectionStatus" VARCHAR(64) NOT NULL DEFAULT 'observed';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "currentFilter" VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "repliesCollapsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "threadCompleteness" VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE "CommentRecord" ADD COLUMN IF NOT EXISTS "sourceClientId" VARCHAR(128) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "CommentRecord_tenantId_robotId_videoId_idx"
  ON "CommentRecord"("tenantId", "robotId", "videoId");
CREATE INDEX IF NOT EXISTS "CommentRecord_senderRole_idx" ON "CommentRecord"("senderRole");
CREATE INDEX IF NOT EXISTS "CommentRecord_collectionStatus_idx" ON "CommentRecord"("collectionStatus");
CREATE INDEX IF NOT EXISTS "CommentRecord_observedAt_idx" ON "CommentRecord"("observedAt");
