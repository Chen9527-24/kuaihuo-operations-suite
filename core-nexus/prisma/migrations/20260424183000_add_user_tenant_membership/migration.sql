-- CreateTable
CREATE TABLE "UserTenantMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ENABLED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTenantMembership_userId_tenantId_key" ON "UserTenantMembership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "UserTenantMembership_userId_status_idx" ON "UserTenantMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "UserTenantMembership_tenantId_status_idx" ON "UserTenantMembership"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing single-tenant users into membership table.
INSERT INTO "UserTenantMembership" ("id", "userId", "tenantId", "status", "isDefault", "createdAt", "updatedAt")
SELECT
    'utm_' || md5("id" || ':' || "tenantId"),
    "id",
    "tenantId",
    'ENABLED',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
WHERE "tenantId" IS NOT NULL
ON CONFLICT ("userId", "tenantId") DO NOTHING;
