-- Enable pgvector extension first
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column after pgvector extension is enabled
ALTER TABLE "BrandKnowledgeChunk" ADD COLUMN IF NOT EXISTS "embeddingVector" vector(768);

-- Index for cosine similarity search
CREATE INDEX IF NOT EXISTS "BrandKnowledgeChunk_embeddingVector_idx" 
ON "BrandKnowledgeChunk" USING ivfflat ("embeddingVector" vector_cosine_ops)
WITH (lists = 10);
