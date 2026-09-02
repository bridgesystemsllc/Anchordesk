-- Anchor Desk · 0004 · Knowledge Base ingest and retrieval (AD-103)
-- cs_kb_sources: SharePoint document sources
-- cs_kb_chunks: embedded text chunks with pgvector
-- cs_settings: singleton config row for KB site/drive and other settings

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Application settings (singleton row)
CREATE TABLE IF NOT EXISTS cs_settings (
  id                 integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  kb_site_id         text,
  kb_drive_id        text,
  kb_folder_path     text DEFAULT '/',
  kb_last_crawl_at   timestamptz,
  kb_crawl_status    text DEFAULT 'idle' CHECK (kb_crawl_status IN ('idle', 'crawling', 'failed')),
  kb_crawl_error     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Insert the singleton row
INSERT INTO cs_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Knowledge base sources (SharePoint documents)
CREATE TABLE IF NOT EXISTS cs_kb_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_item_id   text NOT NULL,
  name            text NOT NULL,
  path            text NOT NULL,
  mime_type       text,
  size_bytes      bigint,
  etag            text,
  checksum        text,
  brand_code      text,
  indexed_at      timestamptz,
  last_modified   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cs_kb_sources_drive_item_key ON cs_kb_sources (drive_item_id);
CREATE INDEX IF NOT EXISTS cs_kb_sources_brand_idx ON cs_kb_sources (brand_code);
CREATE INDEX IF NOT EXISTS cs_kb_sources_path_idx ON cs_kb_sources (path);

-- Knowledge base chunks (embedded text)
CREATE TABLE IF NOT EXISTS cs_kb_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL REFERENCES cs_kb_sources (id) ON DELETE CASCADE,
  chunk_index     integer NOT NULL,
  title           text NOT NULL,
  text            text NOT NULL,
  brand_code      text,
  embedding       vector(1536),
  tokens          integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_kb_chunks_source_idx ON cs_kb_chunks (source_id);
CREATE INDEX IF NOT EXISTS cs_kb_chunks_brand_idx ON cs_kb_chunks (brand_code);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS cs_kb_chunks_embedding_idx 
  ON cs_kb_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search index for hybrid retrieval
ALTER TABLE cs_kb_chunks ADD COLUMN IF NOT EXISTS fts tsvector 
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(text, ''))) STORED;
CREATE INDEX IF NOT EXISTS cs_kb_chunks_fts_idx ON cs_kb_chunks USING gin (fts);
