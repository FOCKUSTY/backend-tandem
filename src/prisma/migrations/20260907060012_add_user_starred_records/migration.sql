-- CreateTable
CREATE TABLE "UserFavoritesRecords" (
    "userId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "UserFavoritesRecords_pkey" PRIMARY KEY ("userId","recordId")
);

-- AddForeignKey
ALTER TABLE "UserFavoritesRecords" ADD CONSTRAINT "UserFavoritesRecords_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavoritesRecords" ADD CONSTRAINT "UserFavoritesRecords_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
