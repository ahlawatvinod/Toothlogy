-- AlterEnum
ALTER TYPE "VerificationSubject" ADD VALUE 'ORGANIZATION_CLAIM';

-- DropIndex
DROP INDEX "search_documents_title_trgm_idx";

-- AlterTable
ALTER TABLE "dentist_practices" ADD COLUMN     "acceptsEmergency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptsHomeVisit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptsVideo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoConfirm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bookingPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consultationFeeMinor" INTEGER,
ADD COLUMN     "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "minNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "slotMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "chairs" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "emergencyAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "facilities" TEXT[],
ADD COLUMN     "homeVisitRadiusKm" INTEGER,
ADD COLUMN     "parkingAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photoFileIds" TEXT[],
ADD COLUMN     "wheelchairAccessible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "service_offerings" ADD COLUMN     "aftercare" TEXT,
ADD COLUMN     "appointmentTypes" TEXT[],
ADD COLUMN     "dentistProfileId" TEXT,
ADD COLUMN     "preparation" TEXT,
ADD COLUMN     "priceMaxMinor" INTEGER,
ADD COLUMN     "requiresConsultation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxCategory" TEXT NOT NULL DEFAULT 'dental_services',
ADD COLUMN     "treatmentId" TEXT;

-- CreateTable
CREATE TABLE "treatments" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "specialtyKey" TEXT,
    "description" TEXT NOT NULL,
    "typicalDurationMinutes" INTEGER NOT NULL,
    "preparation" TEXT,
    "aftercare" TEXT,
    "eligibility" TEXT,
    "isEmergencyEligible" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_closures" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "actorKey" TEXT,
    "properties" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "treatments_key_key" ON "treatments"("key");

-- CreateIndex
CREATE INDEX "treatments_category_isActive_idx" ON "treatments"("category", "isActive");

-- CreateIndex
CREATE INDEX "location_closures_locationId_startsOn_endsOn_idx" ON "location_closures"("locationId", "startsOn", "endsOn");

-- CreateIndex
CREATE INDEX "analytics_events_name_occurredAt_idx" ON "analytics_events"("name", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_subjectType_subjectId_name_occurredAt_idx" ON "analytics_events"("subjectType", "subjectId", "name", "occurredAt");

-- CreateIndex
CREATE INDEX "service_offerings_treatmentId_isActive_idx" ON "service_offerings"("treatmentId", "isActive");

-- CreateIndex
CREATE INDEX "service_offerings_dentistProfileId_idx" ON "service_offerings"("dentistProfileId");

-- AddForeignKey
ALTER TABLE "location_closures" ADD CONSTRAINT "location_closures_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_offerings" ADD CONSTRAINT "service_offerings_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_offerings" ADD CONSTRAINT "service_offerings_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

