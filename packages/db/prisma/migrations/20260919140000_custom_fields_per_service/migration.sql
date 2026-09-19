-- AlterTable: scope a custom field to one service (null = every service) and
-- allow an optional placeholder.
ALTER TABLE "CustomField" ADD COLUMN     "serviceId" TEXT;
ALTER TABLE "CustomField" ADD COLUMN     "placeholder" TEXT;

-- CreateIndex
CREATE INDEX "CustomField_serviceId_idx" ON "CustomField"("serviceId");

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
