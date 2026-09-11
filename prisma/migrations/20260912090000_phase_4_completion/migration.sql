-- Phase 4 completion: tiered lead pricing, recharge minimums, idempotent
-- reminders, video-meeting records, globally unique credit keys.

-- ---------------------------------------------------------------------------
-- Tiered lead pricing
-- ---------------------------------------------------------------------------
ALTER TABLE "lead_pricing_rules"
  ADD COLUMN "freeLeadAllowance"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "minimumRechargeLeads" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lowBalanceLeads"      INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "lead_pricing_rules"
  ADD CONSTRAINT "lead_pricing_rules_tiers"
  CHECK ("freeLeadAllowance" >= 0 AND "minimumRechargeLeads" >= 0 AND "lowBalanceLeads" >= 0);

ALTER TYPE "LeadBillingStatus" ADD VALUE 'FREE';

ALTER TABLE "leads"
  ADD COLUMN "billingOrdinal" INTEGER,
  ADD COLUMN "billedAt"       TIMESTAMP(3);

-- Leads already billed keep their place in the count, oldest first, so the
-- free allowance continues from where each organization actually is.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (PARTITION BY "organizationId" ORDER BY COALESCE("qualifiedAt", "createdAt"), "id") AS n
  FROM "leads"
  WHERE "billingStatus" IN ('CHARGED', 'PENDING_FUNDS', 'REFUNDED', 'WAIVED')
)
UPDATE "leads" l
SET "billingOrdinal" = ranked.n,
    "billedAt" = COALESCE(l."qualifiedAt", l."createdAt")
FROM ranked
WHERE l."id" = ranked."id";

CREATE UNIQUE INDEX "leads_organizationId_billingOrdinal_key" ON "leads"("organizationId", "billingOrdinal");

-- ---------------------------------------------------------------------------
-- Reminders: one row per reminder sent
-- ---------------------------------------------------------------------------
CREATE TYPE "ReminderKind" AS ENUM ('DAY_BEFORE', 'TODAY', 'SOON', 'FOLLOW_UP');

CREATE TABLE "appointment_reminders" (
  "id"            TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "kind"          "ReminderKind" NOT NULL,
  "forInstant"    TIMESTAMP(3) NOT NULL,
  "sentAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_reminders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appointment_reminders_appointmentId_kind_forInstant_key"
  ON "appointment_reminders"("appointmentId", "kind", "forInstant");

ALTER TABLE "appointment_reminders"
  ADD CONSTRAINT "appointment_reminders_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reminders already sent under the old columns are carried over, so the
-- change never sends any of them a second time.
INSERT INTO "appointment_reminders" ("id", "appointmentId", "kind", "forInstant", "sentAt")
SELECT 'rmd_m' || "id" || 'd', "id", 'DAY_BEFORE', "startsAt", "reminderDayBeforeSentAt"
FROM "appointments" WHERE "reminderDayBeforeSentAt" IS NOT NULL;

INSERT INTO "appointment_reminders" ("id", "appointmentId", "kind", "forInstant", "sentAt")
SELECT 'rmd_m' || "id" || 's', "id", 'SOON', "startsAt", "reminderSoonSentAt"
FROM "appointments" WHERE "reminderSoonSentAt" IS NOT NULL;

INSERT INTO "appointment_reminders" ("id", "appointmentId", "kind", "forInstant", "sentAt")
SELECT 'rmd_m' || "id" || 'f', "id", 'FOLLOW_UP', "followUpDueAt", "followUpSentAt"
FROM "appointments" WHERE "followUpSentAt" IS NOT NULL AND "followUpDueAt" IS NOT NULL;

ALTER TABLE "appointments"
  DROP COLUMN "reminderDayBeforeSentAt",
  DROP COLUMN "reminderSoonSentAt",
  DROP COLUMN "followUpSentAt";

-- ---------------------------------------------------------------------------
-- Video meetings (created only by a connected provider)
-- ---------------------------------------------------------------------------
CREATE TYPE "VideoMeetingStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'ENDED');

CREATE TABLE "video_meetings" (
  "id"                TEXT NOT NULL,
  "appointmentId"     TEXT NOT NULL,
  "provider"          TEXT NOT NULL,
  "externalMeetingId" TEXT NOT NULL,
  "joinUrl"           TEXT NOT NULL,
  "hostUrl"           TEXT,
  "hostUserId"        TEXT NOT NULL,
  "participantUserId" TEXT NOT NULL,
  "startsAt"          TIMESTAMP(3) NOT NULL,
  "expiresAt"         TIMESTAMP(3) NOT NULL,
  "status"            "VideoMeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "cancelledAt"       TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "video_meetings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_meetings_appointmentId_key" ON "video_meetings"("appointmentId");
CREATE UNIQUE INDEX "video_meetings_provider_externalMeetingId_key" ON "video_meetings"("provider", "externalMeetingId");

ALTER TABLE "video_meetings"
  ADD CONSTRAINT "video_meetings_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Credits: one idempotency key, one credit, across every wallet
-- ---------------------------------------------------------------------------
-- A staff credit's key is unique per wallet already; this makes it unique
-- globally, so a key reused against another organization is refused rather
-- than crediting a second wallet.
CREATE UNIQUE INDEX "ledger_entries_credit_key"
  ON "ledger_entries"("idempotencyKey") WHERE "kind" IN ('TOP_UP', 'ADJUSTMENT');
