/**
 * Knowledge base crawling and indexing.
 * Crawls SharePoint documents, chunks them, and creates embeddings.
 * Uses kbQueue (SerialQueue) to serialize crawl operations.
 */

import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { csKbChunks, csKbSources, csSettings } from '../db/schema';
import { listDriveItems, getDocumentContent, type DriveItem } from '../graph/sharepoint';
import { getEmbedder } from './embeddings';
import { SerialQueue } from '../lib/serial';
import { errFields, log } from '../log';

export const kbQueue = new SerialQueue('kb');

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS_PER_DOC = 50;

export type CrawlStatus = 'idle' | 'crawling' | 'failed';

export interface CrawlResult {
  ok: boolean;
  sourcesProcessed: number;
  chunksCreated: number;
  error?: string;
}

let crawlInProgress = false;

/**
 * Check if a crawl is currently in progress.
 */
export function isCrawlInProgress(): boolean {
  return crawlInProgress;
}

/**
 * Get current KB settings.
 */
export async function getKbSettings(): Promise<{
  siteId: string | null;
  driveId: string | null;
  folderPath: string;
  lastCrawlAt: Date | null;
  crawlStatus: CrawlStatus;
  crawlError: string | null;
}> {
  const result = await db
    .select({
      siteId: csSettings.kbSiteId,
      driveId: csSettings.kbDriveId,
      folderPath: csSettings.kbFolderPath,
      lastCrawlAt: csSettings.kbLastCrawlAt,
      crawlStatus: csSettings.kbCrawlStatus,
      crawlError: csSettings.kbCrawlError,
    })
    .from(csSettings)
    .where(eq(csSettings.id, 1))
    .limit(1);

  const row = result[0];
  return {
    siteId: row?.siteId ?? null,
    driveId: row?.driveId ?? null,
    folderPath: row?.folderPath ?? '/',
    lastCrawlAt: row?.lastCrawlAt ?? null,
    crawlStatus: (row?.crawlStatus as CrawlStatus) ?? 'idle',
    crawlError: row?.crawlError ?? null,
  };
}

/**
 * Update KB settings.
 */
export async function updateKbSettings(settings: {
  siteId?: string | null;
  driveId?: string | null;
  folderPath?: string;
}): Promise<void> {
  await db
    .update(csSettings)
    .set({
      kbSiteId: settings.siteId,
      kbDriveId: settings.driveId,
      kbFolderPath: settings.folderPath,
      updatedAt: new Date(),
    })
    .where(eq(csSettings.id, 1));
}

/**
 * Check if KB is configured (has site and drive IDs).
 */
export async function isKbConfigured(): Promise<boolean> {
  const settings = await getKbSettings();
  return Boolean(settings.siteId && settings.driveId);
}

/**
 * Split text into overlapping chunks.
 */
function chunkText(text: string, title: string): Array<{ title: string; text: string }> {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const chunks: Array<{ title: string; text: string }> = [];
  let start = 0;

  while (start < cleaned.length && chunks.length < MAX_CHUNKS_PER_DOC) {
    const end = Math.min(start + CHUNK_SIZE, cleaned.length);
    let chunkEnd = end;

    if (end < cleaned.length) {
      const lastSentence = cleaned.lastIndexOf('. ', end);
      const lastNewline = cleaned.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastSentence, lastNewline);
      if (breakPoint > start + CHUNK_SIZE / 2) {
        chunkEnd = breakPoint + 1;
      }
    }

    const chunkText = cleaned.slice(start, chunkEnd).trim();
    if (chunkText) {
      chunks.push({
        title: chunks.length === 0 ? title : `${title} (part ${chunks.length + 1})`,
        text: chunkText,
      });
    }

    start = chunkEnd - CHUNK_OVERLAP;
    if (start >= cleaned.length - CHUNK_OVERLAP) break;
  }

  return chunks;
}

/**
 * Compute checksum for document content.
 */
function computeChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Index a single document: fetch content, chunk, embed, store.
 */
async function indexDocument(
  siteId: string,
  driveId: string,
  item: DriveItem,
  brandCode: string | null,
): Promise<{ chunksCreated: number; skipped: boolean }> {
  const existing = await db
    .select({ id: csKbSources.id, etag: csKbSources.etag, checksum: csKbSources.checksum })
    .from(csKbSources)
    .where(eq(csKbSources.driveItemId, item.id))
    .limit(1);

  const content = await getDocumentContent(siteId, driveId, item.id);
  if (!content.trim()) {
    log.debug('document has no content, skipping', { itemId: item.id, name: item.name });
    return { chunksCreated: 0, skipped: true };
  }

  const checksum = computeChecksum(content);

  if (existing[0] && existing[0].etag === item.eTag && existing[0].checksum === checksum) {
    log.debug('document unchanged, skipping', { itemId: item.id, name: item.name });
    return { chunksCreated: 0, skipped: true };
  }

  const chunks = chunkText(content, item.name);
  if (chunks.length === 0) {
    return { chunksCreated: 0, skipped: true };
  }

  const embedder = getEmbedder();
  const texts = chunks.map((c) => `${c.title}\n\n${c.text}`);
  const embeddings = await embedder.embed(texts);

  const parentPath = item.parentReference?.path?.replace(/^\/drive\/root:?/, '') ?? '';
  const fullPath = parentPath ? `${parentPath}/${item.name}` : `/${item.name}`;

  await db.transaction(async (tx) => {
    if (existing[0]) {
      await tx.delete(csKbChunks).where(eq(csKbChunks.sourceId, existing[0].id));
      await tx
        .update(csKbSources)
        .set({
          name: item.name,
          path: fullPath,
          mimeType: item.file?.mimeType,
          sizeBytes: item.size,
          etag: item.eTag,
          checksum,
          brandCode,
          indexedAt: new Date(),
          lastModified: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
          updatedAt: new Date(),
        })
        .where(eq(csKbSources.id, existing[0].id));

      for (let i = 0; i < chunks.length; i++) {
        await tx.insert(csKbChunks).values({
          sourceId: existing[0].id,
          chunkIndex: i,
          title: chunks[i]!.title,
          text: chunks[i]!.text,
          brandCode,
          embedding: embeddings[i] ?? null,
          tokens: Math.ceil(chunks[i]!.text.length / 4),
        });
      }
    } else {
      const [source] = await tx
        .insert(csKbSources)
        .values({
          driveItemId: item.id,
          name: item.name,
          path: fullPath,
          mimeType: item.file?.mimeType,
          sizeBytes: item.size,
          etag: item.eTag,
          checksum,
          brandCode,
          indexedAt: new Date(),
          lastModified: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
        })
        .returning({ id: csKbSources.id });

      for (let i = 0; i < chunks.length; i++) {
        await tx.insert(csKbChunks).values({
          sourceId: source!.id,
          chunkIndex: i,
          title: chunks[i]!.title,
          text: chunks[i]!.text,
          brandCode,
          embedding: embeddings[i] ?? null,
          tokens: Math.ceil(chunks[i]!.text.length / 4),
        });
      }
    }
  });

  log.debug('indexed document', { itemId: item.id, name: item.name, chunks: chunks.length });
  return { chunksCreated: chunks.length, skipped: false };
}

/**
 * Run a full KB crawl. Must be called via kbQueue to serialize.
 */
export async function runCrawl(brandCode: string | null = null): Promise<CrawlResult> {
  if (crawlInProgress) {
    return { ok: false, sourcesProcessed: 0, chunksCreated: 0, error: 'crawl_in_progress' };
  }

  const settings = await getKbSettings();
  if (!settings.siteId || !settings.driveId) {
    return { ok: false, sourcesProcessed: 0, chunksCreated: 0, error: 'kb_site_unconfigured' };
  }

  crawlInProgress = true;
  await db
    .update(csSettings)
    .set({ kbCrawlStatus: 'crawling', kbCrawlError: null, updatedAt: new Date() })
    .where(eq(csSettings.id, 1));

  let sourcesProcessed = 0;
  let chunksCreated = 0;

  try {
    const items = await listDriveItems(settings.siteId, settings.driveId, settings.folderPath);

    for (const item of items) {
      try {
        const result = await indexDocument(settings.siteId, settings.driveId, item, brandCode);
        if (!result.skipped) sourcesProcessed++;
        chunksCreated += result.chunksCreated;
      } catch (e) {
        log.warn('failed to index document', { itemId: item.id, name: item.name, ...errFields(e) });
      }
    }

    await db
      .update(csSettings)
      .set({
        kbCrawlStatus: 'idle',
        kbLastCrawlAt: new Date(),
        kbCrawlError: null,
        updatedAt: new Date(),
      })
      .where(eq(csSettings.id, 1));

    log.info('kb crawl completed', { sourcesProcessed, chunksCreated });
    return { ok: true, sourcesProcessed, chunksCreated };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db
      .update(csSettings)
      .set({ kbCrawlStatus: 'failed', kbCrawlError: error, updatedAt: new Date() })
      .where(eq(csSettings.id, 1));

    log.error('kb crawl failed', errFields(e));
    return { ok: false, sourcesProcessed, chunksCreated, error };
  } finally {
    crawlInProgress = false;
  }
}

/**
 * Index a fixture (synthetic test data) directly.
 */
export async function indexFixture(
  chunks: Array<{ title: string; text: string; brandCode?: string | null }>,
): Promise<{ chunksCreated: number }> {
  if (chunks.length === 0) return { chunksCreated: 0 };

  const embedder = getEmbedder();
  const texts = chunks.map((c) => `${c.title}\n\n${c.text}`);
  const embeddings = await embedder.embed(texts);

  const [source] = await db
    .insert(csKbSources)
    .values({
      driveItemId: `fixture-${Date.now()}`,
      name: 'Test Fixture',
      path: '/fixtures',
      mimeType: 'text/plain',
      indexedAt: new Date(),
    })
    .returning({ id: csKbSources.id });

  for (let i = 0; i < chunks.length; i++) {
    await db.insert(csKbChunks).values({
      sourceId: source!.id,
      chunkIndex: i,
      title: chunks[i]!.title,
      text: chunks[i]!.text,
      brandCode: chunks[i]!.brandCode ?? null,
      embedding: embeddings[i] ?? null,
      tokens: Math.ceil(chunks[i]!.text.length / 4),
    });
  }

  return { chunksCreated: chunks.length };
}

/**
 * Clear all KB data (sources and chunks).
 */
export async function clearKbData(): Promise<void> {
  await db.delete(csKbChunks);
  await db.delete(csKbSources);
  log.info('cleared all kb data');
}

/**
 * Get KB sources with chunk counts.
 */
export async function getKbSources(): Promise<
  Array<{
    id: string;
    name: string;
    path: string;
    chunkCount: number;
    indexedAt: Date | null;
    brandCode: string | null;
  }>
> {
  const results = await db.execute<{
    id: string;
    name: string;
    path: string;
    chunk_count: string;
    indexed_at: Date | null;
    brand_code: string | null;
  }>(sql`
    SELECT 
      s.id,
      s.name,
      s.path,
      COUNT(c.id)::text as chunk_count,
      s.indexed_at,
      s.brand_code
    FROM cs_kb_sources s
    LEFT JOIN cs_kb_chunks c ON c.source_id = s.id
    GROUP BY s.id
    ORDER BY s.indexed_at DESC NULLS LAST
  `);

  return results.rows.map((row) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    chunkCount: parseInt(row.chunk_count, 10),
    indexedAt: row.indexed_at,
    brandCode: row.brand_code,
  }));
}
