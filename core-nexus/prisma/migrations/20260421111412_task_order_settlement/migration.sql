-- AlterTable
ALTER TABLE "TaskParticipant" ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "settledById" TEXT,
ADD COLUMN     "settlementAmount" INTEGER,
ADD COLUMN     "settlementProofFileId" TEXT,
ADD COLUMN     "settlementProofUrl" TEXT,
ADD COLUMN     "settlementRemark" TEXT,
ADD COLUMN     "settlementStatus" VARCHAR(32) NOT NULL DEFAULT 'UNSETTLED',
ADD COLUMN     "uploadedImageFileId" TEXT,
ADD COLUMN     "uploadedImageUrl" TEXT;

-- CreateIndex
CREATE INDEX "TaskParticipant_phone_idx" ON "TaskParticipant"("phone");

-- CreateIndex
CREATE INDEX "TaskParticipant_settlementStatus_idx" ON "TaskParticipant"("settlementStatus");

-- CreateIndex
CREATE INDEX "TaskParticipant_settledAt_idx" ON "TaskParticipant"("settledAt");

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
