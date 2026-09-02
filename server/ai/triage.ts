/**
 * AI-powered triage that overlays model results on ticket columns.
 * Falls back to rule-based triage on timeout/error.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { csTickets } from '../db/schema';
import { AiError, callAnthropic, isAiConfigured } from './anthropic';
import { calculateCost } from './cost';
import { recordRun } from './runs';
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserContent, type TriageInput } from './prompts/triage';
import { slaDueAt, type Intent, type Priority } from '../ingest/triage';
import { env } from '../env';
import { log } from '../log';

const TRIAGE_TIMEOUT_MS = 12_000;
const TRIAGE_MAX_TOKENS = 300;

const VALID_INTENTS = new Set<Intent>([
  'wismo',
  'return',
  'refund',
  'damage',
  'product_q',
  'supervisor',
  'other',
]);

interface TriageResult {
  intent: Intent;
  sentiment: number;
  priority: Priority;
  orderNumber: string | null;
  suggestedOwner: string | null;
}

function parseTriageResponse(text: string): TriageResult | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const intent = String(data.intent ?? 'other');
    if (!VALID_INTENTS.has(intent as Intent)) return null;

    let sentiment = Number(data.sentiment ?? 0);
    if (!Number.isFinite(sentiment)) sentiment = 0;
    sentiment = Math.max(-1, Math.min(1, sentiment));

    let priority = Number(data.priority ?? 3);
    if (![1, 2, 3, 4].includes(priority)) priority = 3;

    const orderNumber =
      typeof data.orderNumber === 'string' && data.orderNumber.length > 0
        ? data.orderNumber
        : null;

    const suggestedOwner =
      typeof data.suggestedOwner === 'string' && data.suggestedOwner.length > 0
        ? data.suggestedOwner
        : null;

    if (intent === 'supervisor') {
      return {
        intent: 'supervisor',
        sentiment,
        priority: 1,
        orderNumber,
        suggestedOwner: 'supervisor',
      };
    }

    return {
      intent: intent as Intent,
      sentiment,
      priority: priority as Priority,
      orderNumber,
      suggestedOwner,
    };
  } catch {
    return null;
  }
}

export interface ApplyAiTriageInput {
  ticketId: string;
  subject: string;
  bodyText: string;
  brandCode: string;
  vip: boolean;
  orderNumberHint: string | null;
  ticketCreatedAt: Date;
}

export async function applyAiTriage(input: ApplyAiTriageInput): Promise<void> {
  const { ticketId, ticketCreatedAt } = input;
  const model = env.ANTHROPIC_MODEL;

  if (!isAiConfigured()) {
    await recordRun({
      ticketId,
      kind: 'triage',
      model: 'none',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      ok: false,
      error: 'unconfigured',
    });
    return;
  }

  const triageInput: TriageInput = {
    subject: input.subject,
    body: input.bodyText,
    brandCode: input.brandCode,
    vip: input.vip,
    orderNumberHint: input.orderNumberHint,
  };

  const start = Date.now();

  try {
    const response = await callAnthropic({
      system: TRIAGE_SYSTEM_PROMPT,
      userContent: buildTriageUserContent(triageInput),
      maxTokens: TRIAGE_MAX_TOKENS,
      timeoutMs: TRIAGE_TIMEOUT_MS,
    });

    const parsed = parseTriageResponse(response.text);
    if (!parsed) {
      log.warn('ai triage parse failed', { ticketId, model });
      await recordRun({
        ticketId,
        kind: 'triage',
        model,
        promptTokens: response.inputTokens,
        completionTokens: response.outputTokens,
        costUsd: calculateCost(model, response.inputTokens, response.outputTokens),
        latencyMs: response.latencyMs,
        ok: false,
        error: 'parse',
      });
      return;
    }

    const patch: Partial<typeof csTickets.$inferInsert> = {
      intent: parsed.intent,
      sentiment: parsed.sentiment,
      priority: parsed.priority,
      updatedAt: new Date(),
    };

    if (parsed.orderNumber) {
      patch.orderNumber = parsed.orderNumber;
    }

    if (parsed.suggestedOwner === 'supervisor') {
      patch.assigneeId = 'supervisor';
    }

    const [ticket] = await db
      .select({ priority: csTickets.priority })
      .from(csTickets)
      .where(eq(csTickets.id, ticketId))
      .limit(1);

    if (ticket && parsed.priority !== ticket.priority) {
      patch.slaDueAt = slaDueAt(parsed.priority, ticketCreatedAt);
    }

    await db.update(csTickets).set(patch).where(eq(csTickets.id, ticketId));

    await recordRun({
      ticketId,
      kind: 'triage',
      model,
      promptTokens: response.inputTokens,
      completionTokens: response.outputTokens,
      costUsd: calculateCost(model, response.inputTokens, response.outputTokens),
      latencyMs: response.latencyMs,
      ok: true,
    });

    log.debug('ai triage applied', {
      ticketId,
      intent: parsed.intent,
      priority: parsed.priority,
      latencyMs: response.latencyMs,
    });
  } catch (e) {
    const latencyMs = Date.now() - start;
    const errorCode = e instanceof AiError ? e.code : 'upstream';

    await recordRun({
      ticketId,
      kind: 'triage',
      model,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      latencyMs,
      ok: false,
      error: errorCode,
    });

    log.warn('ai triage failed', { ticketId, error: errorCode, latencyMs });
  }
}
