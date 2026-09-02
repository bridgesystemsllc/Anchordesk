/**
 * AI assist features: summarize, policy check, similar tickets.
 */

import { and, desc, eq, ne, ilike, or } from 'drizzle-orm';
import { db } from '../db/client';
import { csMessages, csTickets } from '../db/schema';
import { AiError, callAnthropic, isAiConfigured } from './anthropic';
import { calculateCost } from './cost';
import { recordRun } from './runs';
import { assembleDraftContext } from './context';
import { retriever } from './retriever';
import { SUMMARIZE_SYSTEM_PROMPT, buildSummarizeUserContent } from './prompts/summarize';
import { buildPolicySystemPrompt, buildPolicyUserContent } from './prompts/policy';
import { env } from '../env';
import { log } from '../log';

const ASSIST_TIMEOUT_MS = 20_000;
const SUMMARIZE_MAX_TOKENS = 400;
const POLICY_MAX_TOKENS = 600;

export class AssistError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'empty_thread' | 'ai_unconfigured' | 'timeout' | 'unauthorized' | 'upstream' | 'parse',
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'AssistError';
  }
}

export interface SummarizeResult {
  bullets: string[];
  run: { id: string; costUsd: number; latencyMs: number };
}

export async function summarizeThread(ticketId: string): Promise<SummarizeResult> {
  const model = env.ANTHROPIC_MODEL;

  const [ticket] = await db
    .select({ id: csTickets.id })
    .from(csTickets)
    .where(eq(csTickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    throw new AssistError('Ticket not found', 'not_found', 404);
  }

  if (!isAiConfigured()) {
    await recordRun({
      ticketId,
      kind: 'summarize',
      model: 'none',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      ok: false,
      error: 'unconfigured',
    });
    throw new AssistError(
      'AI is not configured or the key was rejected. Check ANTHROPIC_API_KEY.',
      'ai_unconfigured',
      503,
    );
  }

  const ctx = await assembleDraftContext(ticketId);
  if (!ctx) {
    throw new AssistError('Ticket not found', 'not_found', 404);
  }

  const hasInbound = ctx.thread.some((m) => m.direction === 'inbound');
  if (!hasInbound) {
    throw new AssistError(
      'Nothing to summarize — this ticket has no customer mail.',
      'empty_thread',
      422,
    );
  }

  try {
    const response = await callAnthropic({
      system: SUMMARIZE_SYSTEM_PROMPT,
      userContent: buildSummarizeUserContent(ctx),
      maxTokens: SUMMARIZE_MAX_TOKENS,
      timeoutMs: ASSIST_TIMEOUT_MS,
    });

    let bullets: string[] = [];
    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]) as { bullets?: unknown };
        if (Array.isArray(data.bullets)) {
          bullets = data.bullets.filter((b): b is string => typeof b === 'string').slice(0, 6);
        }
      }
    } catch {
      throw new AssistError(
        'The model returned an unusable summary. Previous bullets were kept.',
        'parse',
        503,
      );
    }

    if (bullets.length === 0) {
      throw new AssistError(
        'The model returned an unusable summary. Previous bullets were kept.',
        'parse',
        503,
      );
    }

    await db
      .update(csTickets)
      .set({ aiSummary: bullets, updatedAt: new Date() })
      .where(eq(csTickets.id, ticketId));

    const runId = await recordRun({
      ticketId,
      kind: 'summarize',
      model,
      promptTokens: response.inputTokens,
      completionTokens: response.outputTokens,
      costUsd: calculateCost(model, response.inputTokens, response.outputTokens),
      latencyMs: response.latencyMs,
      ok: true,
    });

    log.debug('thread summarized', { ticketId, bulletCount: bullets.length, latencyMs: response.latencyMs });

    return {
      bullets,
      run: {
        id: runId,
        costUsd: calculateCost(model, response.inputTokens, response.outputTokens),
        latencyMs: response.latencyMs,
      },
    };
  } catch (e) {
    if (e instanceof AssistError) throw e;

    const errorCode = e instanceof AiError ? e.code : 'upstream';
    const message =
      errorCode === 'timeout'
        ? 'The model timed out after 20s. Previous bullets were kept.'
        : errorCode === 'unauthorized'
          ? 'AI is not configured or the key was rejected. Check ANTHROPIC_API_KEY.'
          : 'The model returned an unusable summary. Previous bullets were kept.';

    throw new AssistError(message, errorCode as AssistError['code'], errorCode === 'timeout' ? 504 : 503);
  }
}

export interface PolicyHit {
  title: string;
  text: string;
  chunkId: string;
}

export interface PolicyCheckResult {
  hits: PolicyHit[];
  emptyReason?: 'no_chunks';
  run?: { id: string; costUsd: number; latencyMs: number };
}

export async function checkPolicy(ticketId: string): Promise<PolicyCheckResult> {
  const model = env.ANTHROPIC_MODEL;

  const [ticket] = await db
    .select({
      id: csTickets.id,
      subject: csTickets.subject,
      brandId: csTickets.brandId,
    })
    .from(csTickets)
    .where(eq(csTickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    throw new AssistError('Ticket not found', 'not_found', 404);
  }

  const [lastInbound] = await db
    .select({ bodyText: csMessages.bodyText })
    .from(csMessages)
    .where(
      and(
        eq(csMessages.ticketId, ticketId),
        eq(csMessages.direction, 'inbound'),
        eq(csMessages.isDraft, false),
      ),
    )
    .orderBy(desc(csMessages.sentAt))
    .limit(1);

  const query = `${ticket.subject ?? ''} ${lastInbound?.bodyText ?? ''}`.trim();
  const chunks = await retriever.retrieve(query, { brandCode: ticket.brandId, limit: 6 });

  if (chunks.length === 0) {
    const runId = await recordRun({
      ticketId,
      kind: 'policy_check',
      model: 'none',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      ok: true,
    });

    return { hits: [], emptyReason: 'no_chunks', run: { id: runId, costUsd: 0, latencyMs: 0 } };
  }

  if (!isAiConfigured()) {
    await recordRun({
      ticketId,
      kind: 'policy_check',
      model: 'none',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      ok: false,
      error: 'unconfigured',
    });
    throw new AssistError(
      'AI is not configured or the key was rejected. Check ANTHROPIC_API_KEY.',
      'ai_unconfigured',
      503,
    );
  }

  try {
    const response = await callAnthropic({
      system: buildPolicySystemPrompt(chunks),
      userContent: buildPolicyUserContent(ticket.subject ?? '', lastInbound?.bodyText ?? ''),
      maxTokens: POLICY_MAX_TOKENS,
      timeoutMs: ASSIST_TIMEOUT_MS,
    });

    let hits: PolicyHit[] = [];
    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]) as { hits?: unknown[] };
        if (Array.isArray(data.hits)) {
          const chunkIds = new Set(chunks.map((c) => c.id));
          hits = data.hits
            .filter(
              (h): h is { title: string; text: string; chunkId: string } =>
                typeof h === 'object' &&
                h !== null &&
                typeof (h as Record<string, unknown>).title === 'string' &&
                typeof (h as Record<string, unknown>).text === 'string' &&
                typeof (h as Record<string, unknown>).chunkId === 'string' &&
                chunkIds.has((h as Record<string, unknown>).chunkId as string),
            )
            .map((h) => ({ title: h.title, text: h.text, chunkId: h.chunkId }));
        }
      }
    } catch {
      throw new AssistError(
        'The model returned an unusable response. Previous hits were kept.',
        'parse',
        503,
      );
    }

    await db
      .update(csTickets)
      .set({ policyHits: hits, updatedAt: new Date() })
      .where(eq(csTickets.id, ticketId));

    const runId = await recordRun({
      ticketId,
      kind: 'policy_check',
      model,
      promptTokens: response.inputTokens,
      completionTokens: response.outputTokens,
      costUsd: calculateCost(model, response.inputTokens, response.outputTokens),
      latencyMs: response.latencyMs,
      ok: true,
    });

    log.debug('policy checked', { ticketId, hitCount: hits.length, latencyMs: response.latencyMs });

    return {
      hits,
      run: {
        id: runId,
        costUsd: calculateCost(model, response.inputTokens, response.outputTokens),
        latencyMs: response.latencyMs,
      },
    };
  } catch (e) {
    if (e instanceof AssistError) throw e;

    const errorCode = e instanceof AiError ? e.code : 'upstream';
    const message =
      errorCode === 'timeout'
        ? 'The model timed out after 20s. Previous hits were kept.'
        : errorCode === 'unauthorized'
          ? 'AI is not configured or the key was rejected. Check ANTHROPIC_API_KEY.'
          : 'The model returned an unusable response. Previous hits were kept.';

    throw new AssistError(message, errorCode as AssistError['code'], errorCode === 'timeout' ? 504 : 503);
  }
}

export interface SimilarTicket {
  id: string;
  number: number;
  subject: string;
  brand: string;
  createdAt: Date;
}

export async function findSimilarTickets(ticketId: string): Promise<SimilarTicket[]> {
  const [ticket] = await db
    .select({
      id: csTickets.id,
      subject: csTickets.subject,
      brandId: csTickets.brandId,
    })
    .from(csTickets)
    .where(eq(csTickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    return [];
  }

  const subject = ticket.subject ?? '';
  const words = subject
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);

  if (words.length === 0) {
    return [];
  }

  const likeConditions = words.map((w) => ilike(csTickets.subject, `%${w}%`));

  const similar = await db
    .select({
      id: csTickets.id,
      number: csTickets.number,
      subject: csTickets.subject,
      brandId: csTickets.brandId,
      createdAt: csTickets.createdAt,
    })
    .from(csTickets)
    .where(
      and(
        eq(csTickets.brandId, ticket.brandId),
        ne(csTickets.id, ticketId),
        or(...likeConditions),
      ),
    )
    .orderBy(desc(csTickets.updatedAt))
    .limit(5);

  return similar.map((t) => ({
    id: t.id,
    number: t.number,
    subject: t.subject ?? '(no subject)',
    brand: t.brandId,
    createdAt: t.createdAt,
  }));
}

export async function findSimilarTicketsAndRecord(ticketId: string): Promise<{
  similar: SimilarTicket[];
  run: { id: string; costUsd: number; latencyMs: number };
}> {
  const start = Date.now();
  const similar = await findSimilarTickets(ticketId);
  const latencyMs = Date.now() - start;

  const runId = await recordRun({
    ticketId,
    kind: 'similar',
    model: 'fts',
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    latencyMs,
    ok: true,
  });

  return {
    similar,
    run: { id: runId, costUsd: 0, latencyMs },
  };
}
