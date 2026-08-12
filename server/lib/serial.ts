import { errFields, log } from '../log';

/**
 * Runs tasks one at a time in submission order.
 *
 * Webhook bursts and the reconciliation timer both write the same tickets. Left
 * concurrent they contend on the per-conversation advisory lock and multiply
 * Graph calls for no gain; serialised, ingest stays predictable and ordered.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private depth = 0;

  constructor(private readonly name: string) {}

  get pending(): number {
    return this.depth;
  }

  push<T>(task: () => Promise<T>): Promise<T | undefined> {
    this.depth++;
    const run = this.tail.then(async () => {
      try {
        return await task();
      } catch (e) {
        // A failed task must not poison the chain for everything behind it.
        log.error(`${this.name} queue task failed`, errFields(e));
        return undefined;
      } finally {
        this.depth--;
      }
    });
    this.tail = run;
    return run;
  }

  /** Resolves once everything queued so far has settled. */
  async drain(): Promise<void> {
    await this.tail;
  }
}

export const ingestQueue = new SerialQueue('ingest');
