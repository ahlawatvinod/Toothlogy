-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('GOOD', 'SERVICE');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('NEW', 'QUOTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrganizationType" ADD VALUE 'WHOLESALER';
ALTER TYPE "OrganizationType" ADD VALUE 'RETAILER';
ALTER TYPE "OrganizationType" ADD VALUE 'LABORATORY';

-- CreateTable
CREATE TABLE "business_profiles" (
    "organizationId" TEXT NOT NULL,
    "categories" TEXT[],
    "brands" TEXT[],
    "gstin" TEXT,
    "establishedYear" INTEGER,
    "deliveryNote" TEXT,
    "minimumOrderNote" TEXT,
    "turnaroundDays" INTEGER,
    "servesAllIndia" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "business_service_areas" (
    "organizationId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,

    CONSTRAINT "business_service_areas_pkey" PRIMARY KEY ("organizationId","districtId")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "unit" TEXT,
    "priceMinor" BIGINT,
    "currency" TEXT,
    "gstRatePercent" INTEGER,
    "minOrderQuantity" INTEGER NOT NULL DEFAULT 1,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_requests" (
    "id" TEXT NOT NULL,
    "sellerOrganizationId" TEXT NOT NULL,
    "productId" TEXT,
    "buyerUserId" TEXT NOT NULL,
    "buyerOrganizationId" TEXT,
    "quantity" INTEGER NOT NULL,
    "message" TEXT,
    "deliveryDistrictId" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'NEW',
    "openKey" TEXT,
    "quotedPriceMinor" BIGINT,
    "currency" TEXT,
    "validUntil" TIMESTAMP(3),
    "sellerNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_events" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "QuoteStatus",
    "toStatus" "QuoteStatus" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_service_areas_districtId_idx" ON "business_service_areas"("districtId");

-- CreateIndex
CREATE INDEX "products_category_status_idx" ON "products"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_organizationId_slug_key" ON "products"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "quote_requests_openKey_key" ON "quote_requests"("openKey");

-- CreateIndex
CREATE INDEX "quote_requests_sellerOrganizationId_status_createdAt_idx" ON "quote_requests"("sellerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "quote_requests_buyerUserId_idx" ON "quote_requests"("buyerUserId");

-- CreateIndex
CREATE INDEX "quote_requests_status_validUntil_idx" ON "quote_requests"("status", "validUntil");

-- CreateIndex
CREATE INDEX "quote_events_quoteRequestId_createdAt_idx" ON "quote_events"("quoteRequestId", "createdAt");

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_service_areas" ADD CONSTRAINT "business_service_areas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "business_profiles"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_service_areas" ADD CONSTRAINT "business_service_areas_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_deliveryDistrictId_fkey" FOREIGN KEY ("deliveryDistrictId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_events" ADD CONSTRAINT "quote_events_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Stated numbers are real quantities and rates.
ALTER TABLE "products" ADD CONSTRAINT "products_numbers" CHECK ("minOrderQuantity" > 0 AND ("priceMinor" IS NULL OR "priceMinor" >= 0) AND ("gstRatePercent" IS NULL OR "gstRatePercent" IN (0, 5, 12, 18, 28)));
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_numbers" CHECK ("quantity" > 0 AND ("quotedPriceMinor" IS NULL OR "quotedPriceMinor" >= 0));
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_turnaround" CHECK ("turnaroundDays" IS NULL OR "turnaroundDays" BETWEEN 1 AND 90);
