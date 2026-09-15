-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "isReport" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Record_userId_isReport_idx" ON "Record"("userId", "isReport");
