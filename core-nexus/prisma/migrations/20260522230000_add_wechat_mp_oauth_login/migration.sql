-- Allow service-account OAuth users to be created before they bind a phone number.
ALTER TABLE "AppUser" ALTER COLUMN "phone" DROP NOT NULL;
