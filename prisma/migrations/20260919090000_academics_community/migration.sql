-- CreateEnum
CREATE TYPE "FacultyAppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'ENDED');

-- CreateEnum
CREATE TYPE "CommunityPostStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "CommunityTarget" AS ENUM ('QUESTION', 'ANSWER');

-- CreateEnum
CREATE TYPE "CommunityReportReason" AS ENUM ('SPAM', 'ABUSE', 'MISINFORMATION', 'PRIVACY', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'UPHELD', 'DISMISSED');

-- AlterEnum
ALTER TYPE "ProfileType" ADD VALUE 'FACULTY';

-- CreateTable
CREATE TABLE "academic_profiles" (
    "profileId" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "institution" TEXT,
    "orcid" TEXT,
    "interests" TEXT[],
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_profiles_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "venue" TEXT,
    "year" INTEGER NOT NULL,
    "doi" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_appointments" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "department" TEXT,
    "status" "FacultyAppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "faculty_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_questions" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunityPostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "hiddenReason" TEXT,
    "acceptedAnswerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_answers" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunityPostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "hiddenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_reports" (
    "id" TEXT NOT NULL,
    "targetType" "CommunityTarget" NOT NULL,
    "questionId" TEXT,
    "answerId" TEXT,
    "reporterUserId" TEXT NOT NULL,
    "reason" "CommunityReportReason" NOT NULL,
    "note" TEXT,
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publications_profileId_year_idx" ON "publications"("profileId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "publications_profileId_doi_key" ON "publications"("profileId", "doi");

-- CreateIndex
CREATE INDEX "faculty_appointments_organizationId_status_idx" ON "faculty_appointments"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_appointments_profileId_organizationId_key" ON "faculty_appointments"("profileId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "community_questions_acceptedAnswerId_key" ON "community_questions"("acceptedAnswerId");

-- CreateIndex
CREATE INDEX "community_questions_status_topic_createdAt_idx" ON "community_questions"("status", "topic", "createdAt");

-- CreateIndex
CREATE INDEX "community_questions_authorUserId_idx" ON "community_questions"("authorUserId");

-- CreateIndex
CREATE INDEX "community_answers_questionId_status_createdAt_idx" ON "community_answers"("questionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "community_answers_authorUserId_idx" ON "community_answers"("authorUserId");

-- CreateIndex
CREATE INDEX "community_reports_status_createdAt_idx" ON "community_reports"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "community_reports_questionId_reporterUserId_key" ON "community_reports"("questionId", "reporterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "community_reports_answerId_reporterUserId_key" ON "community_reports"("answerId", "reporterUserId");

-- AddForeignKey
ALTER TABLE "academic_profiles" ADD CONSTRAINT "academic_profiles_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_appointments" ADD CONSTRAINT "faculty_appointments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_appointments" ADD CONSTRAINT "faculty_appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_questions" ADD CONSTRAINT "community_questions_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_questions" ADD CONSTRAINT "community_questions_acceptedAnswerId_fkey" FOREIGN KEY ("acceptedAnswerId") REFERENCES "community_answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_answers" ADD CONSTRAINT "community_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "community_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_answers" ADD CONSTRAINT "community_answers_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "community_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "community_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A report names exactly one post, of the type it says.
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_one_target" CHECK (("targetType" = 'QUESTION' AND "questionId" IS NOT NULL AND "answerId" IS NULL) OR ("targetType" = 'ANSWER' AND "answerId" IS NOT NULL AND "questionId" IS NULL));
ALTER TABLE "publications" ADD CONSTRAINT "publications_year" CHECK ("year" BETWEEN 1900 AND 2100);
