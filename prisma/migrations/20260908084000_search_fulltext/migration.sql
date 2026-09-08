-- Full-text search for search_documents.
--
-- Written by hand because Prisma cannot express a tsvector column, a GIN index
-- or a trigger. Keeping it as a real migration (rather than a script run out of
-- band) means the search index is created identically in every environment,
-- including a fresh CI database.
--
-- WHY A TRIGGER RATHER THAN APPLICATION CODE
-- The vector must never disagree with the row it indexes. If application code
-- maintained it, any write that forgot to recompute it would leave a document
-- silently unfindable — the worst kind of search bug, because the row looks
-- perfectly correct when inspected directly. A trigger makes divergence
-- impossible.
--
-- WEIGHTING
-- 'A' for title, 'B' for summary, 'C' for body. ts_rank uses these so a dentist
-- whose NAME matches "endodontist" outranks one who merely mentions the word in
-- a paragraph of their bio. Without weights, a long document beats a precise
-- title match, which is the wrong answer for discovery.
--
-- 'english' is the stemmer for now. Non-English content is indexed with the
-- 'simple' configuration in Phase 12 when non-English content actually exists;
-- stemming Hindi with English rules is worse than not stemming it.

ALTER TABLE "search_documents"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

CREATE OR REPLACE FUNCTION toothlogy_search_documents_vector()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."summary", '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."body", '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS toothlogy_search_documents_vector_trigger ON "search_documents";

CREATE TRIGGER toothlogy_search_documents_vector_trigger
  BEFORE INSERT OR UPDATE OF "title", "summary", "body"
  ON "search_documents"
  FOR EACH ROW
  EXECUTE FUNCTION toothlogy_search_documents_vector();

-- GIN, not GiST: GIN is slower to build and faster to query, and search
-- documents are read far more often than written.
CREATE INDEX IF NOT EXISTS "search_documents_vector_idx"
  ON "search_documents" USING GIN ("searchVector");

-- Trigram index for fuzzy/prefix matching, which powers type-ahead and
-- tolerates the misspellings real patients type ("root canel").
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "search_documents_title_trgm_idx"
  ON "search_documents" USING GIN ("title" gin_trgm_ops);

-- Backfill anything already present. No-op on a fresh database, correct on an
-- existing one.
UPDATE "search_documents" SET "title" = "title";
