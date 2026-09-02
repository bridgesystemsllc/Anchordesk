/**
 * Thread summarization system prompt.
 */

import type { DraftContext } from '../context';

export const SUMMARIZE_SYSTEM_PROMPT = `You are a customer service assistant. Summarize the email thread into 3-6 concise bullet points.

RULES:
1. Focus on the key facts: what the customer wants, what has been tried, current status
2. Use short, scannable bullets
3. Include order numbers if mentioned
4. Do not include PII beyond names already in the thread
5. Do not make up information not in the thread

OUTPUT JSON ONLY:
{
  "bullets": [
    "Customer reports order CD-118402 has not arrived",
    "Tracking shows stuck in transit for 9 days",
    "Customer explicitly declined refund, wants product"
  ]
}

JSON only, no explanation.`;

export function buildSummarizeUserContent(ctx: DraftContext): string {
  const threadStr = ctx.thread
    .map((m) => `[${m.direction.toUpperCase()}] ${m.authorName ?? 'Unknown'}: ${m.body}`)
    .join('\n\n');

  return `Subject: ${ctx.subject}

Thread:
${threadStr}

Summarize this thread in 3-6 bullet points.`;
}
