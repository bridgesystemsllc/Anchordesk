import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../index';

vi.mock('../db/client', () => ({
  db: {
    execute: vi.fn(async () => [{ '?column?': 1 }]),
  },
}));

vi.mock('../ingest/mailboxes', () => ({
  enabledMailboxes: vi.fn(),
}));

vi.mock('../lib/serial', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/serial')>();
  return {
    ...actual,
    ingestQueue: { pending: 0, push: vi.fn(), drain: vi.fn() },
  };
});

describe('GET /api/health/ingest', () => {
  let enabledMailboxesMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const { enabledMailboxes } = await import('../ingest/mailboxes');
    enabledMailboxesMock = enabledMailboxes as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when all mailboxes are healthy', async () => {
    enabledMailboxesMock.mockResolvedValue([
      {
        id: 'test-id',
        brandCode: 'CD',
        address: 'care@carolsdaughter.com',
        subscriptionId: 'sub-123',
        subscriptionExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60_000),
        lastSyncAt: new Date(),
        lastError: null,
        enabled: true,
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/health/ingest');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mailboxes[0].healthy).toBe(true);
  });

  it('returns 503 with subscription-expired when subscription has expired', async () => {
    enabledMailboxesMock.mockResolvedValue([
      {
        id: 'test-id',
        brandCode: 'CD',
        address: 'care@carolsdaughter.com',
        subscriptionId: 'sub-123',
        subscriptionExpiresAt: new Date(Date.now() - 1000),
        lastSyncAt: new Date(),
        lastError: null,
        enabled: true,
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/health/ingest');

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.mailboxes[0].problems).toContain('subscription-expired');
  });

  it('returns 503 with no-subscription when subscriptionId is null and subscriptions enabled', async () => {
    enabledMailboxesMock.mockResolvedValue([
      {
        id: 'test-id',
        brandCode: 'CD',
        address: 'care@carolsdaughter.com',
        subscriptionId: null,
        subscriptionExpiresAt: null,
        lastSyncAt: new Date(),
        lastError: null,
        enabled: true,
      },
    ]);

    vi.resetModules();
    vi.stubEnv('ENABLE_SUBSCRIPTIONS', 'true');
    const { createApp: createAppFresh } = await import('../index');
    const app = createAppFresh();
    const res = await request(app).get('/api/health/ingest');

    expect(res.body.mailboxes[0].problems).toContain('no-subscription');
    expect(res.status).toBe(503);
  });
});
