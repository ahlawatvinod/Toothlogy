-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('JOB', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "JobRole" AS ENUM ('DENTIST', 'SPECIALIST', 'INTERN', 'ASSISTANT', 'HYGIENIST', 'TECHNICIAN', 'RECEPTIONIST', 'FACULTY', 'MANAGER', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'VISITING', 'LOCUM', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "JobPostingStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'FILLED');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "role" "JobRole" NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "specialtyKey" TEXT,
    "districtId" TEXT,
    "city" TEXT,
    "payMinMinor" INTEGER,
    "payMaxMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "openings" INTEGER NOT NULL DEFAULT 1,
    "closesAt" TIMESTAMP(3),
    "status" "JobPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "applicantUserId" TEXT NOT NULL,
    "resumeFileId" TEXT,
    "coverNote" TEXT,
    "contactConsentAt" TIMESTAMP(3) NOT NULL,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "interviewAt" TIMESTAMP(3),
    "messageToApplicant" TEXT,
    "employerNote" TEXT,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_postings_status_publishedAt_idx" ON "job_postings"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "job_postings_organizationId_status_idx" ON "job_postings"("organizationId", "status");

-- CreateIndex
CREATE INDEX "job_postings_districtId_status_idx" ON "job_postings"("districtId", "status");

-- CreateIndex
CREATE INDEX "job_applications_applicantUserId_createdAt_idx" ON "job_applications"("applicantUserId", "createdAt");

-- CreateIndex
CREATE INDEX "job_applications_postingId_status_idx" ON "job_applications"("postingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_postingId_applicantUserId_key" ON "job_applications"("postingId", "applicantUserId");

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "job_postings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_resumeFileId_fkey" FOREIGN KEY ("resumeFileId") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity the schema language cannot express.
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_pay_order" CHECK ("payMinMinor" IS NULL OR "payMaxMinor" IS NULL OR "payMinMinor" <= "payMaxMinor");
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_openings_range" CHECK ("openings" BETWEEN 1 AND 100);
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_open_is_published" CHECK ("status" <> 'OPEN' OR "publishedAt" IS NOT NULL);
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_internship_type" CHECK (("kind" = 'INTERNSHIP') = ("employmentType" = 'INTERNSHIP'));
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_withdrawal_dated" CHECK ("status" <> 'WITHDRAWN' OR "withdrawnAt" IS NOT NULL);
