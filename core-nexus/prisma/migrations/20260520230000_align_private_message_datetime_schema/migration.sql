-- Align the raw SQL migration with the Prisma schema for lead private message task tables.
-- This migration is intentionally safe to run after a failed/local sync attempt:
-- - TYPE changes are no-ops when the column already has the target type.
-- - DROP DEFAULT is safe even when the column no longer has a default.

ALTER TABLE "PrivateMessageTaskBatch"
  ALTER COLUMN "plannedStartAt" TYPE TIMESTAMPTZ(6) USING "plannedStartAt"::TIMESTAMPTZ,
  ALTER COLUMN "plannedEndAt" TYPE TIMESTAMPTZ(6) USING "plannedEndAt"::TIMESTAMPTZ,
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt"::TIMESTAMPTZ,
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt"::TIMESTAMPTZ,
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "PrivateMessageTask"
  ALTER COLUMN "plannedStartAt" TYPE TIMESTAMPTZ(6) USING "plannedStartAt"::TIMESTAMPTZ,
  ALTER COLUMN "plannedEndAt" TYPE TIMESTAMPTZ(6) USING "plannedEndAt"::TIMESTAMPTZ,
  ALTER COLUMN "claimedAt" TYPE TIMESTAMPTZ(6) USING "claimedAt"::TIMESTAMPTZ,
  ALTER COLUMN "lastSendAt" TYPE TIMESTAMPTZ(6) USING "lastSendAt"::TIMESTAMPTZ,
  ALTER COLUMN "sentAt" TYPE TIMESTAMPTZ(6) USING "sentAt"::TIMESTAMPTZ,
  ALTER COLUMN "approvedAt" TYPE TIMESTAMPTZ(6) USING "approvedAt"::TIMESTAMPTZ,
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt"::TIMESTAMPTZ,
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt"::TIMESTAMPTZ,
  ALTER COLUMN "updatedAt" DROP DEFAULT;
