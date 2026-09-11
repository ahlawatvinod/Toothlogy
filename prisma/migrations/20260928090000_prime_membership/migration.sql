-- CreateEnum
CREATE TYPE "MembershipAudience" AS ENUM ('ORGANIZATION', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "MembershipPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'ENDED');

-- AlterEnum
ALTER TYPE "LedgerEntryKind" ADD VALUE 'MEMBERSHIP_CHARGE';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "membershipId" TEXT;

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "priority" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "membership_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" "MembershipAudience" NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "currency" TEXT NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "taxCategory" TEXT NOT NULL DEFAULT 'platform_fees',
    "periodMonths" INTEGER NOT NULL,
    "bonusFreeLeads" INTEGER NOT NULL DEFAULT 0,
    "primeBadge" BOOLEAN NOT NULL DEFAULT false,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "status" "MembershipPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "openKey" TEXT,
    "netMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "chargeEntryId" TEXT,
    "renewedFromId" TEXT,
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_plans_code_key" ON "membership_plans"("code");

-- CreateIndex
CREATE INDEX "membership_plans_audience_status_countryCode_idx" ON "membership_plans"("audience", "status", "countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_openKey_key" ON "memberships"("openKey");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_chargeEntryId_key" ON "memberships"("chargeEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_renewedFromId_key" ON "memberships"("renewedFromId");

-- CreateIndex
CREATE INDEX "memberships_organizationId_status_idx" ON "memberships"("organizationId", "status");

-- CreateIndex
CREATE INDEX "memberships_status_endsAt_idx" ON "memberships"("status", "endsAt");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK constraints (not expressible in the Prisma schema)
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_terms_check" CHECK ("priceMinor" >= 0 AND "periodMonths" BETWEEN 1 AND 36 AND "bonusFreeLeads" >= 0 AND ("audience" = 'ORGANIZATION' OR ("bonusFreeLeads" = 0 AND "primeBadge" = false)));
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_period_check" CHECK ("endsAt" > "startsAt" AND "netMinor" >= 0 AND "taxMinor" >= 0);
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_member_check" CHECK (num_nonnulls("organizationId", "userId") = 1);
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_open_check" CHECK (("status" = 'ACTIVE') = ("openKey" IS NOT NULL));
