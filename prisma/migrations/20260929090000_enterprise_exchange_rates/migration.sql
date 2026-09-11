-- CreateEnum
CREATE TYPE "EnterpriseAgreementStatus" AS ENUM ('ACTIVE', 'ENDED');

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "enterpriseAgreementId" TEXT,
ADD COLUMN     "firstRespondedAt" TIMESTAMP(3),
ADD COLUMN     "slaFirstResponseDueAt" TIMESTAMP(3),
ADD COLUMN     "slaResolveDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,
    "rateMicros" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_agreements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "EnterpriseAgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "firstResponseHours" INTEGER NOT NULL,
    "resolutionHours" INTEGER NOT NULL,
    "dataResidency" CHAR(2) NOT NULL,
    "ssoRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "openKey" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_quoteCurrency_asOf_idx" ON "exchange_rates"("quoteCurrency", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_baseCurrency_quoteCurrency_asOf_key" ON "exchange_rates"("baseCurrency", "quoteCurrency", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_agreements_openKey_key" ON "enterprise_agreements"("openKey");

-- CreateIndex
CREATE INDEX "enterprise_agreements_status_endsOn_idx" ON "enterprise_agreements"("status", "endsOn");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_enterpriseAgreementId_fkey" FOREIGN KEY ("enterpriseAgreementId") REFERENCES "enterprise_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_agreements" ADD CONSTRAINT "enterprise_agreements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECK constraints (not expressible in the Prisma schema)
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_rate_check" CHECK ("rateMicros" > 0 AND "baseCurrency" <> "quoteCurrency" AND "baseCurrency" ~ '^[A-Z]{3}$' AND "quoteCurrency" ~ '^[A-Z]{3}$');
ALTER TABLE "enterprise_agreements" ADD CONSTRAINT "enterprise_agreements_terms_check" CHECK ("endsOn" > "startsOn" AND "firstResponseHours" > 0 AND "resolutionHours" >= "firstResponseHours" AND "dataResidency" ~ '^[A-Z]{2}$');
ALTER TABLE "enterprise_agreements" ADD CONSTRAINT "enterprise_agreements_open_check" CHECK (("status" = 'ACTIVE') = ("openKey" IS NOT NULL));
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_sla_check" CHECK (("enterpriseAgreementId" IS NULL) = ("slaFirstResponseDueAt" IS NULL) AND ("enterpriseAgreementId" IS NULL) = ("slaResolveDueAt" IS NULL));
