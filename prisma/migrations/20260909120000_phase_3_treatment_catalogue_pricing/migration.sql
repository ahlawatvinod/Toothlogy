-- Phase 3 — treatment catalogue and dentist pricing (Division 05, Clinics).
--
-- Purely additive: eleven new tables and one new enum. It creates no column on
-- an existing table and drops nothing, so it cannot affect data already in the
-- database and is safe to apply to a live Phase 3 install.
--
-- `service_offerings` is deliberately left in place and untouched. It is the
-- earlier free-text placeholder for this feature, has no code referencing it,
-- and removing it belongs in its own migration once anything that might have
-- written to it has been confirmed gone.
--
-- Generated with `prisma migrate diff` from the previous committed schema, so
-- it matches the Prisma models exactly rather than being transcribed by hand.

-- CreateEnum
CREATE TYPE "CatalogueStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "patientDescription" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_services" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "patientDescription" TEXT,
    "defaultUnitId" TEXT,
    "suggestedMinMinor" BIGINT,
    "suggestedMaxMinor" BIGINT,
    "suggestedCurrency" TEXT,
    "suggestedIsOpenEnded" BOOLEAN NOT NULL DEFAULT false,
    "isCustomQuote" BOOLEAN NOT NULL DEFAULT false,
    "isPackage" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "catalogue_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_category_links" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_category_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_variants" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "suggestedMinMinor" BIGINT,
    "suggestedMaxMinor" BIGINT,
    "suggestedCurrency" TEXT,
    "suggestedIsOpenEnded" BOOLEAN NOT NULL DEFAULT false,
    "isCustomQuote" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "service_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_synonyms" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,

    CONSTRAINT "service_synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_units" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentist_service_prices" (
    "id" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "locationId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isPublicVisible" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "dentist_service_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentist_variant_prices" (
    "id" TEXT NOT NULL,
    "dentistServicePriceId" TEXT NOT NULL,
    "variantId" TEXT,
    "variantKey" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "minMinor" BIGINT,
    "maxMinor" BIGINT,
    "actualMinor" BIGINT,
    "discountedMinor" BIGINT,
    "packageMinor" BIGINT,
    "additionalMinor" BIGINT,
    "currency" TEXT NOT NULL,
    "isCustomQuote" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentist_variant_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentist_packages" (
    "id" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "terms" TEXT,
    "priceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "componentTotalMinor" BIGINT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" "CatalogueStatus" NOT NULL DEFAULT 'DRAFT',
    "isPublicVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "dentist_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_items" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isIncluded" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "dentistServicePriceId" TEXT NOT NULL,
    "dentistVariantPriceId" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "previousMinor" BIGINT,
    "newMinor" BIGINT,
    "currency" TEXT,
    "previousText" TEXT,
    "newText" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_slug_key" ON "service_categories"("slug");

-- CreateIndex
CREATE INDEX "service_categories_status_sortOrder_idx" ON "service_categories"("status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_services_slug_key" ON "catalogue_services"("slug");

-- CreateIndex
CREATE INDEX "catalogue_services_categoryId_status_sortOrder_idx" ON "catalogue_services"("categoryId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "catalogue_services_status_idx" ON "catalogue_services"("status");

-- CreateIndex
CREATE INDEX "service_category_links_categoryId_idx" ON "service_category_links"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "service_category_links_serviceId_categoryId_key" ON "service_category_links"("serviceId", "categoryId");

-- CreateIndex
CREATE INDEX "service_variants_serviceId_status_sortOrder_idx" ON "service_variants"("serviceId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "service_variants_serviceId_slug_key" ON "service_variants"("serviceId", "slug");

-- CreateIndex
CREATE INDEX "service_synonyms_normalized_idx" ON "service_synonyms"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "service_synonyms_serviceId_normalized_key" ON "service_synonyms"("serviceId", "normalized");

-- CreateIndex
CREATE UNIQUE INDEX "price_units_key_key" ON "price_units"("key");

-- CreateIndex
CREATE INDEX "price_units_status_sortOrder_idx" ON "price_units"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "dentist_service_prices_dentistProfileId_isEnabled_idx" ON "dentist_service_prices"("dentistProfileId", "isEnabled");

-- CreateIndex
CREATE INDEX "dentist_service_prices_locationId_isEnabled_idx" ON "dentist_service_prices"("locationId", "isEnabled");

-- CreateIndex
CREATE INDEX "dentist_service_prices_serviceId_idx" ON "dentist_service_prices"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "dentist_service_prices_dentistProfileId_serviceId_scopeKey_key" ON "dentist_service_prices"("dentistProfileId", "serviceId", "scopeKey");

-- CreateIndex
CREATE INDEX "dentist_variant_prices_variantId_idx" ON "dentist_variant_prices"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "dentist_variant_prices_dentistServicePriceId_variantKey_key" ON "dentist_variant_prices"("dentistServicePriceId", "variantKey");

-- CreateIndex
CREATE INDEX "dentist_packages_dentistProfileId_status_idx" ON "dentist_packages"("dentistProfileId", "status");

-- CreateIndex
CREATE INDEX "dentist_packages_locationId_status_idx" ON "dentist_packages"("locationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dentist_packages_dentistProfileId_slug_key" ON "dentist_packages"("dentistProfileId", "slug");

-- CreateIndex
CREATE INDEX "package_items_packageId_sortOrder_idx" ON "package_items"("packageId", "sortOrder");

-- CreateIndex
CREATE INDEX "package_items_serviceId_idx" ON "package_items"("serviceId");

-- CreateIndex
CREATE INDEX "price_history_dentistServicePriceId_changedAt_idx" ON "price_history"("dentistServicePriceId", "changedAt");

-- CreateIndex
CREATE INDEX "price_history_dentistVariantPriceId_changedAt_idx" ON "price_history"("dentistVariantPriceId", "changedAt");

-- AddForeignKey
ALTER TABLE "catalogue_services" ADD CONSTRAINT "catalogue_services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_services" ADD CONSTRAINT "catalogue_services_defaultUnitId_fkey" FOREIGN KEY ("defaultUnitId") REFERENCES "price_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_category_links" ADD CONSTRAINT "service_category_links_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catalogue_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_category_links" ADD CONSTRAINT "service_category_links_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catalogue_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_synonyms" ADD CONSTRAINT "service_synonyms_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catalogue_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_service_prices" ADD CONSTRAINT "dentist_service_prices_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_service_prices" ADD CONSTRAINT "dentist_service_prices_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catalogue_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_service_prices" ADD CONSTRAINT "dentist_service_prices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_variant_prices" ADD CONSTRAINT "dentist_variant_prices_dentistServicePriceId_fkey" FOREIGN KEY ("dentistServicePriceId") REFERENCES "dentist_service_prices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_variant_prices" ADD CONSTRAINT "dentist_variant_prices_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "service_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_variant_prices" ADD CONSTRAINT "dentist_variant_prices_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "price_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_packages" ADD CONSTRAINT "dentist_packages_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_packages" ADD CONSTRAINT "dentist_packages_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "dentist_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catalogue_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "service_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_dentistServicePriceId_fkey" FOREIGN KEY ("dentistServicePriceId") REFERENCES "dentist_service_prices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_dentistVariantPriceId_fkey" FOREIGN KEY ("dentistVariantPriceId") REFERENCES "dentist_variant_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

