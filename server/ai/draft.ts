/**
 * AI draft generation for customer replies.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { csMessages, csTickets } from '../db/schema';
import { AiError, callAnthropic, isAiConfigured } from './anthropic';
import { calculateCost } from './cost';
import { recordRun } from './runs';
import { assembleDraftContext } from './context';
import { enforceCitations, parseCitationsJson, type Citation } from './citations';
import { buildDraftSystemPrompt, buildDraftUserContent } from './prompts/draft';
import { env } from '../env';
import { log } from '../log';

const DRAFT_TIMEOUT_MS = 20_000;
const DRAFT_MAX_TOKENS = 1200;

export interface GenerateDraftResult {
  text: string;
  citations: Citation[];
  uncited: string[];
  blocked: boolean;
  neverDeflect: boolean;
  run: { id: string; costUsd: number; latencyMs: number };
}

export class DraftError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_found'
      | 'ticket_closed'
      | 'empty_thread'
      | 'ai_unconfigured'
      | 'timeout'
      | 'unauthorized'
      | 'upstream'
      | 'parse',
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'DraftError';
  }
}

interface DraftResponse {
  text: string;
  citations: Citation[];
}

function parseDraftResponse(text: string): DraftResponse | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    if (typeof data.text !== 'string' || data.text.length === 0) return null;

    const citations = parseCitationsJson(data.citations);

    return { text: data.text, citations };
  } catch {
    return null;
  }
}

export async function generateDraft(ticketId: string): Promise<GenerateDraftResult> {
  const model = env.ANTHROPIC_MODEL;

  const [ticket] = await db
    .select({
      id: csTickets.id,
      status: csTickets.status,
      intent: csTickets.intent,
    })
    .from(csTickets)
    .where(eq(csTickets.id, ticketId))
    .limit(1);

  if (!ticket) {
    throw new DraftError('Ticket not found', 'not_found', 404);
  }

  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    throw new DraftError('This ticket is closed', 'ticket_closed', 409);
  }

  if (!isAiConfigured()) {
    await recordRun({
      ticketId,
      kind: 'draft',
      model: 'none',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      ok: false,
      error: 'unconfigured',
    });
    throw new DraftError(
      'AI is not configured or the key was rejected. Check ANTHROPIC_API_KEY.',
      'ai_unconfigured',
      503,
    );
  }

  const ctx = await assembleDraftContext(ticketId);
  if (!ctx) {
    throw new DraftError('Ticket not found', 'not_found', 404);
  }

  const hasInbound = ctx.thread.some((m) => m.direction === 'inbound');
  if (!hasInbound) {
    throw new DraftError(
      'Nothing to draft from — this ticket has no customer mail.',
      'empty_thread',
      422,
    );
  }

  const neverDeflect = ticket.intent === 'supervisor';

  try {
    const response = await callAnthropic({
      system: buildDraftSystemPrompt(ctx),
      userContent: buildDraftUserContent(ctx),
      maxTokens: DRAFT_MAX_TOKENS,
      timeoutMs: DRAFT_TIMEOUT_MS,
    });

    const parsed = parseDraftResponse(response.text);
    if (!parsed) {
      await recordRun({
        ticketId,
        kind: 'draft',
        model,
        promptTokens: response.inputTokens,
        completionTokens: response.outputTokens,
        costUsd: calculateCost(model, response.inputTokens, response.outputTokens),
        latencyMs: response.latencyMs,
        ok: false,
        error: 'parse',
      });
      throw new DraftError(
        'The model returned an unusable draft. Your previous draft was kept.',
        'parse',
        503,
      );
    }

    const enforceResult = enforceCitations(parsed.text, parsed.citations, {
      chunks: ctx.chunks,
      order: ctx.order,
    });

    await db
      .delete(csMessages)
      .where(
        and(
          eq(csMessages.ticketId, ticketId),
          eq(csMessages.isDraft, true),
          eq(csMessages.draftedByAi, true),
        ),
      );

    await db.insert(csMessages).values({
      ticketId,
      direction: 'outbound',
      isDraft: true,
      draftedByAi: true,
      editedByHuman: false,
      bodyText: parsed.text,
      citations: { items: enforceResult.items },
      authorName: 'Anchor Desk AI',
    });

    const runId = await recordRun({
      ticketId,
      kind: 'draft',
      model,
      promptTokens: response.inputTokens,
      completionTokens: response.outputTokens,
      costUsd: calculateCost(model, response.inputTokens, response.outputTokens),
      latencyMs: response.latencyMs,
      ok: true,
    });

    log.debug('draft generated', {
      ticketId,
      latencyMs: response.latencyMs,
      blocked: enforceResult.blocked,
      uncitedCount: enforceResult.uncited.length,
    });

    return {
      text: parsed.text,
      citations: enforceResult.items,
      uncited: enforceResult.uncited,
      blocked: enforceResult.blocked,
      neverDeflect,
      run: {
        id: runId,
        costUsd: calculateCost(model, response.inputTokens, response.outputTokens),
        latencyMs: response.latencyMs,
      },
    };
  } catch (e) {
    if (e instanceof DraftError) throw e;

    const errorCode = e instanceof AiError ? e.code : 'upstream';
    const httpStatus =
      errorCode === 'timeout' ? 504 : errorCode === 'unauthorized' ? 503 : 503;

    const message =
      errorCode === 'timeout'
        ? 'The model timed out after 20s. Your previous draft was kept.'
        : errorCode === 'unauthorized'
          ? 'AI is not configured or the key was rejected. Check ANTHROPIC_API_KEY.'
          : 'The model returned an unusable draft. Your previous draft was kept.';

    throw new DraftError(message, errorCode as DraftError['code'], httpStatus);
  }
}
