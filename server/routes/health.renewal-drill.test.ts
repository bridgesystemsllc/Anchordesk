import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../index';

const mockMailboxes = [
  {
    id: 'mailbox-1',
    brandCode: 'CD',
    address: 'care@carolsdaughter.com',
    subscriptionId: 'sub-123',
    subscriptionExpiresAt: new Date(Date.now() + 12 * 60 * 60_000),
    enabled: true,
  },
];

const insertedRows: unknown[] = [];

vi.mock('../db/client', () => ({
  db: {
    execute: vi.fn(async () => [{ '?column?': 1 }]),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => mockMailboxes),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: unknown) => {
        insertedRows.push(row);
        return Promise.resolve();
      }),
    })),
  },
}));

vi.mock('../ingest/mailboxes', () => ({
  enabledMailboxes: vi.fn(async () => []),
}));

vi.mock('../lib/serial', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/serial')>();
  return {
    ...actual,
    ingestQueue: { pending: 0, push: vi.fn(), drain: vi.fn() },
  };
});

describe('POST /api/health/renewal-drill', () => {
  let fetchCallCount: number;

  beforeEach(() => {
    vi.resetModules();
    insertedRows.length = 0;
    fetchCallCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        fetchCallCount++;
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns dryRun: true and logEvent: renewal_drill_fired', async () => {
    const app = createApp();
    const res = await request(app).post('/api/health/renewal-drill').send({});

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.logEvent).toBe('renewal_drill_fired');
  });

  it('returns action: renew for mailbox expiring within lead time', async () => {
    vi.resetModules();
    vi.stubEnv('ENABLE_SUBSCRIPTIONS', 'true');

    const { createApp: createAppFresh } = await import('../index');
    const app = createAppFresh();
    const res = await request(app).post('/api/health/renewal-drill').send({});

    expect(res.status).toBe(200);
    expect(res.body.mailboxes[0].action).toBe('renew');
  });

  it('inserts exactly one cs_ops_drills row', async () => {
    const app = createApp();
    await request(app).post('/api/health/renewal-drill').send({});

    expect(insertedRows.length).toBe(1);
    expect((insertedRows[0] as { kind: string }).kind).toBe('renewal');
  });

  it('makes zero Graph HTTP calls', async () => {
    const app = createApp();
    await request(app).post('/api/health/renewal-drill').send({});

    expect(fetchCallCount).toBe(0);
  });

  it('returns 401 unauthorized when API_AUTH_TOKEN is set but no Bearer provided', async () => {
    vi.stubEnv('API_AUTH_TOKEN', 'test-secret-token-1234');

    vi.resetModules();
    const { createApp: createAppFresh } = await import('../index');
    const app = createAppFresh();
    const res = await request(app).post('/api/health/renewal-drill').send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('accepts request with valid Bearer token when API_AUTH_TOKEN is set', async () => {
    vi.stubEnv('API_AUTH_TOKEN', 'test-secret-token-1234');

    vi.resetModules();
    const { createApp: createAppFresh } = await import('../index');
    const app = createAppFresh();
    const res = await request(app)
      .post('/api/health/renewal-drill')
      .set('Authorization', 'Bearer test-secret-token-1234')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
  });

  it('allows empty body or extra keys without 400', async () => {
    const app = createApp();

    const res1 = await request(app).post('/api/health/renewal-drill');
    expect(res1.status).toBe(200);

    const res2 = await request(app).post('/api/health/renewal-drill').send({ foo: 1, bar: 'baz' });
    expect(res2.status).toBe(200);
  });

  it('two POSTs create two drills rows', async () => {
    const app = createApp();

    await request(app).post('/api/health/renewal-drill').send({});
    await request(app).post('/api/health/renewal-drill').send({});

    expect(insertedRows.length).toBe(2);
  });
});
