import express, { type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from './env';
import { errFields, log } from './log';
import { closeDb } from './db/client';
import { migrate } from './db/migrate';
import { ensureSubscriptions, pruneOrphanSubscriptions } from './graph/subscriptions';
import { initDeltaLink } from './ingest/delta';
import { syncMailboxRegistry } from './ingest/mailboxes';
import { startScheduler } from './jobs/scheduler';
import { ingestQueue } from './lib/serial';
import { healthRouter } from './routes/health';
import { notificationsRouter } from './routes/notifications';
import { ticketsRouter } from './routes/tickets';
import { assistRouter } from './routes/assist';
import { kbRouter } from './routes/kb';
import { shopifyRouter } from './routes/shopify';
import { settingsRouter } from './routes/settings';
import { excelRouter } from './routes/excel';

/** Graph notification payloads are small; anything larger is not from Graph. */
const BODY_LIMIT = '1mb';

function requireApiToken(req: Request, res: Response, next: NextFunction) {
  const expected = env.API_AUTH_TOKEN;
  if (!expected) return next();

  const header = req.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // Graph's validation handshake POSTs with an empty body and text/plain, so
  // the JSON parser has to tolerate both rather than 400 on them.
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.text({ limit: BODY_LIMIT, type: 'text/plain' }));

  app.use('/api', healthRouter);
  app.use('/api/graph', notificationsRouter);
  app.use('/api', requireApiToken, ticketsRouter);
  app.use('/api', requireApiToken, assistRouter);
  app.use('/api', requireApiToken, kbRouter);
  app.use('/api', requireApiToken, shopifyRouter);
  app.use('/api', requireApiToken, settingsRouter);
  app.use('/api', requireApiToken, excelRouter);

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

  // Final safety net: an unhandled route error must return JSON and be logged,
  // never leak a stack trace to the caller.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log.error('unhandled request error', errFields(err));
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

type Mailbox = Awaited<ReturnType<typeof syncMailboxRegistry>>[number];

/**
 * Graph-side startup, run after the HTTP listener is up so the validation
 * handshake can be answered. Failures are logged and left to the scheduler to
 * retry — a Graph outage must not stop the Desk from serving what it already has.
 */
async function bootstrapGraph(mailboxes: Mailbox[]): Promise<void> {
  if (env.ENABLE_SUBSCRIPTIONS) {
    await pruneOrphanSubscriptions().catch((e) =>
      log.warn('orphan subscription prune failed', errFields(e)),
    );
    await ensureSubscriptions();
  }

  // Any mailbox without a delta baseline gets one, so the first reconciliation
  // pass has something to compare against.
  for (const mailbox of mailboxes) {
    if (!mailbox.enabled) continue;
    try {
      if (!mailbox.inboxDeltaLink) await initDeltaLink(mailbox, 'inbox');
      if (!mailbox.sentDeltaLink) await initDeltaLink(mailbox, 'sentitems');
    } catch (e) {
      log.error('failed to establish delta baseline', {
        mailbox: mailbox.address,
        ...errFields(e),
      });
    }
  }
}

async function boot() {
  if (env.NODE_ENV === 'production' && !env.API_AUTH_TOKEN) {
    throw new Error(
      'API_AUTH_TOKEN is required in production — the ticket API would otherwise be open to anyone who can reach it.',
    );
  }
  if (!env.API_AUTH_TOKEN) {
    log.warn('API_AUTH_TOKEN is unset — the ticket read API is UNAUTHENTICATED');
  }

  // Local and fast, and the app is useless without them, so these block boot.
  await migrate();

  const mailboxes = await syncMailboxRegistry();
  log.info('mailbox registry synced', {
    count: mailboxes.length,
    brands: mailboxes.map((m) => m.brandCode),
  });

  // Listen BEFORE touching Graph. Creating a subscription makes Graph POST its
  // validation handshake straight back at PUBLIC_BASE_URL, so a server that is
  // still booting can never complete one — the subscription fails, and on a
  // cold start it fails forever. Graph work also retries with backoff, which
  // would otherwise hold the port closed long enough for a container health
  // check to kill the process before it ever came up.
  const server = createApp().listen(env.PORT, () => {
    log.info('anchor desk server listening', {
      port: env.PORT,
      publicBaseUrl: env.PUBLIC_BASE_URL,
      env: env.NODE_ENV,
    });
  });

  const stopScheduler = env.ENABLE_SCHEDULER ? startScheduler() : () => {};
  if (!env.ENABLE_SCHEDULER) log.warn('scheduler disabled — no renewal, no reconciliation');

  // Everything that talks to Graph runs after the port is open, and a failure
  // degrades the service rather than preventing it from starting. The scheduler
  // retries on its own cadence, and /api/health/ingest reports the shortfall.
  void bootstrapGraph(mailboxes).catch((e) => log.error('graph bootstrap failed', errFields(e)));

  const shutdown = (signal: string) => {
    log.info('shutting down', { signal });
    stopScheduler();
    server.close(async () => {
      // Let in-flight ingest finish so a message isn't half-written.
      await ingestQueue.drain().catch(() => {});
      await closeDb().catch(() => {});
      process.exit(0);
    });
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  boot().catch((e) => {
    log.error('boot failed', errFields(e));
    process.exit(1);
  });
}
