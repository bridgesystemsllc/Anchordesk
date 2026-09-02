import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../index';
import { db } from '../db/client';
import { csEscalations, csTickets, csCustomers, csMessages } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Escalations routes integration tests. Requires a database.
 *
 *   createdb anchor_test
 *   TEST_DATABASE_URL=postgres://localhost/anchor_test npm test
 */
const RUN = Boolean(process.env.TEST_DATABASE_URL);
const suite = RUN ? describe : describe.skip;

const app = createApp();

const FIXTURE_TICKET_ID = '00000000-0000-0000-0000-000000000010';
const FIXTURE_CUSTOMER_ID = '00000000-0000-0000-0000-000000000011';
const FIXTURE_ESCALATION_ID = '00000000-0000-0000-0000-000000000012';

async function seedTestData() {
  await db.insert(csCustomers).values({
    id: FIXTURE_CUSTOMER_ID,
    email: 'escalation-test@example.com',
    name: 'Escalation Test Customer',
    vip: true,
    lifetimeOrders: 5,
    lifetimeValue: '250.00',
  }).onConflictDoNothing();

  await db.insert(csTickets).values({
    id: FIXTURE_TICKET_ID,
    brandId: 'CD',
    subject: 'Escalation test ticket',
    status: 'open',
    mailbox: 'care@carolsdaughter.com',
    intent: 'damage',
    customerId: FIXTURE_CUSTOMER_ID,
    orderNumber: '#1001',
    tags: ['fragile', 'priority'],
    aiSummary: ['Customer reported damaged packaging on arrival'],
  }).onConflictDoNothing();

  await db.insert(csMessages).values({
    ticketId: FIXTURE_TICKET_ID,
    direction: 'outbound',
    authorEmail: 'agent@example.com',
    authorName: 'Test Agent',
    bodyText: 'We apologize for the inconvenience.',
  }).onConflictDoNothing();
}

async function cleanupTestData() {
  await db.delete(csEscalations).where(eq(csEscalations.ticketId, FIXTURE_TICKET_ID));
  await db.delete(csMessages).where(eq(csMessages.ticketId, FIXTURE_TICKET_ID));
  await db.delete(csTickets).where(eq(csTickets.id, FIXTURE_TICKET_ID));
  await db.delete(csCustomers).where(eq(csCustomers.id, FIXTURE_CUSTOMER_ID));
}

suite('Escalations routes', () => {
  beforeEach(async () => {
    await cleanupTestData();
    await seedTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST /api/escalations', () => {
    it('returns 401 unauthorized without auth token', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post('/api/escalations')
        .send({ ticketId: FIXTURE_TICKET_ID, channelId: 'ch-ops' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('returns 400 for invalid body (missing ticketId)', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post('/api/escalations')
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ channelId: 'ch-ops' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 400 for invalid body (missing channelId)', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post('/api/escalations')
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: FIXTURE_TICKET_ID });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 404 for unknown ticket', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post('/api/escalations')
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: '00000000-0000-0000-0000-999999999999', channelId: 'ch-ops' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('returns 200 with fixture-msg when GRAPH_ACCESS_TOKEN unset and inserts row', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      delete process.env.GRAPH_ACCESS_TOKEN;
      const res = await request(app)
        .post('/api/escalations')
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: FIXTURE_TICKET_ID, channelId: 'ch-ops', userId: 'Test Agent' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.teamsMessageId).toBe('fixture-msg');
      expect(res.body.escalationId).toBeDefined();
      expect(res.body.deepLink).toContain('teams.microsoft.com');

      const [escalation] = await db
        .select()
        .from(csEscalations)
        .where(eq(csEscalations.id, res.body.escalationId))
        .limit(1);
      expect(escalation).toBeDefined();
      expect(escalation?.ticketId).toBe(FIXTURE_TICKET_ID);
      expect(escalation?.channelId).toBe('ch-ops');
      expect(escalation?.teamsMessageId).toBe('fixture-msg');
    });

    it('second POST creates a second row (not idempotent on channel)', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      delete process.env.GRAPH_ACCESS_TOKEN;

      const res1 = await request(app)
        .post('/api/escalations')
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: FIXTURE_TICKET_ID, channelId: 'ch-ops' });
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post('/api/escalations')
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: FIXTURE_TICKET_ID, channelId: 'ch-ops' });
      expect(res2.status).toBe(200);
      expect(res2.body.escalationId).not.toBe(res1.body.escalationId);

      const escalations = await db
        .select()
        .from(csEscalations)
        .where(eq(csEscalations.ticketId, FIXTURE_TICKET_ID));
      expect(escalations).toHaveLength(2);
    });
  });

  describe('POST /api/escalations/:id/claim', () => {
    beforeEach(async () => {
      await db.insert(csEscalations).values({
        id: FIXTURE_ESCALATION_ID,
        ticketId: FIXTURE_TICKET_ID,
        channelId: 'ch-ops',
        teamsMessageId: 'fixture-msg',
      }).onConflictDoNothing();
    });

    it('returns 401 unauthorized without auth token', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post(`/api/escalations/${FIXTURE_ESCALATION_ID}/claim`)
        .send({ userId: 'claimer@example.com' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('returns 400 for invalid body (missing userId)', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post(`/api/escalations/${FIXTURE_ESCALATION_ID}/claim`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 404 for unknown escalation', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post('/api/escalations/00000000-0000-0000-0000-999999999999/claim')
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ userId: 'claimer@example.com' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('successfully claims an unclaimed escalation', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post(`/api/escalations/${FIXTURE_ESCALATION_ID}/claim`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ userId: 'claimer@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.escalationId).toBe(FIXTURE_ESCALATION_ID);
      expect(res.body.claimedBy).toBe('claimer@example.com');
      expect(res.body.claimedAt).toBeDefined();

      const [escalation] = await db
        .select()
        .from(csEscalations)
        .where(eq(csEscalations.id, FIXTURE_ESCALATION_ID))
        .limit(1);
      expect(escalation?.claimedBy).toBe('claimer@example.com');
      expect(escalation?.claimedAt).not.toBeNull();
    });

    it('returns 409 already_claimed when claiming already claimed escalation', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';

      const res1 = await request(app)
        .post(`/api/escalations/${FIXTURE_ESCALATION_ID}/claim`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ userId: 'first-claimer@example.com' });
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post(`/api/escalations/${FIXTURE_ESCALATION_ID}/claim`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ userId: 'second-claimer@example.com' });
      expect(res2.status).toBe(409);
      expect(res2.body.error).toBe('already_claimed');

      const [escalation] = await db
        .select()
        .from(csEscalations)
        .where(eq(csEscalations.id, FIXTURE_ESCALATION_ID))
        .limit(1);
      expect(escalation?.claimedBy).toBe('first-claimer@example.com');
    });
  });

  describe('GET /api/escalations', () => {
    beforeEach(async () => {
      await db.insert(csEscalations).values([
        {
          ticketId: FIXTURE_TICKET_ID,
          channelId: 'ch-ops',
          teamsMessageId: 'msg-1',
        },
        {
          ticketId: FIXTURE_TICKET_ID,
          channelId: 'ch-fin',
          teamsMessageId: 'msg-2',
          claimedBy: 'claimer@example.com',
          claimedAt: new Date(),
        },
      ]).onConflictDoNothing();
    });

    it('returns 401 unauthorized without auth token', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .get(`/api/escalations?ticketId=${FIXTURE_TICKET_ID}`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('returns 400 for missing ticketId query param', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .get('/api/escalations')
        .set('Authorization', 'Bearer test-token-value-min16');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });

    it('returns escalations for ticket', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .get(`/api/escalations?ticketId=${FIXTURE_TICKET_ID}`)
        .set('Authorization', 'Bearer test-token-value-min16');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.escalations)).toBe(true);
      expect(res.body.escalations.length).toBeGreaterThanOrEqual(2);

      const escalation = res.body.escalations.find((e: { channelId: string }) => e.channelId === 'ch-fin');
      expect(escalation).toBeDefined();
      expect(escalation.claimedBy).toBe('claimer@example.com');
    });

    it('returns empty array for ticket with no escalations', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .get('/api/escalations?ticketId=00000000-0000-0000-0000-000000000099')
        .set('Authorization', 'Bearer test-token-value-min16');
      expect(res.status).toBe(200);
      expect(res.body.escalations).toEqual([]);
    });
  });
});
