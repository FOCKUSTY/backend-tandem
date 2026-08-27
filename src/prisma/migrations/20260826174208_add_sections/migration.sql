/*
  Warnings:

  - You are about to drop the column `section` on the `Record` table. All the data in the column will be lost.
  - Added the required column `sectionId` to the `Record` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Record_userId_section_dateEvent_idx";

-- DropIndex
DROP INDEX "Record_userId_section_idx";

-- AlterTable
ALTER TABLE "Record" DROP COLUMN "section",
ADD COLUMN     "sectionId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Section_userId_slug_key" ON "Section"("userId", "slug");

-- CreateIndex
CREATE INDEX "Record_userId_sectionId_idx" ON "Record"("userId", "sectionId");

-- CreateIndex
CREATE INDEX "Record_userId_sectionId_dateEvent_idx" ON "Record"("userId", "sectionId", "dateEvent");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
