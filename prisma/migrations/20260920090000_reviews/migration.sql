-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "hiddenReason" TEXT,
    "flaggedAt" TIMESTAMP(3),
    "flagReason" TEXT,
    "flaggedByUserId" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_responses" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_appointmentId_key" ON "reviews"("appointmentId");

-- CreateIndex
CREATE INDEX "reviews_dentistProfileId_status_createdAt_idx" ON "reviews"("dentistProfileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_organizationId_status_createdAt_idx" ON "reviews"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_patientUserId_idx" ON "reviews"("patientUserId");

-- CreateIndex
CREATE INDEX "reviews_flaggedAt_idx" ON "reviews"("flaggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_responses_reviewId_key" ON "review_responses"("reviewId");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One to five stars, nothing else.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating" CHECK ("rating" BETWEEN 1 AND 5);
