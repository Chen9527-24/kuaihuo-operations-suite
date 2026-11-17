CREATE TABLE "CustomerServiceKnowledgeRevisionDraft" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "calibrationRecordId" TEXT NOT NULL,
  "targetEntryId" TEXT,
  "targetEntryRevision" INTEGER,
  "action" VARCHAR(24) NOT NULL DEFAULT 'CREATE',
  "scopeType" VARCHAR(24) NOT NULL,
  "scopeKey" VARCHAR(500) NOT NULL,
  "category" VARCHAR(40) NOT NULL DEFAULT 'OTHER',
  "title" VARCHAR(200) NOT NULL,
  "question" TEXT,
  "content" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceReference" VARCHAR(1000),
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "freshnessPolicy" VARCHAR(120),
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "verificationNote" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" TEXT,
  "publishedEntryId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "publishedById" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceKnowledgeRevisionDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerServiceKnowledgeRevisionDraft_calibrationRecordId_key" ON "CustomerServiceKnowledgeRevisionDraft"("calibrationRecordId");
CREATE INDEX "CsKnowledgeRevisionDraft_tenant_status" ON "CustomerServiceKnowledgeRevisionDraft"("tenantId", "status", "updatedAt");
CREATE INDEX "CsKnowledgeRevisionDraft_scope_status" ON "CustomerServiceKnowledgeRevisionDraft"("tenantId", "scopeType", "scopeKey", "status");
CREATE INDEX "CsKnowledgeRevisionDraft_target" ON "CustomerServiceKnowledgeRevisionDraft"("targetEntryId");
CREATE INDEX "CsKnowledgeRevisionDraft_published" ON "CustomerServiceKnowledgeRevisionDraft"("publishedEntryId");
CREATE INDEX "CsKnowledgeRevisionDraft_deletedAt" ON "CustomerServiceKnowledgeRevisionDraft"("deletedAt");
ALTER TABLE "CustomerServiceKnowledgeRevisionDraft" ADD CONSTRAINT "CsKnowledgeRevisionDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeRevisionDraft" ADD CONSTRAINT "CsKnowledgeRevisionDraft_calibrationRecordId_fkey" FOREIGN KEY ("calibrationRecordId") REFERENCES "CustomerServiceCalibrationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeRevisionDraft" ADD CONSTRAINT "CsKnowledgeRevisionDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeRevisionDraft" ADD CONSTRAINT "CsKnowledgeRevisionDraft_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeRevisionDraft" ADD CONSTRAINT "CsKnowledgeRevisionDraft_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceKnowledgeRevisionDraft" ADD CONSTRAINT "CsKnowledgeRevisionDraft_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
