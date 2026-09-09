-- Service and dentist descriptions for the price list.
--
-- Purely additive: four nullable columns on existing tables, no drops and no
-- changes to existing data. Safe to apply to a database that already has the
-- treatment catalogue migration.
--
-- `custom_description` on the two dentist tables is what lets a clinic write
-- its own wording without ever touching the master catalogue text.

-- AlterTable
ALTER TABLE "catalogue_services" ADD COLUMN     "shortDescription" TEXT;

-- AlterTable
ALTER TABLE "service_variants" ADD COLUMN     "shortDescription" TEXT;

-- AlterTable
ALTER TABLE "dentist_service_prices" ADD COLUMN     "customDescription" TEXT;

-- AlterTable
ALTER TABLE "dentist_variant_prices" ADD COLUMN     "customDescription" TEXT;

