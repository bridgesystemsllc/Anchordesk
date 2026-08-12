import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { enabledMailboxes } from '../ingest/mailboxes';
import { ingestQueue } from '../lib/serial';
import { env } from '../env';
import { errFields, log } from '../log';

export const healthRouter = Router();

/** A mailbox that hasn't synced in this long is a problem worth paging on. */
const STALE_SYNC_MS = 45 * 60_000;

healthRouter.get('/health', async (_req, res) => {
  res.json({ ok: true, service: 'anchor-desk-server', time: new Date().toISOString() });
});

/**
 * Deep health. This is the alerting surface — point the monitor at it and page
 * on a non-200. A subscription that lapses without anyone noticing is the
 * number one way this system stops working silently.
 */
healthRouter.get('/health/ingest', async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (e) {
    log.error('health check: database unreachable', errFields(e));
    res.status(503).json({ ok: false, database: 'unreachable' });
    return;
  }

  const mailboxes = await enabledMailboxes();
  const now = Date.now();

  const detail = mailboxes.map((m) => {
    const expiresInMs = m.subscriptionExpiresAt
      ? m.subscriptionExpiresAt.getTime() - now
      : null;
    const staleMs = m.lastSyncAt ? now - m.lastSyncAt.getTime() : null;

    const problems: string[] = [];
    if (!m.subscriptionId) problems.push('no-subscription');
    if (expiresInMs !== null && expiresInMs <= 0) problems.push('subscription-expired');
    if (staleMs !== null && staleMs > STALE_SYNC_MS) problems.push('sync-stale');
    if (m.lastError) problems.push('last-run-errored');

    return {
      brand: m.brandCode,
      address: m.address,
      subscriptionId: m.subscriptionId,
      subscriptionExpiresAt: m.subscriptionExpiresAt,
      expiresInMinutes: expiresInMs === null ? null : Math.round(expiresInMs / 60_000),
      lastSyncAt: m.lastSyncAt,
      lastError: m.lastError,
      healthy: problems.length === 0,
      problems,
    };
  });

  // With subscriptions disabled (local dev, no public callback URL) a missing
  // subscription is expected and must not read as an outage.
  const unhealthy = detail.filter(
    (d) => !d.healthy && !(!env.ENABLE_SUBSCRIPTIONS && d.problems.every((p) => p.startsWith('no-subscription'))),
  );

  const ok = unhealthy.length === 0;
  res.status(ok ? 200 : 503).json({
    ok,
    mailboxes: detail,
    queueDepth: ingestQueue.pending,
    subscriptionsEnabled: env.ENABLE_SUBSCRIPTIONS,
    schedulerEnabled: env.ENABLE_SCHEDULER,
  });
});
