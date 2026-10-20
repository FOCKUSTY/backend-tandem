/*
  Warnings:

  - You are about to drop the column `locationAddress` on the `Record` table. All the data in the column will be lost.
  - You are about to drop the column `locationLat` on the `Record` table. All the data in the column will be lost.
  - You are about to drop the column `locationLng` on the `Record` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Record_userId_locationLat_idx";

-- AlterTable
ALTER TABLE "Record" DROP COLUMN "locationAddress",
DROP COLUMN "locationLat",
DROP COLUMN "locationLng";
