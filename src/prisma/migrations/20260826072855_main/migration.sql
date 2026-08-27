/*
  Warnings:

  - A unique constraint covering the columns `[partnerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "partnerId" TEXT;

-- CreateIndex
CREATE INDEX "Record_userId_section_dateEvent_idx" ON "Record"("userId", "section", "dateEvent");

-- CreateIndex
CREATE INDEX "Record_userId_updatedAt_idx" ON "Record"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_partnerId_key" ON "User"("partnerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
