-- AlterTable: per-service booking rules
ALTER TABLE "Service" ADD COLUMN     "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Service" ADD COLUMN     "maxAdvanceDays" INTEGER;
ALTER TABLE "Service" ADD COLUMN     "slotIntervalMinutes" INTEGER;

-- CreateTable: date-specific hours override / closure
CREATE TABLE "SpecialDay" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT,
    "closeTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpecialDay_businessId_idx" ON "SpecialDay"("businessId");

-- CreateIndex
CREATE INDEX "SpecialDay_locationId_idx" ON "SpecialDay"("locationId");

-- AddForeignKey
ALTER TABLE "SpecialDay" ADD CONSTRAINT "SpecialDay_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialDay" ADD CONSTRAINT "SpecialDay_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
