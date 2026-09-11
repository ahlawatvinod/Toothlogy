-- CreateEnum
CREATE TYPE "ArticleKind" AS ENUM ('CONDITION', 'TREATMENT', 'PROCEDURE', 'GUIDE', 'BLOG');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "ArticleKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "liveTitle" TEXT,
    "liveSummary" TEXT,
    "liveBody" TEXT,
    "liveCitations" JSONB,
    "treatmentId" TEXT,
    "specialtyKey" TEXT,
    "coverFileId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_status_submittedAt_idx" ON "articles"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "articles_kind_lastReviewedAt_idx" ON "articles"("kind", "lastReviewedAt");

-- CreateIndex
CREATE INDEX "articles_authorUserId_updatedAt_idx" ON "articles"("authorUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "articles_treatmentId_idx" ON "articles"("treatmentId");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_coverFileId_fkey" FOREIGN KEY ("coverFileId") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity the schema language cannot express.
ALTER TABLE "articles" ADD CONSTRAINT "articles_published_has_live_copy" CHECK ("status" <> 'PUBLISHED' OR ("liveTitle" IS NOT NULL AND "liveBody" IS NOT NULL AND "lastReviewedAt" IS NOT NULL));
ALTER TABLE "articles" ADD CONSTRAINT "articles_archive_has_reason" CHECK ("status" <> 'ARCHIVED' OR ("archivedAt" IS NOT NULL AND "archivedReason" IS NOT NULL));
ALTER TABLE "articles" ADD CONSTRAINT "articles_reviewer_is_not_author" CHECK ("reviewedByUserId" IS NULL OR "reviewedByUserId" <> "authorUserId");
