-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('AVATAR', 'ORGANIZATION_LOGO', 'CLINIC_PHOTO', 'DENTIST_CERTIFICATE', 'DENTIST_LICENSE', 'IDENTITY_DOCUMENT', 'STUDENT_DOCUMENT', 'DENTAL_REPORT', 'PRESCRIPTION', 'XRAY', 'CBCT', 'INVOICE', 'AGREEMENT', 'RESUME', 'CERTIFICATE', 'PRODUCT_IMAGE', 'PRODUCT_MANUAL', 'WARRANTY', 'RESEARCH_DOCUMENT', 'CHAT_ATTACHMENT', 'CONTENT_MEDIA', 'OTHER');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('QUARANTINED', 'ACTIVE', 'DELETED', 'PURGED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('NOT_SCANNED', 'CLEAN', 'INFECTED', 'SCANNER_NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "FileAccessAction" AS ENUM ('UPLOAD', 'SIGN_URL', 'DOWNLOAD', 'DELETE', 'PURGE');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ALL', 'ACCOUNT', 'SECURITY', 'APPOINTMENTS', 'MESSAGES', 'REVIEWS', 'LEADS', 'BILLING', 'MARKETPLACE', 'CAREERS', 'COMMUNITY', 'MARKETING');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "DistanceUnit" AS ENUM ('KM', 'MI');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('NEW_DEVICE_LOGIN', 'SUSPICIOUS_LOGIN', 'ACCOUNT_LOCKED', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'MFA_ENABLED', 'MFA_DISABLED', 'RECOVERY_CODE_USED', 'RECOVERY_CODES_REGENERATED', 'EMAIL_VERIFIED', 'PHONE_VERIFIED', 'DELETION_REQUESTED', 'ACCOUNT_RESTORED', 'SESSIONS_REVOKED');

-- AlterEnum
ALTER TYPE "TokenType" ADD VALUE 'MFA_CHALLENGE';

-- DropIndex
DROP INDEX "notification_preferences_userId_channel_key";

-- AlterTable
ALTER TABLE "credentials" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "encryptedSecret" TEXT,
ADD COLUMN     "lastUsedStep" INTEGER;

-- AlterTable
ALTER TABLE "file_objects" ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "purpose" "FilePurpose" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "retainUntil" TIMESTAMP(3),
ADD COLUMN     "scanStatus" "ScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
ADD COLUMN     "scannedAt" TIMESTAMP(3),
ADD COLUMN     "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "category" "NotificationCategory" NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "notification_records" ADD COLUMN     "sourceEventId" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "description" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "logoFileId" TEXT,
ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "parentOrganizationId" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "taxIdentifier" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "deadAt" TIMESTAMP(3),
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarFileId" TEXT,
ADD COLUMN     "erasedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "event_handler_receipts" (
    "eventId" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_handler_receipts_pkey" PRIMARY KEY ("eventId","handler")
);

-- CreateTable
CREATE TABLE "file_access_logs" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" "FileAccessAction" NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "ipAddress" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" CHAR(3),
    "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "palette" TEXT NOT NULL DEFAULT 'teal',
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "highContrast" BOOLEAN NOT NULL DEFAULT false,
    "textScale" INTEGER NOT NULL DEFAULT 100,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "distanceUnit" "DistanceUnit" NOT NULL DEFAULT 'KM',
    "defaultSearchRadiusKm" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SecurityEventType" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "detail" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_synonyms" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "expansions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_access_logs_fileId_occurredAt_idx" ON "file_access_logs"("fileId", "occurredAt");

-- CreateIndex
CREATE INDEX "file_access_logs_actor_occurredAt_idx" ON "file_access_logs"("actor", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_codeHash_key" ON "recovery_codes"("codeHash");

-- CreateIndex
CREATE INDEX "recovery_codes_userId_usedAt_idx" ON "recovery_codes"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "security_events_userId_occurredAt_idx" ON "security_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "security_events_type_occurredAt_idx" ON "security_events"("type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "search_synonyms_locale_term_key" ON "search_synonyms"("locale", "term");

-- CreateIndex
CREATE INDEX "file_objects_purpose_status_idx" ON "file_objects"("purpose", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_channel_category_key" ON "notification_preferences"("userId", "channel", "category");

-- CreateIndex
CREATE INDEX "organizations_parentOrganizationId_idx" ON "organizations"("parentOrganizationId");

-- CreateIndex
CREATE INDEX "outbox_events_deadAt_nextAttemptAt_idx" ON "outbox_events"("deadAt", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parentOrganizationId_fkey" FOREIGN KEY ("parentOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_access_logs" ADD CONSTRAINT "file_access_logs_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Typo tolerance for search (hand-written: Prisma does not model extensions or
-- trigram operator classes). pg_trgm scores "ortodontist" close to
-- "orthodontist", which a tsvector alone cannot do.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "search_documents_title_trgm_idx" ON "search_documents" USING GIN ("title" gin_trgm_ops);