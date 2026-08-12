import { ensureSubscriptions } from '../graph/subscriptions';
import { reconcileAll } from '../ingest/delta';
import { ingestQueue } from '../lib/serial';
import { env } from '../env';
import { errFields, log } from '../log';

type Stop = () => void;

/**
 * Self-rescheduling loop rather than setInterval: the next run is only booked
 * once the previous one finishes, so a slow pass can never stack on itself.
 */
function everyAfterCompletion(name: string, intervalMs: number, task: () => Promise<void>): Stop {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      await task();
    } catch (e) {
      log.error(`${name} job failed`, errFields(e));
    }
    if (stopped) return;
    timer = setTimeout(tick, intervalMs);
    timer.unref();
  };

  timer = setTimeout(tick, intervalMs);
  timer.unref();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export function startScheduler(): Stop {
  const stops: Stop[] = [];

  if (env.ENABLE_SUBSCRIPTIONS) {
    stops.push(
      everyAfterCompletion('subscription-renewal', env.SCHEDULER_INTERVAL_MS, ensureSubscriptions),
    );
    log.info('subscription renewal job started', {
      everyMs: env.SCHEDULER_INTERVAL_MS,
      renewLeadMs: env.SUBSCRIPTION_RENEW_LEAD_MS,
    });
  } else {
    log.warn('subscriptions disabled — relying on delta reconciliation alone');
  }

  stops.push(
    everyAfterCompletion('delta-reconciliation', env.RECONCILE_INTERVAL_MS, async () => {
      // Share the ingest queue so a reconciliation pass never runs concurrently
      // with a webhook burst writing the same threads.
      await ingestQueue.push(() => reconcileAll());
    }),
  );
  log.info('delta reconciliation job started', { everyMs: env.RECONCILE_INTERVAL_MS });

  return () => stops.forEach((stop) => stop());
}
