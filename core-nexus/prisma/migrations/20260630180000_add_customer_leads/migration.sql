-- CreateTable
CREATE TABLE "CustomerLead" (
    "id" TEXT NOT NULL,
    "companyName" VARCHAR(150) NOT NULL,
    "contactName" VARCHAR(80),
    "contactInfo" VARCHAR(200),
    "companyAddress" VARCHAR(500),
    "primaryCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "requestedFeatures" TEXT,
    "notWonReason" TEXT,
    "followUpStatus" VARCHAR(32) NOT NULL DEFAULT 'PENDING_CONTACT',
    "followUpValue" VARCHAR(32) NOT NULL DEFAULT 'NURTURE',
    "followUpOwner" VARCHAR(80),
    "nextFollowUpAt" TIMESTAMP(3),
    "lastFollowUpNote" TEXT,
    "remark" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLead_companyName_idx" ON "CustomerLead"("companyName");

-- CreateIndex
CREATE INDEX "CustomerLead_followUpStatus_idx" ON "CustomerLead"("followUpStatus");

-- CreateIndex
CREATE INDEX "CustomerLead_followUpValue_idx" ON "CustomerLead"("followUpValue");

-- CreateIndex
CREATE INDEX "CustomerLead_followUpOwner_idx" ON "CustomerLead"("followUpOwner");

-- CreateIndex
CREATE INDEX "CustomerLead_nextFollowUpAt_idx" ON "CustomerLead"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "CustomerLead_deletedAt_idx" ON "CustomerLead"("deletedAt");
