import type { Brand, BrandCode, Intent, TicketStatus } from './types';

/**
 * Mailboxes are data, not constants — §6.7 build gate. The Carol's Daughter
 * mailbox in particular may move with the L'Oréal separation, and that has to
 * be a settings change rather than a deploy.
 */
export const BRANDS: Record<BrandCode, Brand> = {
  CD: {
    code: 'CD',
    name: "Carol's Daughter",
    short: "Carol's D.",
    color: 'var(--brand-cd)',
    mailbox: 'care@carolsdaughter.com',
    signature: "The Carol's Daughter Care Team",
    voice: 'Warm, personal, community-minded. Speaks to hair journeys, never clinical.',
    subscriptionRenewsAt: '2026-08-13T09:14:00Z',
    lastSyncAt: '2026-08-11T00:00:00Z',
  },
  DB: {
    code: 'DB',
    name: 'Dermablend',
    short: 'Dermablend',
    color: 'var(--brand-db)',
    mailbox: 'support@dermablend.com',
    signature: 'Dermablend Professional Support',
    voice: 'Clinical, precise, reassuring. Leads with coverage claims and skin safety.',
    subscriptionRenewsAt: '2026-08-13T09:14:00Z',
    lastSyncAt: '2026-08-11T00:00:00Z',
  },
  BOC: {
    code: 'BOC',
    name: 'Baxter of California',
    short: 'Baxter',
    color: 'var(--brand-boc)',
    mailbox: 'hello@baxterofcalifornia.com',
    signature: 'Baxter of California',
    voice: 'Understated, confident, minimal. Short sentences. No exclamation marks.',
    subscriptionRenewsAt: '2026-08-13T09:15:00Z',
    lastSyncAt: '2026-08-11T00:00:00Z',
  },
  AMBI: {
    code: 'AMBI',
    name: 'Ambi',
    short: 'Ambi',
    color: 'var(--brand-ambi)',
    mailbox: 'care@ambiskincare.com',
    signature: 'The Ambi Skincare Team',
    voice: 'Encouraging and plainspoken. Explains ingredients without jargon.',
    subscriptionRenewsAt: '2026-08-13T09:15:00Z',
    lastSyncAt: '2026-08-11T00:00:00Z',
  },
  AF: {
    code: 'AF',
    name: 'AcneFree',
    short: 'AcneFree',
    color: 'var(--brand-af)',
    mailbox: 'help@acnefree.com',
    signature: 'AcneFree Customer Care',
    voice: 'Direct, practical, upbeat. Regimen-first answers.',
    subscriptionRenewsAt: '2026-08-13T09:16:00Z',
    lastSyncAt: '2026-08-11T00:00:00Z',
  },
};

export const BRAND_ORDER: BrandCode[] = ['CD', 'DB', 'BOC', 'AMBI', 'AF'];

export const INTENT_LABEL: Record<Intent, string> = {
  wismo: 'Where is my order',
  return: 'Return',
  refund: 'Refund',
  damage: 'Damage',
  product_q: 'Product question',
  other: 'Other',
};

export const INTENT_SHORT: Record<Intent, string> = {
  wismo: 'WISMO',
  return: 'Return',
  refund: 'Refund',
  damage: 'Damage',
  product_q: 'Product Q',
  other: 'Other',
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  open: 'Open',
  pending: 'Pending',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const STATUS_TONE: Record<TicketStatus, string> = {
  new: 'badge-accent',
  open: 'badge-info',
  pending: 'badge-warning',
  escalated: 'badge-danger',
  resolved: 'badge-success',
  closed: 'badge-neutral',
};
