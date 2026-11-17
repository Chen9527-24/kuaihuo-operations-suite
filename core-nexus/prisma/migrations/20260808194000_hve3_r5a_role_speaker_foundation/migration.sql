ALTER TABLE "CustomerServiceRolePrototype"
ADD COLUMN "speakerProfile" JSONB;

ALTER TABLE "CustomerServiceMerchantRole"
ADD COLUMN "publicRelation" TEXT;
