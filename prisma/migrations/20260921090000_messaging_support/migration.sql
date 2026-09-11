-- CreateEnum
CREATE TYPE "MessageThreadStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageSide" AS ENUM ('PATIENT', 'PRACTICE');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('ACCOUNT', 'BOOKING', 'BILLING', 'VERIFICATION', 'DATA_PRIVACY', 'LISTING', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "subject" TEXT NOT NULL,
    "status" "MessageThreadStatus" NOT NULL DEFAULT 'OPEN',
    "openKey" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientReadAt" TIMESTAMP(3),
    "practiceReadAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "side" "MessageSide" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "category" "SupportCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToUserId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_threads_openKey_key" ON "message_threads"("openKey");

-- CreateIndex
CREATE INDEX "message_threads_organizationId_status_lastMessageAt_idx" ON "message_threads"("organizationId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "message_threads_patientUserId_lastMessageAt_idx" ON "message_threads"("patientUserId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "messages_threadId_createdAt_idx" ON "messages"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_authorUserId_createdAt_idx" ON "messages"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_status_lastActivityAt_idx" ON "support_tickets"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "support_tickets_requesterUserId_idx" ON "support_tickets"("requesterUserId");

-- CreateIndex
CREATE INDEX "support_tickets_assignedToUserId_status_idx" ON "support_tickets"("assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "support_messages_ticketId_createdAt_idx" ON "support_messages"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

