-- AlterTable
ALTER TABLE "Record" ADD COLUMN     "locationAddress" TEXT,
ADD COLUMN     "locationLat" DOUBLE PRECISION,
ADD COLUMN     "locationLng" DOUBLE PRECISION,
ADD COLUMN     "locationName" TEXT;

-- CreateIndex
CREATE INDEX "Record_userId_locationLat_idx" ON "Record"("userId", "locationLat");
