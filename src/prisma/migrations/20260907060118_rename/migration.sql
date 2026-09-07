/*
  Warnings:

  - You are about to drop the `UserFavoritesRecords` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserFavoritesRecords" DROP CONSTRAINT "UserFavoritesRecords_recordId_fkey";

-- DropForeignKey
ALTER TABLE "UserFavoritesRecords" DROP CONSTRAINT "UserFavoritesRecords_userId_fkey";

-- DropTable
DROP TABLE "UserFavoritesRecords";

-- CreateTable
CREATE TABLE "UserFavoritesRecord" (
    "userId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "UserFavoritesRecord_pkey" PRIMARY KEY ("userId","recordId")
);

-- AddForeignKey
ALTER TABLE "UserFavoritesRecord" ADD CONSTRAINT "UserFavoritesRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavoritesRecord" ADD CONSTRAINT "UserFavoritesRecord_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
