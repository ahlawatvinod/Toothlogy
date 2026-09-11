-- CreateEnum
CREATE TYPE "EnrolmentStatus" AS ENUM ('ENROLLED', 'COMPLETED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "enrolments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "cycleId" TEXT,
    "studentUserId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "academicYear" TEXT NOT NULL,
    "rollNumber" TEXT,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "startedOn" DATE NOT NULL,
    "endedOn" DATE,
    "endedReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrolments_enquiryId_key" ON "enrolments"("enquiryId");

-- CreateIndex
CREATE INDEX "enrolments_organizationId_status_idx" ON "enrolments"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrolments_studentUserId_courseId_academicYear_key" ON "enrolments"("studentUserId", "courseId", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "enrolments_courseId_academicYear_rollNumber_key" ON "enrolments"("courseId", "academicYear", "rollNumber");

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "admission_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "admission_enquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity the schema language cannot express.
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_end_matches_status" CHECK (("status" = 'ENROLLED') = ("endedOn" IS NULL));
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_end_after_start" CHECK ("endedOn" IS NULL OR "endedOn" >= "startedOn");
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_academic_year_shape" CHECK ("academicYear" ~ '^[0-9]{4}-[0-9]{2}$');
