-- Add optional media metadata for new private Tencent COS uploads.
-- Existing local/OSS rows remain unchanged and continue using their current URL/objectKey fields.
ALTER TABLE "UploadFile"
  ADD COLUMN "thumbnailObjectKey" TEXT,
  ADD COLUMN "thumbnailMimeType" VARCHAR(120),
  ADD COLUMN "thumbnailSize" INTEGER,
  ADD COLUMN "imageWidth" INTEGER,
  ADD COLUMN "imageHeight" INTEGER;
