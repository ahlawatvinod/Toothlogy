-- CreateEnum
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DECLINED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TreatmentPlanItemStatus" AS ENUM ('PLANNED', 'DONE', 'SKIPPED');

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "dependentId" TEXT,
    "organizationId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "currency" TEXT NOT NULL,
    "estimateMinor" BIGINT NOT NULL,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "treatmentKey" TEXT,
    "teeth" INTEGER[],
    "estimateMinor" BIGINT NOT NULL,
    "status" "TreatmentPlanItemStatus" NOT NULL DEFAULT 'PLANNED',
    "doneAt" TIMESTAMP(3),
    "doneByUserId" TEXT,
    "skipReason" TEXT,

    CONSTRAINT "treatment_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_plans_patientUserId_createdAt_idx" ON "treatment_plans"("patientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "treatment_plans_organizationId_status_idx" ON "treatment_plans"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plan_items_planId_position_key" ON "treatment_plan_items"("planId", "position");

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "dependents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "treatment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Estimates are never negative; a decided plan says when; a cancelled plan says when and why; a done item says when.
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_estimate_check" CHECK ("estimateMinor" >= 0);
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_decided_check" CHECK ("status" NOT IN ('ACCEPTED', 'DECLINED', 'COMPLETED') OR "decidedAt" IS NOT NULL);
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_cancelled_check" CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelledReason" IS NOT NULL));
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_estimate_check" CHECK ("estimateMinor" >= 0);
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_position_check" CHECK ("position" >= 1);
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_done_check" CHECK ("status" <> 'DONE' OR "doneAt" IS NOT NULL);
