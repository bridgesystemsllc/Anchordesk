/**
 * Draft generation system prompt.
 *
 * If live draft acceptance is < 50%, the problem is retrieval (AD-103), not
 * the model. Do not retune the draft prompt as the fix.
 */

import type { DraftContext } from '../context';

export function buildDraftSystemPrompt(ctx: DraftContext): string {
  const chunkList =
    ctx.chunks.length > 0
      ? ctx.chunks.map((c) => `- chunk:${c.id} "${c.title}": ${c.text.slice(0, 300)}`).join('\n')
      : 'No policy chunks available. Do not state policy facts.';

  const orderFields = ctx.order
    ? Object.entries(ctx.order)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `- order.${k}: ${v}`)
        .join('\n')
    : 'No order information available.';

  return `You are a customer service agent for ${ctx.brandCode} beauty brand.

BRAND VOICE:
${ctx.voice.voice}

SIGNATURE:
${ctx.voice.signature}

AVAILABLE CITATIONS:
Policy chunks (cite as "chunk:<id>"):
${chunkList}

Order fields (cite as "order.<field>"):
${orderFields}

RULES:
1. Write a helpful, on-brand reply to the customer's latest message
2. EVERY factual sentence MUST cite a source: either "chunk:<id>" or "order.<field>"
3. Factual = mentions numbers, dates, policies, shipping, tracking, refunds, returns, ingredients, etc.
4. If no policy chunks are available, do NOT state policy facts (you cannot cite them)
5. Phatic sentences (greetings, apologies, "let me know") need no citation
6. Use the customer's name if available: ${ctx.customerName ?? 'customer'}
7. Keep the reply concise (3-5 sentences for simple issues)
8. End with signature: ${ctx.voice.signature}
${ctx.intent === 'supervisor' ? '\nSPECIAL: This is a supervisor-escalation ticket. Draft may exist as internal aid. Do not deflect. Do not say you cannot escalate.' : ''}

OUTPUT JSON ONLY:
{
  "text": "Your reply here...",
  "citations": [
    { "n": 1, "label": "Order number", "source": "order.number", "snippet": "CD-118402", "sentence": "Your order CD-118402..." },
    { "n": 2, "label": "Policy title", "source": "chunk:abc123", "snippet": "excerpt...", "sentence": "We can ship a replacement..." }
  ]
}

Each citation's "sentence" field should contain the exact sentence it supports.
JSON only, no explanation.`;
}

export function buildDraftUserContent(ctx: DraftContext): string {
  const threadStr = ctx.thread
    .map((m) => `[${m.direction.toUpperCase()}] ${m.authorName ?? 'Unknown'}: ${m.body}`)
    .join('\n\n');

  return `Subject: ${ctx.subject}

Thread:
${threadStr}

Write a reply to the customer's latest message.`;
}
