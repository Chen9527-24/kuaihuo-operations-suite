-- V5.20-C5-B: canonical event lifecycle, strong-identity scope and safe rebuild metadata.

ALTER TABLE "CustomerServiceConversationState"
  ADD COLUMN "sourceConversationIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "lastRebuiltAt" TIMESTAMP(3),
  ADD COLUMN "lastRebuildReason" VARCHAR(128) NOT NULL DEFAULT '';
