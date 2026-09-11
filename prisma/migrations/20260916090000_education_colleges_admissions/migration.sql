-- CreateEnum
CREATE TYPE "CollegeOwnership" AS ENUM ('GOVERNMENT', 'PRIVATE', 'DEEMED_UNIVERSITY', 'AUTONOMOUS');

-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('BDS', 'MDS', 'DIPLOMA', 'CERTIFICATE', 'FELLOWSHIP', 'PHD');

-- CreateEnum
CREATE TYPE "EntranceExam" AS ENUM ('NEET_UG', 'NEET_MDS', 'INI_CET', 'INSTITUTIONAL', 'NONE');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AdmissionEnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'APPLIED', 'ADMITTED', 'NOT_ADMITTED', 'WITHDRAWN', 'LOST');

-- CreateTable
CREATE TABLE "college_profiles" (
    "organizationId" TEXT NOT NULL,
    "ownership" "CollegeOwnership",
    "affiliatedUniversity" TEXT,
    "establishedYear" INTEGER,
    "recognitionBody" TEXT,
    "recognitionReference" TEXT,
    "recognitionVerifiedAt" TIMESTAMP(3),
    "recognitionVerifiedByUserId" TEXT,
    "admissionsEmail" TEXT,
    "admissionsPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "college_profiles_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "level" "CourseLevel" NOT NULL,
    "specialtyKey" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "seats" INTEGER,
    "annualFeeMinor" BIGINT,
    "currency" TEXT,
    "entranceExam" "EntranceExam" NOT NULL,
    "description" TEXT,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_cycles" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "opensOn" DATE NOT NULL,
    "closesOn" DATE NOT NULL,
    "seats" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_enquiries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "cycleId" TEXT,
    "studentUserId" TEXT NOT NULL,
    "status" "AdmissionEnquiryStatus" NOT NULL DEFAULT 'NEW',
    "message" TEXT,
    "qualification" TEXT,
    "examName" "EntranceExam",
    "examRank" INTEGER,
    "consentToContact" BOOLEAN NOT NULL,
    "openKey" TEXT,
    "assignedToUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_enquiry_events" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "AdmissionEnquiryStatus",
    "toStatus" "AdmissionEnquiryStatus" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_enquiry_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_level_status_idx" ON "courses"("level", "status");

-- CreateIndex
CREATE UNIQUE INDEX "courses_organizationId_slug_key" ON "courses"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "admission_cycles_courseId_academicYear_key" ON "admission_cycles"("courseId", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "admission_enquiries_openKey_key" ON "admission_enquiries"("openKey");

-- CreateIndex
CREATE INDEX "admission_enquiries_organizationId_status_createdAt_idx" ON "admission_enquiries"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "admission_enquiries_studentUserId_idx" ON "admission_enquiries"("studentUserId");

-- CreateIndex
CREATE INDEX "admission_enquiries_courseId_idx" ON "admission_enquiries"("courseId");

-- CreateIndex
CREATE INDEX "admission_enquiry_events_enquiryId_createdAt_idx" ON "admission_enquiry_events"("enquiryId", "createdAt");

-- AddForeignKey
ALTER TABLE "college_profiles" ADD CONSTRAINT "college_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "admission_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_enquiry_events" ADD CONSTRAINT "admission_enquiry_events_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "admission_enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Stated numbers are real quantities.
ALTER TABLE "courses" ADD CONSTRAINT "courses_positive" CHECK ("durationMonths" > 0 AND ("seats" IS NULL OR "seats" > 0) AND ("annualFeeMinor" IS NULL OR "annualFeeMinor" >= 0));
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_window" CHECK ("closesOn" >= "opensOn");
