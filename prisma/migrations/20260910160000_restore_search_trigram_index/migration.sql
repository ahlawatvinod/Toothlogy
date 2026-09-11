-- CreateIndex
CREATE INDEX "search_documents_title_trgm_idx" ON "search_documents" USING GIN ("title" gin_trgm_ops);

