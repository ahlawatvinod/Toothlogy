-- Phase 4: sponsored placement (Prime dentist / clinic / hospital).
-- A labelled layer beside organic discovery; money moves only through the
-- wallet ledger.

CREATE TYPE "CampaignSubject" AS ENUM ('PRACTICE', 'ORGANIZATION');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'EXHAUSTED', 'CANCELLED');
CREATE TYPE "SponsoredPlacement" AS ENUM ('SEARCH', 'PROFILE');
CREATE TYPE "SponsoredEventKind" AS ENUM ('IMPRESSION', 'CLICK', 'PROFILE_VIEW', 'BOOK_CLICK');

ALTER TYPE "LedgerEntryKind" ADD VALUE 'SPONSORED_HOLD';
ALTER TYPE "LedgerEntryKind" ADD VALUE 'SPONSORED_REFUND';

-- ---------------------------------------------------------------------------
CREATE TABLE "sponsored_placement_settings" (
  "id"                      TEXT NOT NULL,
  "countryCode"             CHAR(2) NOT NULL,
  "currency"                TEXT NOT NULL,
  "minimumDailyBudgetMinor" BIGINT NOT NULL,
  "searchSlots"             INTEGER NOT NULL DEFAULT 2,
  "profileSlots"            INTEGER NOT NULL DEFAULT 1,
  "maxCampaignDays"         INTEGER NOT NULL DEFAULT 365,
  "taxCategory"             TEXT NOT NULL DEFAULT 'platform_fees',
  "isActive"                BOOLEAN NOT NULL DEFAULT true,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sponsored_placement_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sponsored_placement_settings_valid" CHECK (
    "minimumDailyBudgetMinor" > 0 AND "searchSlots" BETWEEN 0 AND 5 AND "profileSlots" BETWEEN 0 AND 3 AND "maxCampaignDays" > 0
  )
);
CREATE UNIQUE INDEX "sponsored_placement_settings_countryCode_key" ON "sponsored_placement_settings"("countryCode");

-- ---------------------------------------------------------------------------
CREATE TABLE "sponsored_campaigns" (
  "id"                     TEXT NOT NULL,
  "organizationId"         TEXT NOT NULL,
  "subjectType"            "CampaignSubject" NOT NULL,
  "practiceId"             TEXT,
  "name"                   TEXT NOT NULL,
  "searchPlacement"        BOOLEAN NOT NULL DEFAULT true,
  "profilePlacement"       BOOLEAN NOT NULL DEFAULT false,
  "status"                 "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt"               TIMESTAMP(3) NOT NULL,
  "endsAt"                 TIMESTAMP(3) NOT NULL,
  "timezone"               TEXT NOT NULL,
  "currency"               TEXT NOT NULL,
  "budgetMinor"            BIGINT NOT NULL,
  "dailyRateMinor"         BIGINT NOT NULL DEFAULT 0,
  "heldMinor"              BIGINT NOT NULL DEFAULT 0,
  "spentMinor"             BIGINT NOT NULL DEFAULT 0,
  "refundedMinor"          BIGINT NOT NULL DEFAULT 0,
  "holdCount"              INTEGER NOT NULL DEFAULT 0,
  "targetTreatmentKeys"    TEXT[],
  "targetAppointmentTypes" TEXT[],
  "createdByUserId"        TEXT NOT NULL,
  "activatedAt"            TIMESTAMP(3),
  "pausedAt"               TIMESTAMP(3),
  "closedAt"               TIMESTAMP(3),
  "closeReason"            TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sponsored_campaigns_pkey" PRIMARY KEY ("id"),
  -- A promoted dentist is always a specific practice; an organization never is.
  CONSTRAINT "sponsored_campaigns_subject" CHECK (
    ("subjectType" = 'PRACTICE' AND "practiceId" IS NOT NULL) OR ("subjectType" = 'ORGANIZATION' AND "practiceId" IS NULL)
  ),
  CONSTRAINT "sponsored_campaigns_dates" CHECK ("endsAt" > "startsAt"),
  -- No budget overrun, in the database: spend never exceeds what was held,
  -- and refunds never exceed what was left.
  CONSTRAINT "sponsored_campaigns_money" CHECK (
    "budgetMinor" > 0 AND "heldMinor" >= 0 AND "spentMinor" >= 0 AND "refundedMinor" >= 0
    AND "spentMinor" + "refundedMinor" <= "heldMinor" AND "dailyRateMinor" >= 0
  ),
  CONSTRAINT "sponsored_campaigns_placement" CHECK ("searchPlacement" OR "profilePlacement")
);
CREATE INDEX "sponsored_campaigns_status_startsAt_endsAt_idx" ON "sponsored_campaigns"("status", "startsAt", "endsAt");
CREATE INDEX "sponsored_campaigns_organizationId_status_idx" ON "sponsored_campaigns"("organizationId", "status");
CREATE INDEX "sponsored_campaigns_practiceId_idx" ON "sponsored_campaigns"("practiceId");
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_practiceId_fkey"
  FOREIGN KEY ("practiceId") REFERENCES "dentist_practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
CREATE TABLE "sponsored_campaign_days" (
  "id"          TEXT NOT NULL,
  "campaignId"  TEXT NOT NULL,
  "localDate"   TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "taxMinor"    BIGINT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sponsored_campaign_days_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sponsored_campaign_days_amount" CHECK ("amountMinor" > 0 AND "taxMinor" >= 0 AND "taxMinor" <= "amountMinor")
);
CREATE UNIQUE INDEX "sponsored_campaign_days_campaignId_localDate_key" ON "sponsored_campaign_days"("campaignId", "localDate");
ALTER TABLE "sponsored_campaign_days" ADD CONSTRAINT "sponsored_campaign_days_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "sponsored_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
CREATE TABLE "sponsored_events" (
  "id"             TEXT NOT NULL,
  "campaignId"     TEXT NOT NULL,
  "kind"           "SponsoredEventKind" NOT NULL,
  "placement"      "SponsoredPlacement" NOT NULL,
  "parentId"       TEXT,
  "viewerUserId"   TEXT,
  "excluded"       BOOLEAN NOT NULL DEFAULT false,
  "excludedReason" TEXT,
  "context"        JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sponsored_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sponsored_events_parentId_kind_key" ON "sponsored_events"("parentId", "kind");
CREATE INDEX "sponsored_events_campaignId_kind_createdAt_idx" ON "sponsored_events"("campaignId", "kind", "createdAt");
ALTER TABLE "sponsored_events" ADD CONSTRAINT "sponsored_events_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "sponsored_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Attribution and traceability
ALTER TABLE "leads" ADD COLUMN "campaignId" TEXT;
CREATE INDEX "leads_campaignId_idx" ON "leads"("campaignId");
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "sponsored_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries" ADD COLUMN "campaignId" TEXT;
CREATE INDEX "ledger_entries_campaignId_idx" ON "ledger_entries"("campaignId");
