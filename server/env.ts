import 'dotenv/config';
import { z } from 'zod';

/**
 * One mailbox entry. `userId` is what goes in /users/{id} — either the Entra
 * object id or the UPN/primary SMTP address of the shared mailbox.
 */
const mailboxSchema = z.object({
  brand: z.enum(['CD', 'DB', 'BOC', 'AMBI', 'AF']),
  address: z.string().email(),
  userId: z.string().min(1),
  displayName: z.string().min(1),
});

export type MailboxConfig = z.infer<typeof mailboxSchema>;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4180),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  AZURE_TENANT_ID: z.string().min(1),
  AZURE_CLIENT_ID: z.string().min(1),
  AZURE_CLIENT_SECRET: z.string().min(1),

  /** Public HTTPS base URL Graph will call back on. No trailing slash. */
  PUBLIC_BASE_URL: z.string().url(),

  /**
   * Secret mixed into each mailbox's per-subscription clientState. Rotating it
   * invalidates every existing subscription's clientState, so renewals must
   * recreate. Keep it stable.
   */
  GRAPH_CLIENT_STATE_SECRET: z.string().min(16, 'GRAPH_CLIENT_STATE_SECRET must be at least 16 chars'),

  MAILBOXES: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'MAILBOXES must be valid JSON' });
        return z.NEVER;
      }
    })
    .pipe(z.array(mailboxSchema).min(1, 'At least one mailbox must be configured')),

  /** How often the renewal + reconciliation scheduler ticks. */
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(5 * 60_000),
  /** Renew a subscription when it has less than this long to live. */
  SUBSCRIPTION_RENEW_LEAD_MS: z.coerce.number().int().positive().default(24 * 60 * 60_000),
  /** Delta reconciliation cadence — the safety net for dropped webhooks. */
  RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(15 * 60_000),

  /** Set false in environments with no public callback URL (local dev). */
  ENABLE_SUBSCRIPTIONS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  ENABLE_SCHEDULER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /**
   * Bearer token guarding the read API until Entra SSO lands. Optional in
   * development; required in production — see the boot check in index.ts.
   */
  API_AUTH_TOKEN: z.string().min(16, 'API_AUTH_TOKEN must be at least 16 chars').optional(),

  /**
   * Anthropic API key for AI triage, drafting, and assist. Optional in
   * development/test (suite boots without it; triage uses rules). If unset,
   * draft/assist endpoints return a watchable error.
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  /**
   * Anthropic model to use. Defaults to claude-sonnet-4-5.
   */
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-5'),

  /**
   * OpenAI API key for embeddings. Optional — tests use HashingEmbedder.
   * Never commit a real key.
   */
  OPENAI_API_KEY: z.string().min(1).optional(),

  /**
   * OpenAI embedding model. Defaults to text-embedding-3-small (1536 dims).
   */
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),

  /**
   * Shopify Admin API token. Optional — when unset or empty, order lookups
   * return fixture data and display a "demo orders" banner.
   */
  SHOPIFY_ADMIN_TOKEN: z.string().optional().transform((v) => v || undefined),

  /**
   * Shopify store domain (e.g., mystore.myshopify.com). Required when
   * SHOPIFY_ADMIN_TOKEN is set.
   */
  SHOPIFY_STORE_DOMAIN: z.string().optional().transform((v) => v || undefined),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  /**
   * Graph access token for Excel workbook operations. When unset, the system
   * uses fixture data and shows a "Using demo Excel" banner.
   */
  GRAPH_ACCESS_TOKEN: z.string().min(1).optional(),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}\n\nSee .env.example.`);
  }

  const addresses = new Set<string>();
  for (const m of parsed.data.MAILBOXES) {
    const key = m.address.toLowerCase();
    if (addresses.has(key)) throw new Error(`Duplicate mailbox address in MAILBOXES: ${m.address}`);
    addresses.add(key);
  }

  return parsed.data;
}

export const env = load();
export type Env = typeof env;
