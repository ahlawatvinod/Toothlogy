-- CreateEnum
CREATE TYPE "DentistGender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationSubject" AS ENUM ('DENTIST', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED');

-- DropIndex
DROP INDEX "search_documents_title_trgm_idx";

-- DropIndex
DROP INDEX "search_documents_vector_idx";

-- CreateTable
CREATE TABLE "dentist_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "practisingSince" INTEGER,
    "languages" TEXT[],
    "consultationFeeMinor" INTEGER,
    "consultationCurrency" TEXT,
    "gender" "DentistGender",
    "status" "ProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verificationExpiresAt" TIMESTAMP(3),
    "isDiscoverable" BOOLEAN NOT NULL DEFAULT false,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "dentist_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualifications" (
    "id" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "registrationNumber" TEXT,
    "registrationBody" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "documentFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentist_specialties" (
    "id" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dentist_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentist_practices" (
    "id" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dentist_practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" TEXT NOT NULL,
    "subjectType" "VerificationSubject" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "dentistProfileId" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedEvidence" JSONB,
    "submittedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "reviewerNotes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_offerings" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinor" INTEGER,
    "currency" TEXT,
    "durationMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dentist_profiles_userId_key" ON "dentist_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "dentist_profiles_slug_key" ON "dentist_profiles"("slug");

-- CreateIndex
CREATE INDEX "dentist_profiles_status_isDiscoverable_idx" ON "dentist_profiles"("status", "isDiscoverable");

-- CreateIndex
CREATE INDEX "dentist_profiles_isVerified_idx" ON "dentist_profiles"("isVerified");

-- CreateIndex
CREATE INDEX "qualifications_dentistProfileId_idx" ON "qualifications"("dentistProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_key_key" ON "specialties"("key");

-- CreateIndex
CREATE UNIQUE INDEX "dentist_specialties_dentistProfileId_specialtyId_key" ON "dentist_specialties"("dentistProfileId", "specialtyId");

-- CreateIndex
CREATE INDEX "dentist_practices_locationId_isConfirmed_idx" ON "dentist_practices"("locationId", "isConfirmed");

-- CreateIndex
CREATE UNIQUE INDEX "dentist_practices_dentistProfileId_locationId_key" ON "dentist_practices"("dentistProfileId", "locationId");

-- CreateIndex
CREATE INDEX "verification_requests_subjectType_subjectId_status_idx" ON "verification_requests"("subjectType", "subjectId", "status");

-- CreateIndex
CREATE INDEX "verification_requests_status_submittedAt_idx" ON "verification_requests"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "service_offerings_locationId_isActive_idx" ON "service_offerings"("locationId", "isActive");

-- AddForeignKey
ALTER TABLE "dentist_profiles" ADD CONSTRAINT "dentist_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_specialties" ADD CONSTRAINT "dentist_specialties_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_specialties" ADD CONSTRAINT "dentist_specialties_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist_practices" ADD CONSTRAINT "dentist_practices_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
