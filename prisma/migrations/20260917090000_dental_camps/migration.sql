-- CreateEnum
CREATE TYPE "CampStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CampDoctorStatus" AS ENUM ('APPLIED', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CampRegistrationSource" AS ENUM ('SELF', 'WALK_IN');

-- CreateEnum
CREATE TYPE "CampRegistrationStatus" AS ENUM ('REGISTERED', 'ATTENDED', 'NO_SHOW', 'CANCELLED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "campRegistrationId" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "campRegistrationId" TEXT;

-- CreateTable
CREATE TABLE "camps" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "services" TEXT,
    "districtId" TEXT NOT NULL,
    "organizerUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "venueName" TEXT NOT NULL,
    "venueAddress" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "capacity" INTEGER,
    "status" "CampStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_doctors" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "status" "CampDoctorStatus" NOT NULL DEFAULT 'APPLIED',
    "message" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decisionNote" TEXT,
    "attended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "camp_doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_registrations" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "patientUserId" TEXT,
    "source" "CampRegistrationSource" NOT NULL,
    "registeredByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "age" INTEGER,
    "concern" TEXT,
    "consentToShare" BOOLEAN NOT NULL,
    "status" "CampRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "checkedInAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "seenByDentistProfileId" TEXT,
    "findings" TEXT,
    "needsFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "referredDentistProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camp_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "camps_slug_key" ON "camps"("slug");

-- CreateIndex
CREATE INDEX "camps_districtId_status_startsAt_idx" ON "camps"("districtId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "camps_organizerUserId_idx" ON "camps"("organizerUserId");

-- CreateIndex
CREATE INDEX "camp_doctors_dentistProfileId_idx" ON "camp_doctors"("dentistProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "camp_doctors_campId_dentistProfileId_key" ON "camp_doctors"("campId", "dentistProfileId");

-- CreateIndex
CREATE INDEX "camp_registrations_patientUserId_idx" ON "camp_registrations"("patientUserId");

-- CreateIndex
CREATE INDEX "camp_registrations_referredDentistProfileId_idx" ON "camp_registrations"("referredDentistProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "camp_registrations_campId_phone_key" ON "camp_registrations"("campId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "camp_registrations_campId_patientUserId_key" ON "camp_registrations"("campId", "patientUserId");

-- CreateIndex
CREATE INDEX "leads_campRegistrationId_idx" ON "leads"("campRegistrationId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_campRegistrationId_fkey" FOREIGN KEY ("campRegistrationId") REFERENCES "camp_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campRegistrationId_fkey" FOREIGN KEY ("campRegistrationId") REFERENCES "camp_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_doctors" ADD CONSTRAINT "camp_doctors_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_doctors" ADD CONSTRAINT "camp_doctors_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_registrations" ADD CONSTRAINT "camp_registrations_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_registrations" ADD CONSTRAINT "camp_registrations_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_registrations" ADD CONSTRAINT "camp_registrations_seenByDentistProfileId_fkey" FOREIGN KEY ("seenByDentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_registrations" ADD CONSTRAINT "camp_registrations_referredDentistProfileId_fkey" FOREIGN KEY ("referredDentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A camp ends after it starts; stated numbers are real.
ALTER TABLE "camps" ADD CONSTRAINT "camps_window" CHECK ("endsAt" > "startsAt" AND ("capacity" IS NULL OR "capacity" > 0));
ALTER TABLE "camp_registrations" ADD CONSTRAINT "camp_registrations_age" CHECK ("age" IS NULL OR "age" BETWEEN 0 AND 120);
