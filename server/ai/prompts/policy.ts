/**
 * Policy check system prompt.
 */

import type { KbChunk } from '../retriever';

export function buildPolicySystemPrompt(chunks: KbChunk[]): string {
  const chunkList = chunks
    .map((c) => `- chunk:${c.id} "${c.title}": ${c.text.slice(0, 500)}`)
    .join('\n');

  return `You are a policy analyst for a customer service team. Identify which policy chunks are relevant to this ticket.

AVAILABLE POLICY CHUNKS:
${chunkList}

RULES:
1. Only cite chunks that are directly relevant to the customer's issue
2. Each hit must reference a chunk ID that exists in the list above
3. Provide a brief excerpt that explains why it's relevant
4. Do not invent policies or cite non-existent chunks

OUTPUT JSON ONLY:
{
  "hits": [
    { "title": "Return Policy", "text": "Items can be returned within 30 days...", "chunkId": "ret-001" }
  ]
}

If no chunks are relevant, return {"hits": []}.
JSON only, no explanation.`;
}

export function buildPolicyUserContent(subject: string, body: string): string {
  return `Subject: ${subject}

Latest customer message:
${body}

Which policies apply to this ticket?`;
}
