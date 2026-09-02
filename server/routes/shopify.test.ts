import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../db/client', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'snapshot-123' }])),
        })),
      })),
    })),
    execute: vi.fn(async () => [{ '?column?': 1 }]),
    transaction: vi.fn(),
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

const TEST_TOKEN = 'test-token-at-least-16-chars';

describe('Shopify routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('API_AUTH_TOKEN', TEST_TOKEN);
    vi.stubEnv('SHOPIFY_ADMIN_TOKEN', '');
    vi.stubEnv('SHOPIFY_STORE_DOMAIN', '');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('GET /api/shopify/orders', () => {
    it('returns 401 unauthorized without token when API_AUTH_TOKEN is set', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app).get('/api/shopify/orders?q=test&by=email');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('returns 200 with empty array for empty query', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.orders).toEqual([]);
      expect(res.body.demo).toBe(true);
    });

    it('returns 400 for invalid by parameter', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=test&by=invalid')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });

    it('returns orders when searching by email with fixture data', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=alice.smith@example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.demo).toBe(true);
      expect(res.body.orders.length).toBe(2);
      expect(res.body.orders[0].email).toBe('alice.smith@example.com');
    });

    it('returns orders when searching by number with fixture data', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=1001&by=number')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.demo).toBe(true);
      expect(res.body.orders.length).toBe(1);
      expect(res.body.orders[0].name).toBe('#1001');
    });

    it('returns orders when searching by name with fixture data', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=alice%20smith&by=name')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.demo).toBe(true);
      expect(res.body.orders.length).toBe(2);
    });

    it('returns empty array for non-matching query', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=nonexistent@example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.orders).toEqual([]);
    });
  });

  describe('GET /api/shopify/orders/:id', () => {
    it('returns 401 unauthorized without token', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app).get('/api/shopify/orders/5001');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('returns order by id from fixture', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders/5001')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.order.id).toBe('5001');
      expect(res.body.order.name).toBe('#1001');
      expect(res.body.demo).toBe(true);
    });

    it('returns 404 for non-existent order', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders/99999')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  describe('POST /api/tickets/:id/attach-order', () => {
    it('returns 401 unauthorized without token', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .post('/api/tickets/00000000-0000-0000-0000-000000000001/attach-order')
        .send({ shopifyOrderId: '5001' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('returns 400 for invalid ticket id', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .post('/api/tickets/not-a-uuid/attach-order')
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ shopifyOrderId: '5001' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 400 for non-numeric shopifyOrderId', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .post('/api/tickets/00000000-0000-0000-0000-000000000001/attach-order')
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ shopifyOrderId: 'not-numeric' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
      expect(res.body.message).toBe('shopifyOrderId must be numeric');
    });

    it('returns 400 for missing shopifyOrderId', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .post('/api/tickets/00000000-0000-0000-0000-000000000001/attach-order')
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });
  });

  describe('VIP calculation', () => {
    it('marks customer as VIP when ordersCount >= 3', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=alice.smith@example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.orders[0].vip).toBe(true);
      expect(res.body.orders[0].customer.ordersCount).toBe(5);
    });

    it('marks customer as VIP when ltv >= 300', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=carol.white@example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.orders[0].vip).toBe(true);
      expect(parseFloat(res.body.orders[0].customer.totalSpent)).toBeGreaterThanOrEqual(300);
    });

    it('marks customer as non-VIP when ordersCount < 3 and ltv < 300', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=bob.jones@example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.orders[0].vip).toBe(false);
      expect(res.body.orders[0].customer.ordersCount).toBe(1);
      expect(parseFloat(res.body.orders[0].customer.totalSpent)).toBeLessThan(300);
    });
  });

  describe('Fixture data requirements', () => {
    it('has at least 6 orders in fixtures', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
    });

    it('has two orders sharing the same email', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=alice.smith@example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.orders.length).toBe(2);
    });

    it('has at least one unique email (single order)', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();
      const res = await request(app)
        .get('/api/shopify/orders?q=bob.jones@example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.orders.length).toBe(1);
    });

    it('has both VIP true and VIP false customers', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();

      const vipRes = await request(app)
        .get('/api/shopify/orders?q=alice.smith@example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);
      expect(vipRes.body.orders[0].vip).toBe(true);

      const nonVipRes = await request(app)
        .get('/api/shopify/orders?q=bob.jones@example.com&by=email')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);
      expect(nonVipRes.body.orders[0].vip).toBe(false);
    });

    it('all fixture emails end with @example.com', async () => {
      const { createApp: createAppFresh } = await import('../index');
      const app = createAppFresh();

      const emails = [
        'alice.smith@example.com',
        'bob.jones@example.com',
        'carol.white@example.com',
        'david.kim@example.com',
        'emma.garcia@example.com',
      ];

      for (const email of emails) {
        const res = await request(app)
          .get(`/api/shopify/orders?q=${encodeURIComponent(email)}&by=email`)
          .set('Authorization', `Bearer ${TEST_TOKEN}`);

        expect(res.status).toBe(200);
        expect(res.body.orders.length).toBeGreaterThan(0);
        expect(res.body.orders[0].email).toMatch(/@example\.com$/);
      }
    });
  });
});
