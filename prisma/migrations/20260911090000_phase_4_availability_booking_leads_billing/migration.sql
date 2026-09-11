-- Phase 4: availability, appointments, waitlist, leads, billing.
-- btree_gist lets one exclusion constraint combine equality on the dentist with range overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "AvailabilityExceptionKind" AS ENUM ('LEAVE', 'BLOCK');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('CLINIC', 'VIDEO', 'HOME_VISIT');

-- CreateEnum
CREATE TYPE "BookingMode" AS ENUM ('INSTANT', 'REQUEST');

-- CreateEnum
CREATE TYPE "AppointmentActor" AS ENUM ('PATIENT', 'PRACTICE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('SEARCH', 'PROFILE', 'CLINIC_PAGE', 'WAITLIST', 'REBOOK', 'FOLLOW_UP', 'PRACTICE');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('ACTIVE', 'OFFERED', 'BOOKED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimeOfDay" AS ENUM ('ANY', 'MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'NOT_QUALIFIED', 'DUPLICATE', 'DELIVERED', 'ACCEPTED', 'REJECTED', 'CONTACTED', 'APPOINTMENT', 'COMPLETED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('BOOKING', 'CALLBACK_REQUEST');

-- CreateEnum
CREATE TYPE "LeadBillingStatus" AS ENUM ('NOT_BILLABLE', 'PENDING_FUNDS', 'CHARGED', 'REFUNDED', 'WAIVED');

-- CreateEnum
CREATE TYPE "LedgerEntryKind" AS ENUM ('TOP_UP', 'LEAD_CHARGE', 'REFUND', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LeadDisputeReason" AS ENUM ('DUPLICATE', 'SPAM', 'WRONG_CONTACT', 'OUT_OF_AREA', 'NOT_A_PATIENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "observesPublicHolidays" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "appointmentTypes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "kind" "AvailabilityExceptionKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "dependentId" TEXT,
    "practiceId" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceOfferingId" TEXT,
    "serviceName" TEXT NOT NULL,
    "priceMinor" INTEGER,
    "priceMaxMinor" INTEGER,
    "currency" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "occupiedUntil" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "type" "AppointmentType" NOT NULL DEFAULT 'CLINIC',
    "mode" "BookingMode" NOT NULL,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "usesChair" BOOLEAN NOT NULL DEFAULT true,
    "status" "AppointmentStatus" NOT NULL,
    "source" "AppointmentSource" NOT NULL DEFAULT 'PROFILE',
    "patientNote" TEXT,
    "practiceNote" TEXT,
    "visitAddress" TEXT,
    "visitLatitude" DECIMAL(9,6),
    "visitLongitude" DECIMAL(9,6),
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "cancelledBy" "AppointmentActor",
    "expiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "reminderDayBeforeSentAt" TIMESTAMP(3),
    "reminderSoonSentAt" TIMESTAMP(3),
    "followUpSentAt" TIMESTAMP(3),
    "followUpDueAt" TIMESTAMP(3),
    "followUpNote" TEXT,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "waitlistEntryId" TEXT,
    "rebookedFromId" TEXT,
    "bookingMetadata" JSONB,
    "bookingKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_events" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "AppointmentStatus",
    "toStatus" "AppointmentStatus" NOT NULL,
    "actor" "AppointmentActor" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependents" (
    "id" TEXT NOT NULL,
    "guardianUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "birthYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "dependents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "dentistProfileId" TEXT,
    "locationId" TEXT,
    "serviceOfferingId" TEXT,
    "type" "AppointmentType" NOT NULL DEFAULT 'CLINIC',
    "earliestDate" DATE NOT NULL,
    "latestDate" DATE NOT NULL,
    "timeOfDay" "TimeOfDay" NOT NULL DEFAULT 'ANY',
    "status" "WaitlistStatus" NOT NULL DEFAULT 'ACTIVE',
    "offerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "dentistProfileId" TEXT,
    "serviceOfferingId" TEXT,
    "treatmentId" TEXT,
    "appointmentId" TEXT,
    "source" "LeadSource" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "patientCity" TEXT,
    "patientNote" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "duplicateOfId" TEXT,
    "qualificationRuleId" TEXT,
    "qualificationRuleVersion" INTEGER,
    "qualificationReason" TEXT,
    "qualifiedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "contactedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "billingStatus" "LeadBillingStatus" NOT NULL DEFAULT 'NOT_BILLABLE',
    "pricingRuleId" TEXT,
    "priceMinor" BIGINT,
    "taxMinor" BIGINT,
    "currency" TEXT,
    "chargeEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "LeadStatus",
    "toStatus" "LeadStatus" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_qualification_rules" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "version" INTEGER NOT NULL,
    "criteria" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_qualification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_pricing_rules" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "currency" TEXT NOT NULL,
    "leadSource" "LeadSource",
    "treatmentId" TEXT,
    "organizationId" TEXT,
    "dentistProfileId" TEXT,
    "campaign" TEXT,
    "priceMinor" BIGINT NOT NULL,
    "taxCategory" TEXT NOT NULL DEFAULT 'platform_fees',
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceMinor" BIGINT NOT NULL DEFAULT 0,
    "creditLimitMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "kind" "LedgerEntryKind" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "balanceAfterMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "netMinor" BIGINT,
    "taxMinor" BIGINT,
    "taxRateBasisPoints" INTEGER,
    "leadId" TEXT,
    "reversesEntryId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "externalReference" TEXT,
    "memo" TEXT,
    "actorUserId" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_disputes" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" "LeadDisputeReason" NOT NULL,
    "note" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "raisedByUserId" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "refundEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_rules_practiceId_dayOfWeek_idx" ON "availability_rules"("practiceId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "availability_exceptions_practiceId_startsAt_idx" ON "availability_exceptions"("practiceId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_waitlistEntryId_key" ON "appointments"("waitlistEntryId");

-- CreateIndex
CREATE INDEX "appointments_dentistProfileId_startsAt_idx" ON "appointments"("dentistProfileId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_locationId_startsAt_idx" ON "appointments"("locationId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_patientUserId_startsAt_idx" ON "appointments"("patientUserId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_organizationId_status_startsAt_idx" ON "appointments"("organizationId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_status_expiresAt_idx" ON "appointments"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "appointments_status_startsAt_idx" ON "appointments"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_patientUserId_bookingKey_key" ON "appointments"("patientUserId", "bookingKey");

-- CreateIndex
CREATE INDEX "appointment_events_appointmentId_createdAt_idx" ON "appointment_events"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "dependents_guardianUserId_idx" ON "dependents"("guardianUserId");

-- CreateIndex
CREATE INDEX "waitlist_entries_status_dentistProfileId_idx" ON "waitlist_entries"("status", "dentistProfileId");

-- CreateIndex
CREATE INDEX "waitlist_entries_status_locationId_idx" ON "waitlist_entries"("status", "locationId");

-- CreateIndex
CREATE INDEX "waitlist_entries_patientUserId_status_idx" ON "waitlist_entries"("patientUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leads_appointmentId_key" ON "leads"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_chargeEntryId_key" ON "leads"("chargeEntryId");

-- CreateIndex
CREATE INDEX "leads_organizationId_status_createdAt_idx" ON "leads"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "leads_dedupeKey_createdAt_idx" ON "leads"("dedupeKey", "createdAt");

-- CreateIndex
CREATE INDEX "leads_patientUserId_idx" ON "leads"("patientUserId");

-- CreateIndex
CREATE INDEX "leads_billingStatus_idx" ON "leads"("billingStatus");

-- CreateIndex
CREATE INDEX "lead_events_leadId_createdAt_idx" ON "lead_events"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lead_qualification_rules_countryCode_version_key" ON "lead_qualification_rules"("countryCode", "version");

-- CreateIndex
CREATE INDEX "lead_pricing_rules_countryCode_isActive_idx" ON "lead_pricing_rules"("countryCode", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_organizationId_key" ON "wallets"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reversesEntryId_key" ON "ledger_entries"("reversesEntryId");

-- CreateIndex
CREATE INDEX "ledger_entries_walletId_createdAt_idx" ON "ledger_entries"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_leadId_idx" ON "ledger_entries"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_walletId_idempotencyKey_key" ON "ledger_entries"("walletId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_walletId_periodStart_periodEnd_key" ON "invoices"("walletId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "lead_disputes_leadId_key" ON "lead_disputes"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "lead_disputes_refundEntryId_key" ON "lead_disputes"("refundEntryId");

-- CreateIndex
CREATE INDEX "lead_disputes_status_createdAt_idx" ON "lead_disputes"("status", "createdAt");

-- CreateIndex
CREATE INDEX "lead_disputes_organizationId_idx" ON "lead_disputes"("organizationId");

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "dentist_practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "dentist_practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "dependents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "dentist_practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceOfferingId_fkey" FOREIGN KEY ("serviceOfferingId") REFERENCES "service_offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_waitlistEntryId_fkey" FOREIGN KEY ("waitlistEntryId") REFERENCES "waitlist_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_guardianUserId_fkey" FOREIGN KEY ("guardianUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "dentist_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_serviceOfferingId_fkey" FOREIGN KEY ("serviceOfferingId") REFERENCES "service_offerings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_disputes" ADD CONSTRAINT "lead_disputes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Guarantees Prisma cannot express
-- ---------------------------------------------------------------------------

-- No double booking, whatever the application does: two active appointments
-- of one dentist may not overlap in [startsAt, occupiedUntil).
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_dentist_overlap"
  EXCLUDE USING gist ("dentistProfileId" WITH =, tsrange("startsAt", "occupiedUntil") WITH &&)
  WHERE ("status" IN ('REQUESTED', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_time_order"
  CHECK ("endsAt" > "startsAt" AND "occupiedUntil" >= "endsAt");

ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_valid"
  CHECK ("dayOfWeek" BETWEEN 0 AND 6 AND "startMinutes" >= 0 AND "endMinutes" <= 1440 AND "endMinutes" > "startMinutes");

ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_order"
  CHECK ("endsAt" > "startsAt");

-- A wallet can never go below its credit limit (0 by default: never negative).
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_floor"
  CHECK ("balanceMinor" >= -"creditLimitMinor" AND "creditLimitMinor" >= 0);

ALTER TABLE "lead_pricing_rules" ADD CONSTRAINT "lead_pricing_rules_price"
  CHECK ("priceMinor" >= 0);

-- The ledger is append-only: a correction is a new entry. Only the invoice
-- link may be set after the fact.
CREATE OR REPLACE FUNCTION "ledger_entries_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger entries are append-only';
  END IF;
  IF (NEW."id", NEW."walletId", NEW."kind", NEW."amountMinor", NEW."balanceAfterMinor", NEW."currency",
      NEW."netMinor", NEW."taxMinor", NEW."leadId", NEW."reversesEntryId", NEW."idempotencyKey", NEW."createdAt")
     IS DISTINCT FROM
     (OLD."id", OLD."walletId", OLD."kind", OLD."amountMinor", OLD."balanceAfterMinor", OLD."currency",
      OLD."netMinor", OLD."taxMinor", OLD."leadId", OLD."reversesEntryId", OLD."idempotencyKey", OLD."createdAt") THEN
    RAISE EXCEPTION 'ledger entries are append-only';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "ledger_entries_append_only"();
