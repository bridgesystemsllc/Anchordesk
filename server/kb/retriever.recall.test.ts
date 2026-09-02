/**
 * Recall@5 test for hybrid retriever.
 * Uses HashingEmbedder (deterministic) so no API calls required.
 * Target: recall@5 >= 0.85 on 25 labeled queries.
 *
 * Requires TEST_DATABASE_URL env var pointing to a pgvector-enabled Postgres.
 * Skips when TEST_DATABASE_URL is not set.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { csKbChunks, csKbSources } from '../db/schema';
import { hybridRetriever } from './retriever';
import { hashingEmbedder } from './embeddings';
import { SYNTHETIC_CHUNKS, LABELED_QUERIES } from './test-corpus';

const RECALL_AT_K = 5;
const MIN_RECALL = 0.85;
const HAS_TEST_DB = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!HAS_TEST_DB)('retriever recall', () => {
  beforeAll(async () => {
    await db.delete(csKbChunks);
    await db.delete(csKbSources);

    const [source] = await db
      .insert(csKbSources)
      .values({
        driveItemId: 'recall-test-fixture',
        name: 'Recall Test Fixture',
        path: '/test',
        mimeType: 'text/plain',
        indexedAt: new Date(),
      })
      .returning({ id: csKbSources.id });

    const texts = SYNTHETIC_CHUNKS.map((c) => `${c.title}\n\n${c.text}`);
    const embeddings = await hashingEmbedder.embed(texts);

    for (let i = 0; i < SYNTHETIC_CHUNKS.length; i++) {
      const chunk = SYNTHETIC_CHUNKS[i]!;
      await db.insert(csKbChunks).values({
        id: chunk.id,
        sourceId: source!.id,
        chunkIndex: i,
        title: chunk.title,
        text: chunk.text,
        brandCode: chunk.brandCode,
        embedding: embeddings[i] ?? null,
        tokens: Math.ceil(chunk.text.length / 4),
      });
    }

    await db.execute(sql`
      UPDATE cs_kb_chunks
      SET fts = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(text, ''))
    `);
  });

  afterAll(async () => {
    await db.delete(csKbChunks);
    await db.delete(csKbSources);
  });

  it('achieves recall@5 >= 0.85 on 25 labeled queries', async () => {
    let totalHits = 0;
    let totalExpected = 0;
    const failures: Array<{ query: string; expected: string[]; got: string[]; recall: number }> = [];

    for (const { query, expectedChunkIds, brand } of LABELED_QUERIES) {
      const results = await hybridRetriever.retrieve(query, { brand, limit: RECALL_AT_K });
      const retrievedIds = new Set(results.map((r) => r.id));

      let hits = 0;
      for (const expectedId of expectedChunkIds) {
        if (retrievedIds.has(expectedId)) hits++;
      }

      totalHits += hits;
      totalExpected += expectedChunkIds.length;

      const queryRecall = hits / expectedChunkIds.length;
      if (queryRecall < 1) {
        failures.push({
          query,
          expected: expectedChunkIds,
          got: Array.from(retrievedIds),
          recall: queryRecall,
        });
      }
    }

    const overallRecall = totalHits / totalExpected;

    if (failures.length > 0 && overallRecall < MIN_RECALL) {
      console.log('Queries with incomplete recall:');
      for (const f of failures.slice(0, 5)) {
        console.log(`  "${f.query}": expected ${f.expected.join(', ')}, got ${f.got.join(', ')}`);
      }
    }

    expect(overallRecall).toBeGreaterThanOrEqual(MIN_RECALL);
  });

  it('returns empty array for empty query', async () => {
    const results = await hybridRetriever.retrieve('', { limit: 5 });
    expect(results).toEqual([]);
  });

  it('returns empty array for whitespace query', async () => {
    const results = await hybridRetriever.retrieve('   ', { limit: 5 });
    expect(results).toEqual([]);
  });

  it('respects limit parameter', async () => {
    const results = await hybridRetriever.retrieve('return policy', { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('filters by brand when specified', async () => {
    const results = await hybridRetriever.retrieve('moisturizer ingredients', { brand: 'CD', limit: 5 });
    
    const cdChunk = results.find((r) => r.id === 'chunk-006');
    expect(cdChunk).toBeDefined();
  });

  it('returns chunks with required fields', async () => {
    const results = await hybridRetriever.retrieve('shipping', { limit: 1 });
    
    if (results.length > 0) {
      const chunk = results[0]!;
      expect(chunk).toHaveProperty('id');
      expect(chunk).toHaveProperty('title');
      expect(chunk).toHaveProperty('text');
      expect(typeof chunk.id).toBe('string');
      expect(typeof chunk.title).toBe('string');
      expect(typeof chunk.text).toBe('string');
    }
  });

  it('never throws on retrieval', async () => {
    const queries = [
      'normal query',
      'special!@#$%^&*()chars',
      'very '.repeat(100),
      '',
      null as unknown as string,
    ];

    for (const query of queries) {
      await expect(hybridRetriever.retrieve(query ?? '', {})).resolves.not.toThrow();
    }
  });
});
