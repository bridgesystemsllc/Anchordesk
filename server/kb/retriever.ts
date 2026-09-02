/**
 * Hybrid retriever combining FTS and pgvector cosine similarity.
 * Retrieval quality is the lever on draft quality. If acceptance drops
 * below 50%, the fix is almost always the chunks, not the model.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { csKbChunks } from '../db/schema';
import { getEmbedder } from './embeddings';
import { log } from '../log';

export interface KbChunk {
  id: string;
  title: string;
  text: string;
}

export interface RetrieveOptions {
  brand?: string;
  limit?: number;
}

export interface Retriever {
  retrieve(query: string, opts?: RetrieveOptions): Promise<KbChunk[]>;
}

const DEFAULT_LIMIT = 8;
const VECTOR_WEIGHT = 0.7;
const FTS_WEIGHT = 0.3;

/**
 * Hybrid retriever using RRF (Reciprocal Rank Fusion) to combine
 * vector similarity and full-text search rankings.
 */
export const hybridRetriever: Retriever = {
  async retrieve(query: string, opts?: RetrieveOptions): Promise<KbChunk[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const limit = opts?.limit ?? DEFAULT_LIMIT;
    const brand = opts?.brand;

    try {
      const embedder = getEmbedder();
      const [embedding] = await embedder.embed([trimmed]);
      if (!embedding) return [];

      const embeddingStr = `[${embedding.join(',')}]`;

      const brandFilter = brand
        ? sql`AND (${csKbChunks.brandCode} IS NULL OR ${csKbChunks.brandCode} = ${brand})`
        : sql``;

      const results = await db.execute<{
        id: string;
        title: string;
        text: string;
        combined_score: number;
      }>(sql`
        WITH vector_results AS (
          SELECT 
            id,
            title,
            text,
            1 - (embedding <=> ${embeddingStr}::vector) as vector_score,
            ROW_NUMBER() OVER (ORDER BY embedding <=> ${embeddingStr}::vector) as vector_rank
          FROM cs_kb_chunks
          WHERE embedding IS NOT NULL ${brandFilter}
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT ${limit * 3}
        ),
        fts_results AS (
          SELECT 
            id,
            title,
            text,
            ts_rank(fts, websearch_to_tsquery('english', ${trimmed})) as fts_score,
            ROW_NUMBER() OVER (ORDER BY ts_rank(fts, websearch_to_tsquery('english', ${trimmed})) DESC) as fts_rank
          FROM cs_kb_chunks
          WHERE fts @@ websearch_to_tsquery('english', ${trimmed}) ${brandFilter}
          ORDER BY fts_score DESC
          LIMIT ${limit * 3}
        ),
        combined AS (
          SELECT 
            COALESCE(v.id, f.id) as id,
            COALESCE(v.title, f.title) as title,
            COALESCE(v.text, f.text) as text,
            (
              COALESCE(${VECTOR_WEIGHT} / (60 + v.vector_rank), 0) +
              COALESCE(${FTS_WEIGHT} / (60 + f.fts_rank), 0)
            ) as combined_score
          FROM vector_results v
          FULL OUTER JOIN fts_results f ON v.id = f.id
        )
        SELECT id, title, text, combined_score
        FROM combined
        ORDER BY combined_score DESC
        LIMIT ${limit}
      `);

      const chunks: KbChunk[] = results.rows.map((row) => ({
        id: row.id,
        title: row.title,
        text: row.text,
      }));

      log.debug('hybrid retrieval', {
        query: trimmed.slice(0, 50),
        brand,
        limit,
        found: chunks.length,
      });

      return chunks;
    } catch (e) {
      log.error('hybrid retrieval failed', {
        query: trimmed.slice(0, 50),
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  },
};

/**
 * Empty retriever for tests and when KB is not configured.
 */
export const emptyRetriever: Retriever = {
  async retrieve(_query: string, _opts?: RetrieveOptions): Promise<KbChunk[]> {
    return [];
  },
};

/**
 * Check if the KB has any indexed chunks.
 */
export async function hasIndexedChunks(): Promise<boolean> {
  try {
    const result = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text as count FROM cs_kb_chunks LIMIT 1
    `);
    return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
  } catch {
    return false;
  }
}

/**
 * Get chunk count for health checks.
 */
export async function getChunkCount(): Promise<number> {
  try {
    const result = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text as count FROM cs_kb_chunks
    `);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  } catch {
    return 0;
  }
}
