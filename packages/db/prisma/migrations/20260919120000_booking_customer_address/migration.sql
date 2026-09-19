-- AlterTable: capture the customer's own address for mobile ("we come to you") bookings
ALTER TABLE "Booking" ADD COLUMN     "customerAddress" TEXT;

-- CreateIndex: speed up per-location booking queries
CREATE INDEX "Booking_businessId_locationId_idx" ON "Booking"("businessId", "locationId");
