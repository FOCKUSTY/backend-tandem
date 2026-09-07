-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurringInterval" TEXT;

-- CreateIndex
CREATE INDEX "Record_userId_dateEvent_idx" ON "Record"("userId", "dateEvent");

-- CreateIndex
CREATE INDEX "Record_userId_isRecurring_idx" ON "Record"("userId", "isRecurring");
