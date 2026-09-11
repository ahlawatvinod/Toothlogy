-- CreateEnum
CREATE TYPE "RecordEntryKind" AS ENUM ('TREATMENT', 'VISIT_NOTE', 'IMAGING', 'REPORT', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "RecordGrantStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'DECLINED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateTable
CREATE TABLE "record_entries" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "dependentId" TEXT,
    "kind" "RecordEntryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "teeth" INTEGER[],
    "occurredOn" DATE NOT NULL,
    "fileId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "appointmentId" TEXT,
    "retractedAt" TIMESTAMP(3),
    "retractedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "record_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_access_grants" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "RecordGrantStatus" NOT NULL,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "requestedByUserId" TEXT,
    "requestNote" TEXT,
    "consentId" TEXT,
    "grantedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "openKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "record_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "dependentId" TEXT,
    "organizationId" TEXT NOT NULL,
    "prescriberUserId" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "items" JSONB NOT NULL,
    "advice" TEXT,
    "verifyCode" TEXT NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ISSUED',
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "record_entries_fileId_key" ON "record_entries"("fileId");

-- CreateIndex
CREATE INDEX "record_entries_patientUserId_occurredOn_idx" ON "record_entries"("patientUserId", "occurredOn");

-- CreateIndex
CREATE INDEX "record_entries_organizationId_createdAt_idx" ON "record_entries"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "record_access_grants_consentId_key" ON "record_access_grants"("consentId");

-- CreateIndex
CREATE UNIQUE INDEX "record_access_grants_openKey_key" ON "record_access_grants"("openKey");

-- CreateIndex
CREATE INDEX "record_access_grants_patientUserId_status_idx" ON "record_access_grants"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "record_access_grants_organizationId_status_idx" ON "record_access_grants"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_verifyCode_key" ON "prescriptions"("verifyCode");

-- CreateIndex
CREATE INDEX "prescriptions_patientUserId_issuedAt_idx" ON "prescriptions"("patientUserId", "issuedAt");

-- CreateIndex
CREATE INDEX "prescriptions_organizationId_issuedAt_idx" ON "prescriptions"("organizationId", "issuedAt");

-- AddForeignKey
ALTER TABLE "record_entries" ADD CONSTRAINT "record_entries_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_entries" ADD CONSTRAINT "record_entries_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "dependents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_entries" ADD CONSTRAINT "record_entries_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_entries" ADD CONSTRAINT "record_entries_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_entries" ADD CONSTRAINT "record_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_entries" ADD CONSTRAINT "record_entries_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_access_grants" ADD CONSTRAINT "record_access_grants_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_access_grants" ADD CONSTRAINT "record_access_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_access_grants" ADD CONSTRAINT "record_access_grants_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "consents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "dependents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_prescriberUserId_fkey" FOREIGN KEY ("prescriberUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity the schema language cannot express.
ALTER TABLE "record_access_grants" ADD CONSTRAINT "record_access_grants_active_has_consent" CHECK ("status" <> 'ACTIVE' OR ("grantedAt" IS NOT NULL AND "consentId" IS NOT NULL));
ALTER TABLE "record_access_grants" ADD CONSTRAINT "record_access_grants_open_key_only_while_open" CHECK ("openKey" IS NULL OR "status" IN ('REQUESTED', 'ACTIVE'));
ALTER TABLE "record_entries" ADD CONSTRAINT "record_entries_retraction_has_reason" CHECK ("retractedAt" IS NULL OR "retractedReason" IS NOT NULL);
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_cancellation_has_reason" CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelledReason" IS NOT NULL));
