import { Router } from 'express';
import { z } from 'zod';
import {
  getKbSettings,
  updateKbSettings,
  isKbConfigured,
  runCrawl,
  indexFixture,
  getKbSources,
  kbQueue,
  isCrawlInProgress,
  clearKbData,
} from '../kb/crawl';
import { getChunkCount } from '../kb/retriever';
import { testSharePointConnection } from '../graph/sharepoint';
import { log } from '../log';

export const kbRouter = Router();

const settingsSchema = z.object({
  siteId: z.string().min(1).nullable().optional(),
  driveId: z.string().min(1).nullable().optional(),
  folderPath: z.string().min(1).optional(),
});

const fixtureSchema = z.object({
  chunks: z.array(
    z.object({
      title: z.string().min(1),
      text: z.string().min(1),
      brandCode: z.string().nullable().optional(),
    }),
  ),
});

/**
 * GET /api/kb/settings - Get KB configuration
 */
kbRouter.get('/kb/settings', async (_req, res) => {
  try {
    const settings = await getKbSettings();
    res.json({
      siteId: settings.siteId,
      driveId: settings.driveId,
      folderPath: settings.folderPath,
      lastCrawlAt: settings.lastCrawlAt?.toISOString() ?? null,
      crawlStatus: settings.crawlStatus,
      crawlError: settings.crawlError,
    });
  } catch (e) {
    log.error('failed to get kb settings', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * PUT /api/kb/settings - Update KB configuration
 */
kbRouter.put('/kb/settings', async (req, res) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation_error', details: parsed.error.issues });
      return;
    }

    const { siteId, driveId, folderPath } = parsed.data;

    if (siteId && driveId) {
      const testResult = await testSharePointConnection(siteId, driveId);
      if (!testResult.ok) {
        res.status(400).json({
          error: 'sharepoint_connection_failed',
          message: testResult.error,
        });
        return;
      }
    }

    await updateKbSettings({
      siteId: siteId !== undefined ? siteId : undefined,
      driveId: driveId !== undefined ? driveId : undefined,
      folderPath: folderPath !== undefined ? folderPath : undefined,
    });

    const settings = await getKbSettings();
    res.json({
      siteId: settings.siteId,
      driveId: settings.driveId,
      folderPath: settings.folderPath,
      lastCrawlAt: settings.lastCrawlAt?.toISOString() ?? null,
      crawlStatus: settings.crawlStatus,
      crawlError: settings.crawlError,
    });
  } catch (e) {
    log.error('failed to update kb settings', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/kb/sources - List indexed sources
 */
kbRouter.get('/kb/sources', async (_req, res) => {
  try {
    const sources = await getKbSources();
    const totalChunks = sources.reduce((sum, s) => sum + s.chunkCount, 0);
    res.json({
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        path: s.path,
        chunkCount: s.chunkCount,
        indexedAt: s.indexedAt?.toISOString() ?? null,
        brandCode: s.brandCode,
      })),
      totalSources: sources.length,
      totalChunks,
    });
  } catch (e) {
    log.error('failed to get kb sources', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /api/kb/reindex - Trigger a KB re-index
 */
kbRouter.post('/kb/reindex', async (req, res) => {
  try {
    const configured = await isKbConfigured();
    if (!configured) {
      res.status(409).json({ error: 'kb_site_unconfigured' });
      return;
    }

    if (isCrawlInProgress()) {
      res.status(409).json({ error: 'crawl_in_progress' });
      return;
    }

    const brandCode = typeof req.body?.brandCode === 'string' ? req.body.brandCode : null;

    kbQueue.push(() => runCrawl(brandCode));

    res.status(202).json({ status: 'crawl_started' });
  } catch (e) {
    log.error('failed to start reindex', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /api/kb/index-fixture - Index test fixture data
 */
kbRouter.post('/kb/index-fixture', async (req, res) => {
  try {
    const parsed = fixtureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation_error', details: parsed.error.issues });
      return;
    }

    const result = await indexFixture(parsed.data.chunks);
    res.json({
      ok: true,
      chunksCreated: result.chunksCreated,
    });
  } catch (e) {
    log.error('failed to index fixture', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * DELETE /api/kb/data - Clear all KB data (for tests)
 */
kbRouter.delete('/kb/data', async (_req, res) => {
  try {
    await clearKbData();
    res.json({ ok: true });
  } catch (e) {
    log.error('failed to clear kb data', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/health/kb - KB health check
 */
kbRouter.get('/health/kb', async (_req, res) => {
  try {
    const configured = await isKbConfigured();
    const chunkCount = await getChunkCount();
    const settings = await getKbSettings();

    const problems: string[] = [];
    if (!configured) problems.push('kb_site_unconfigured');
    if (chunkCount === 0 && configured) problems.push('no_indexed_chunks');
    if (settings.crawlStatus === 'failed') problems.push('last_crawl_failed');

    res.json({
      ok: problems.length === 0,
      configured,
      chunkCount,
      lastCrawlAt: settings.lastCrawlAt?.toISOString() ?? null,
      crawlStatus: settings.crawlStatus,
      problems,
    });
  } catch (e) {
    log.error('kb health check failed', { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});
