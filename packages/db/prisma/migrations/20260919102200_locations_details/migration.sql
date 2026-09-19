-- CreateEnum
CREATE TYPE "LocationMode" AS ENUM ('IN_PERSON', 'MOBILE', 'VIRTUAL');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "mode" "LocationMode" NOT NULL DEFAULT 'IN_PERSON';
