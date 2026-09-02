/**
 * Thin Anthropic Messages API client using fetch.
 * Never logs API keys, email bodies, or full prompts.
 */

import { env } from '../env';
import { log } from '../log';

export class AiError extends Error {
  constructor(
    message: string,
    readonly code: 'unconfigured' | 'unauthorized' | 'timeout' | 'upstream' | 'parse',
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export interface MessageRequest {
  system: string;
  userContent: string;
  maxTokens: number;
  timeoutMs: number;
}

export interface MessageResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  latencyMs: number;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export async function callAnthropic(request: MessageRequest): Promise<MessageResponse> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiError('AI is not configured or the key was rejected. Check ANTHROPIC_API_KEY.', 'unconfigured');
  }

  const model = env.ANTHROPIC_MODEL;
  const start = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.userContent }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - start;

    if (res.status === 401) {
      log.warn('anthropic 401', { model, latencyMs });
      throw new AiError('AI is not configured or the key was rejected. Check ANTHROPIC_API_KEY.', 'unauthorized');
    }

    if (!res.ok) {
      log.warn('anthropic upstream error', { model, status: res.status, latencyMs });
      throw new AiError(`Anthropic returned ${res.status}`, 'upstream');
    }

    const data = (await res.json()) as AnthropicResponse;
    const text = data.content?.[0]?.text;
    if (typeof text !== 'string') {
      log.warn('anthropic parse error', { model, latencyMs, hasContent: !!data.content });
      throw new AiError('The model returned an unusable response', 'parse');
    }

    return {
      text,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model,
      latencyMs,
    };
  } catch (e) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - start;

    if (e instanceof AiError) throw e;

    if (e instanceof DOMException && e.name === 'AbortError') {
      log.warn('anthropic timeout', { model, timeoutMs: request.timeoutMs, latencyMs });
      throw new AiError(`The model timed out after ${Math.round(request.timeoutMs / 1000)}s`, 'timeout');
    }

    log.error('anthropic fetch error', { model, latencyMs, error: e instanceof Error ? e.message : String(e) });
    throw new AiError('Failed to reach Anthropic', 'upstream');
  }
}

export function isAiConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
