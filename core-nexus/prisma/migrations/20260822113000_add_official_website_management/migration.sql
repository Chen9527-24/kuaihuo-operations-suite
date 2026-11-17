CREATE TABLE "WebsiteConfiguration" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'official-website',
    "draftContent" JSONB,
    "publishedContent" JSONB,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "publishedRevision" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebsiteContactSubmission" (
    "id" TEXT NOT NULL,
    "customerLeadId" TEXT NOT NULL,
    "requestId" VARCHAR(64) NOT NULL,
    "submittedCompanyName" VARCHAR(150) NOT NULL,
    "submittedContactName" VARCHAR(80),
    "submittedContactInfo" VARCHAR(200) NOT NULL,
    "businessOverview" TEXT NOT NULL,
    "operatingAccounts" TEXT,
    "challenge" VARCHAR(200) NOT NULL,
    "pageUrl" VARCHAR(1000),
    "referrer" VARCHAR(1000),
    "utmSource" VARCHAR(200),
    "utmMedium" VARCHAR(200),
    "utmCampaign" VARCHAR(200),
    "utmTerm" VARCHAR(200),
    "utmContent" VARCHAR(200),
    "ipHash" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "privacyConsentAt" TIMESTAMP(3) NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "viewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteContactSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsiteContactSubmission_customerLeadId_key" ON "WebsiteContactSubmission"("customerLeadId");
CREATE UNIQUE INDEX "WebsiteContactSubmission_requestId_key" ON "WebsiteContactSubmission"("requestId");
CREATE INDEX "WebsiteContactSubmission_createdAt_idx" ON "WebsiteContactSubmission"("createdAt");
CREATE INDEX "WebsiteContactSubmission_viewedAt_createdAt_idx" ON "WebsiteContactSubmission"("viewedAt", "createdAt");
CREATE INDEX "WebsiteContactSubmission_utmSource_idx" ON "WebsiteContactSubmission"("utmSource");
CREATE INDEX "WebsiteContactSubmission_utmCampaign_idx" ON "WebsiteContactSubmission"("utmCampaign");

ALTER TABLE "WebsiteContactSubmission"
ADD CONSTRAINT "WebsiteContactSubmission_customerLeadId_fkey"
FOREIGN KEY ("customerLeadId") REFERENCES "CustomerLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
