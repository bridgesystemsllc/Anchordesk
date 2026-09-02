import { createHash } from 'node:crypto';
import { env } from '../env';
import { log } from '../log';

const EMBEDDING_DIMS = 1536;
const OPENAI_API_BASE = 'https://api.openai.com/v1';
const REQUEST_TIMEOUT_MS = 30_000;

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

/**
 * OpenAI embeddings via fetch (no SDK). Returns 1536-dim vectors for
 * text-embedding-3-small. Batches up to 2048 texts per request.
 */
class OpenAIEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_DIMS;

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const res = await fetch(`${OPENAI_API_BASE}/embeddings`, {
      method: 'POST',
      signal: timeout,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: texts,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI embeddings failed: ${res.status} ${res.statusText} - ${body}`);
    }

    const json = (await res.json()) as OpenAIEmbeddingResponse;

    const sorted = json.data.sort((a, b) => a.index - b.index);
    const embeddings = sorted.map((d) => d.embedding);

    log.debug('openai embeddings', {
      count: texts.length,
      promptTokens: json.usage.prompt_tokens,
    });

    return embeddings;
  }
}

/**
 * Deterministic hash-based embedder for tests. Produces stable 1536-dim
 * vectors from text content, enabling recall tests without API calls.
 * Not suitable for production — the vectors have no semantic meaning.
 */
class HashingEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_DIMS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.hashToVector(t));
  }

  private hashToVector(text: string): number[] {
    const normalized = text.toLowerCase().trim();
    const hash = createHash('sha256').update(normalized).digest();

    const vector: number[] = [];
    for (let i = 0; i < EMBEDDING_DIMS; i++) {
      const byteIndex = i % hash.length;
      const value = (hash[byteIndex]! + i) / 256;
      vector.push(value * 2 - 1);
    }

    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / magnitude);
  }
}

/**
 * Default embedder instance. Uses OpenAI if OPENAI_API_KEY is set,
 * otherwise falls back to HashingEmbedder (for tests).
 */
export function getEmbedder(): Embedder {
  if (env.OPENAI_API_KEY) {
    return new OpenAIEmbedder();
  }
  return new HashingEmbedder();
}

export const hashingEmbedder = new HashingEmbedder();

export function isEmbeddingConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}
