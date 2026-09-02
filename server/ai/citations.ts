/**
 * Citation enforcement for AI drafts.
 * Every factual sentence must cite a retrieved chunk or order field.
 */

import type { KbChunk } from './retriever';
import type { OrderContext } from './context';

export interface Citation {
  n: number;
  label: string;
  source: string;
  snippet: string;
  sentence?: string;
}

export interface EnforceResult {
  items: Citation[];
  uncited: string[];
  blocked: boolean;
}

const PHATIC_PATTERNS = [
  /^(hi|hello|hey)\b/i,
  /thank you|thanks/i,
  /i('m| am) sorry|apolog/i,
  /let me (look|check|help)/i,
  /please let me know/i,
  /best regards|sincerely|the .+ (care|support) team/i,
];

const FACTUAL_KEYWORDS =
  /\b(refund|return|replac|ship|track|deliver|policy|window|warranty|sku|order|ingredient|shade|spf|pump|compact|eta|carrier|fulfill)\b/i;

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter((s) => s.length > 0);
}

function isPhatic(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  if (sentence.length < 12) return true;
  return PHATIC_PATTERNS.some((p) => p.test(lower));
}

function isFactual(sentence: string): boolean {
  if (isPhatic(sentence)) return false;
  return /\d/.test(sentence) || FACTUAL_KEYWORDS.test(sentence);
}

function resolveOrderPath(order: OrderContext | null, path: string): string | null {
  if (!order) return null;
  const parts = path.split('.');
  if (parts[0] !== 'order' || parts.length < 2) return null;

  const field = parts[1] as keyof OrderContext;
  const value = order[field];
  return value != null ? String(value) : null;
}

function isValidSource(
  source: string,
  chunks: KbChunk[],
  order: OrderContext | null,
): boolean {
  if (source.startsWith('order.')) {
    return resolveOrderPath(order, source) !== null;
  }
  if (source.startsWith('chunk:')) {
    const chunkId = source.slice(6);
    return chunks.some((c) => c.id === chunkId);
  }
  return false;
}

export function enforceCitations(
  text: string,
  citations: Citation[],
  context: { chunks: KbChunk[]; order: OrderContext | null },
): EnforceResult {
  const sentences = splitSentences(text);
  const factualSentences = sentences.filter(isFactual);

  const validCitations = citations.filter((c) =>
    isValidSource(c.source, context.chunks, context.order),
  );

  const citedSentences = new Set<string>();
  for (const citation of validCitations) {
    if (citation.sentence) {
      citedSentences.add(citation.sentence.trim().replace(/\s+/g, ' '));
    }
  }

  const citationBySentenceIndex = new Map<number, Citation>();
  for (const citation of validCitations) {
    if (citation.n > 0 && citation.n <= factualSentences.length) {
      citationBySentenceIndex.set(citation.n - 1, citation);
    }
  }

  const uncited: string[] = [];
  for (let i = 0; i < factualSentences.length; i++) {
    const sentence = factualSentences[i]!;
    const hasCitationByN = citationBySentenceIndex.has(i);
    const hasCitationBySentence = citedSentences.has(sentence);
    if (!hasCitationByN && !hasCitationBySentence) {
      uncited.push(sentence);
    }
  }

  return {
    items: validCitations,
    uncited,
    blocked: uncited.length > 0,
  };
}

export function parseCitationsJson(
  json: unknown,
): Citation[] {
  if (!json || typeof json !== 'object') return [];

  const arr = Array.isArray(json)
    ? json
    : 'citations' in json && Array.isArray((json as { citations?: unknown }).citations)
      ? (json as { citations: unknown[] }).citations
      : [];

  return arr
    .filter(
      (c): c is { n: number; label: string; source: string; snippet: string; sentence?: string } =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as Record<string, unknown>).n === 'number' &&
        typeof (c as Record<string, unknown>).label === 'string' &&
        typeof (c as Record<string, unknown>).source === 'string' &&
        typeof (c as Record<string, unknown>).snippet === 'string',
    )
    .map((c) => ({
      n: c.n,
      label: c.label,
      source: c.source,
      snippet: c.snippet,
      sentence: typeof c.sentence === 'string' ? c.sentence : undefined,
    }));
}
