-- CreateEnum
CREATE TYPE "OutreachPurpose" AS ENUM ('ACTIVATE_ACCOUNT', 'CLAIM_LISTING', 'VERIFY_DETAILS', 'RETENTION');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutreachActivityType" AS ENUM ('CALL', 'NOTE', 'EMAIL', 'SMS', 'WHATSAPP', 'VISIT');

-- CreateEnum
CREATE TYPE "OutreachOutcome" AS ENUM ('CONNECTED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'INTERESTED', 'NOT_INTERESTED', 'ONBOARDED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "followUpNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "outreach_tasks" (
    "id" TEXT NOT NULL,
    "districtId" TEXT,
    "extractedRecordId" TEXT,
    "organizationId" TEXT,
    "purpose" "OutreachPurpose" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "openKey" TEXT,
    "assignedToUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "outcome" "OutreachOutcome",
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_activities" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" "OutreachActivityType" NOT NULL,
    "outcome" "OutreachOutcome",
    "note" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_tasks_openKey_key" ON "outreach_tasks"("openKey");

-- CreateIndex
CREATE INDEX "outreach_tasks_districtId_status_idx" ON "outreach_tasks"("districtId", "status");

-- CreateIndex
CREATE INDEX "outreach_tasks_assignedToUserId_status_dueAt_idx" ON "outreach_tasks"("assignedToUserId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "outreach_tasks_extractedRecordId_idx" ON "outreach_tasks"("extractedRecordId");

-- CreateIndex
CREATE INDEX "outreach_tasks_organizationId_idx" ON "outreach_tasks"("organizationId");

-- CreateIndex
CREATE INDEX "outreach_activities_taskId_createdAt_idx" ON "outreach_activities"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_organizationId_assignedToUserId_idx" ON "leads"("organizationId", "assignedToUserId");

-- CreateIndex
CREATE INDEX "leads_nextFollowUpAt_idx" ON "leads"("nextFollowUpAt");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_tasks" ADD CONSTRAINT "outreach_tasks_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_tasks" ADD CONSTRAINT "outreach_tasks_extractedRecordId_fkey" FOREIGN KEY ("extractedRecordId") REFERENCES "extracted_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_tasks" ADD CONSTRAINT "outreach_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_tasks" ADD CONSTRAINT "outreach_tasks_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_activities" ADD CONSTRAINT "outreach_activities_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "outreach_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One subject per task: an extracted record or an organization, never both or neither.
ALTER TABLE "outreach_tasks" ADD CONSTRAINT "outreach_tasks_one_subject" CHECK (num_nonnulls("extractedRecordId", "organizationId") = 1);
