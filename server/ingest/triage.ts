/**
 * Rule-based triage. Deliberately boring: this exists so the queue self-orders
 * from day one of ingest, and gets replaced by the Claude triage agent on Day
 * 10. Everything here is pure and unit-tested, so swapping in the model is a
 * change of one call site, not a rewrite.
 */

export type Intent = 'wismo' | 'return' | 'refund' | 'damage' | 'product_q' | 'other';
export type Priority = 1 | 2 | 3 | 4;

/** Order-number prefixes per brand, plus the generic fallbacks. */
const BRAND_ORDER_PREFIX: Record<string, string> = {
  CD: 'CD',
  DB: 'DB',
  BOC: 'BX',
  AMBI: 'AM',
  AF: 'AF',
};

const GENERIC_ORDER_PATTERNS: RegExp[] = [
  /\border\s*(?:#|no\.?|number|id)?\s*[:#]?\s*([A-Z]{2,3}-\d{4,10})\b/i,
  /\b([A-Z]{2,3}-\d{4,10})\b/,
  /\border\s*(?:#|no\.?|number|id)\s*[:#]?\s*(\d{5,12})\b/i,
  /#(\d{5,12})\b/,
];

/**
 * Pulls an order number from subject + body. The brand's own prefix is tried
 * first so a Dermablend ticket quoting a friend's `CD-` number still resolves
 * to its own order.
 */
export function extractOrderNumber(text: string, brandCode?: string): string | null {
  const prefix = brandCode ? BRAND_ORDER_PREFIX[brandCode] : undefined;

  if (prefix) {
    const branded = new RegExp(`\\b(${prefix}-\\d{4,10})\\b`, 'i');
    const hit = branded.exec(text);
    if (hit?.[1]) return hit[1].toUpperCase();
  }

  for (const pattern of GENERIC_ORDER_PATTERNS) {
    const hit = pattern.exec(text);
    if (hit?.[1]) return hit[1].toUpperCase();
  }

  return null;
}

const INTENT_KEYWORDS: Record<Exclude<Intent, 'other'>, RegExp[]> = {
  damage: [
    /\b(damaged?|broken|shattered|cracked|leaking|leaked|spilled|dented|melted)\b/i,
    /\b(arrived|came)\s+(in\s+pieces|broken|damaged)\b/i,
    /\b(defect(ive)?|pump (doesn'?t|not|won'?t) (work|dispense))\b/i,
  ],
  refund: [
    /\b(refund|charged twice|double charge[d]?|duplicate charge|money back|reimburse)\b/i,
    /\b(cancel(l)?ed but (still )?(charged|billed)|billed after)\b/i,
    /\b(chargeback|dispute the charge)\b/i,
  ],
  return: [
    /\b(return|send (it )?back|exchange|rma|wrong (item|shade|colou?r|product)|mis-?pick)\b/i,
    /\b(doesn'?t (fit|suit|work for me)|broke me out)\b/i,
  ],
  wismo: [
    /\b(where('?s| is) my order|wismo|tracking|not (yet )?(arrived|delivered|received)|still (in transit|hasn'?t)|hasn'?t (arrived|shipped|moved))\b/i,
    /\b(delivery|shipment|package|parcel)\b.*\b(late|delayed|missing|lost|stuck)\b/i,
    /\b(marked (as )?delivered|never (arrived|showed))\b/i,
  ],
  product_q: [
    /\b(is it safe|can i use|how (do|should) i (use|apply)|ingredients?|shade match|which shade|suitable for|will it)\b/i,
    /\b(pregnan|allerg(y|ic)|sensitive skin|comedogenic|cruelty[- ]free|vegan)\b/i,
  ],
};

/** Order matters: damage and refund outrank the softer intents on a tie. */
const INTENT_PRECEDENCE: Exclude<Intent, 'other'>[] = [
  'refund',
  'damage',
  'return',
  'wismo',
  'product_q',
];

export function detectIntent(subject: string, body: string): Intent {
  // Subject lines are short and deliberate — weight them above body prose.
  const haystack = `${subject}\n${subject}\n${body}`;

  const scores = new Map<Exclude<Intent, 'other'>, number>();
  for (const [intent, patterns] of Object.entries(INTENT_KEYWORDS) as [
    Exclude<Intent, 'other'>,
    RegExp[],
  ][]) {
    const score = patterns.reduce((sum, p) => sum + (p.test(haystack) ? 1 : 0), 0);
    if (score > 0) scores.set(intent, score);
  }

  if (scores.size === 0) return 'other';

  let best: Exclude<Intent, 'other'> = INTENT_PRECEDENCE[0]!;
  let bestScore = -1;
  for (const intent of INTENT_PRECEDENCE) {
    const score = scores.get(intent) ?? 0;
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : 'other';
}

/** Phrases that jump a ticket to P1 regardless of intent. */
const ESCALATORS: RegExp[] = [
  /\b(supervisor|manager|escalate|complaint to|bbb|better business bureau)\b/i,
  /\b(lawyer|attorney|legal action|sue|lawsuit)\b/i,
  /\b(allergic reaction|burn(ed|ing)?|rash|hospital|swelling|blister)\b/i,
  /\b(fraud|unauthori[sz]ed|stolen card)\b/i,
];

const INTENT_BASE_PRIORITY: Record<Intent, Priority> = {
  refund: 2,
  damage: 2,
  wismo: 3,
  return: 3,
  product_q: 4,
  other: 3,
};

export function detectPriority(
  subject: string,
  body: string,
  intent: Intent,
  opts: { vip?: boolean } = {},
): Priority {
  const haystack = `${subject}\n${body}`;
  if (ESCALATORS.some((p) => p.test(haystack))) return 1;

  const base = INTENT_BASE_PRIORITY[intent];
  // A VIP gets one step of urgency, never past P1.
  const adjusted = opts.vip ? Math.max(1, base - 1) : base;
  return adjusted as Priority;
}

/** First-reply targets from §6.7. Mirrored in the Settings screen. */
export const SLA_MINUTES: Record<Priority, number> = {
  1: 60,
  2: 120,
  3: 240,
  4: 1440,
};

export function slaDueAt(priority: Priority, from: Date): Date {
  return new Date(from.getTime() + SLA_MINUTES[priority] * 60_000);
}

const NEGATIVE = /\b(angry|furious|unacceptable|terrible|awful|worst|ridiculous|disappointed|frustrat(ed|ing)|never again|scam|useless|horrible)\b/gi;
const POSITIVE = /\b(thank you|thanks|love|amazing|excellent|wonderful|great|appreciate|saved my|best)\b/gi;

/**
 * Crude lexicon sentiment in [-1, 1]. A placeholder for the Day 10 model —
 * good enough to float angry mail up the queue, not good enough to report on.
 */
export function estimateSentiment(text: string): number {
  const negatives = text.match(NEGATIVE)?.length ?? 0;
  const positives = text.match(POSITIVE)?.length ?? 0;
  if (negatives === 0 && positives === 0) return 0;
  const raw = (positives - negatives) / (positives + negatives);
  return Math.max(-1, Math.min(1, Number(raw.toFixed(2))));
}
