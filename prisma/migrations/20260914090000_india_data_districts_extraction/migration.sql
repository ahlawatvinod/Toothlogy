-- CreateEnum
CREATE TYPE "ExtractionEntity" AS ENUM ('DENTIST', 'CLINIC', 'HOSPITAL', 'COLLEGE');

-- CreateEnum
CREATE TYPE "ExtractionBatchStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExtractedRecordStatus" AS ENUM ('NEW', 'DUPLICATE', 'REJECTED', 'ACCOUNT_CREATED', 'CLAIMED', 'ACTIVATED');

-- CreateEnum
CREATE TYPE "DataVerification" AS ENUM ('UNVERIFIED', 'VERIFIED');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'PENDING_ACTIVATION';

-- AlterTable
ALTER TABLE "cities" ADD COLUMN     "districtId" TEXT;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "districtId" TEXT;

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "lgdCode" TEXT,
    "aliases" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_batches" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT,
    "entityType" "ExtractionEntity" NOT NULL,
    "districtId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "status" "ExtractionBatchStatus" NOT NULL DEFAULT 'RECEIVED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "newRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "extraction_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_records" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "entityType" "ExtractionEntity" NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL,
    "original" JSONB NOT NULL,
    "normalized" JSONB NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "registrationNumber" TEXT,
    "districtId" TEXT,
    "confidence" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "duplicateOfId" TEXT,
    "status" "ExtractedRecordStatus" NOT NULL DEFAULT 'NEW',
    "verification" "DataVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "matchedUserId" TEXT,
    "matchedOrganizationId" TEXT,
    "premadeUserId" TEXT,
    "premadeOrganizationId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "claimedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extracted_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "districts_lgdCode_key" ON "districts"("lgdCode");

-- CreateIndex
CREATE INDEX "districts_countryCode_idx" ON "districts"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "districts_regionId_slug_key" ON "districts"("regionId", "slug");

-- CreateIndex
CREATE INDEX "extraction_batches_createdAt_idx" ON "extraction_batches"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "extracted_records_premadeUserId_key" ON "extracted_records"("premadeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "extracted_records_premadeOrganizationId_key" ON "extracted_records"("premadeOrganizationId");

-- CreateIndex
CREATE INDEX "extracted_records_dedupeKey_idx" ON "extracted_records"("dedupeKey");

-- CreateIndex
CREATE INDEX "extracted_records_districtId_status_idx" ON "extracted_records"("districtId", "status");

-- CreateIndex
CREATE INDEX "extracted_records_status_entityType_idx" ON "extracted_records"("status", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "extracted_records_batchId_rowNumber_key" ON "extracted_records"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "cities_districtId_idx" ON "cities"("districtId");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_batches" ADD CONSTRAINT "extraction_batches_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_records" ADD CONSTRAINT "extracted_records_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "extraction_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_records" ADD CONSTRAINT "extracted_records_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_records" ADD CONSTRAINT "extracted_records_premadeUserId_fkey" FOREIGN KEY ("premadeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_records" ADD CONSTRAINT "extracted_records_premadeOrganizationId_fkey" FOREIGN KEY ("premadeOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Confidence is a 0-100 score.
ALTER TABLE "extracted_records" ADD CONSTRAINT "extracted_records_confidence" CHECK ("confidence" BETWEEN 0 AND 100);
