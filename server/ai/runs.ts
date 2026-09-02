/**
 * Records AI model runs to cs_ai_runs.
 * Never stores email bodies, prompts, completions, or API keys.
 */

import { db } from '../db/client';
import { csAiRuns } from '../db/schema';
import { env } from '../env';
import { log } from '../log';

export type AiRunKind = 'triage' | 'draft' | 'summarize' | 'policy_check' | 'similar';

export interface RecordRunInput {
  ticketId: string;
  kind: AiRunKind;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

function sanitizeError(error: string | undefined): string | undefined {
  if (!error) return undefined;

  let sanitized = error.slice(0, 500);

  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey && sanitized.includes(apiKey)) {
    sanitized = sanitized.replaceAll(apiKey, '[REDACTED]');
  }

  return sanitized;
}

export async function recordRun(input: RecordRunInput): Promise<string> {
  const [row] = await db
    .insert(csAiRuns)
    .values({
      ticketId: input.ticketId,
      kind: input.kind,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      costUsd: String(input.costUsd),
      latencyMs: input.latencyMs,
      ok: input.ok,
      error: sanitizeError(input.error),
    })
    .returning({ id: csAiRuns.id });

  if (!row) {
    log.error('failed to record ai run', { ticketId: input.ticketId, kind: input.kind });
    throw new Error('Failed to record AI run');
  }

  log.debug('ai run recorded', {
    runId: row.id,
    ticketId: input.ticketId,
    kind: input.kind,
    model: input.model,
    latencyMs: input.latencyMs,
    ok: input.ok,
    costUsd: input.costUsd,
  });

  return row.id;
}
