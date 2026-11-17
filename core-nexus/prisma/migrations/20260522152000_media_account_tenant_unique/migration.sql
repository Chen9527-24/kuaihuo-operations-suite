-- Restrict media-account uniqueness to the tenant boundary.
-- Soft-deleted rows no longer block re-creation of the same platform account ID.
DROP INDEX IF EXISTS "MediaAccount_platform_accountId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "MediaAccount_tenantId_platform_accountId_active_key"
  ON "MediaAccount" ("tenantId", "platform", "accountId")
  WHERE "deletedAt" IS NULL;
