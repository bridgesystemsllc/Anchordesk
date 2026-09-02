import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../index';
import { db } from '../db/client';
import { csExcelBindings, csExcelAppends, csTickets, csCustomers } from '../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Excel routes integration tests. Requires a database.
 *
 *   createdb anchor_test
 *   TEST_DATABASE_URL=postgres://localhost/anchor_test npm test
 */
const RUN = Boolean(process.env.TEST_DATABASE_URL);
const suite = RUN ? describe : describe.skip;

const app = createApp();

const FIXTURE_BINDING_ID = '00000000-0000-0000-0000-000000000001';
const FIXTURE_TICKET_ID = '00000000-0000-0000-0000-000000000002';
const FIXTURE_CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';

async function seedTestData() {
  await db.insert(csCustomers).values({
    id: FIXTURE_CUSTOMER_ID,
    email: 'test@example.com',
    name: 'Test Customer',
  }).onConflictDoNothing();

  await db.insert(csTickets).values({
    id: FIXTURE_TICKET_ID,
    brandId: 'CD',
    subject: 'Test ticket',
    status: 'open',
    mailbox: 'care@carolsdaughter.com',
    intent: 'return',
    customerId: FIXTURE_CUSTOMER_ID,
  }).onConflictDoNothing();

  await db.insert(csExcelBindings).values({
    id: FIXTURE_BINDING_ID,
    name: 'Returns Log',
    workbookId: null,
    worksheet: 'FY26 Returns',
    owner: 'CS Shared',
    autoAppendOn: 'return',
    enabled: true,
    payload: { map: ['Date', 'Ticket id', 'Brand', 'Customer'] },
  }).onConflictDoNothing();
}

async function cleanupTestData() {
  await db.delete(csExcelAppends).where(eq(csExcelAppends.ticketId, FIXTURE_TICKET_ID));
  await db.delete(csExcelBindings).where(eq(csExcelBindings.id, FIXTURE_BINDING_ID));
  await db.delete(csTickets).where(eq(csTickets.id, FIXTURE_TICKET_ID));
  await db.delete(csCustomers).where(eq(csCustomers.id, FIXTURE_CUSTOMER_ID));
}

suite('Excel routes', () => {
  beforeEach(async () => {
    await cleanupTestData();
    await seedTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/excel/:bindingId/preview', () => {
    it('returns 401 unauthorized without auth token', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app).get(`/api/excel/${FIXTURE_BINDING_ID}/preview`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('returns 404 for unknown binding', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .get('/api/excel/00000000-0000-0000-0000-999999999999/preview')
        .set('Authorization', 'Bearer test-token-value-min16');
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Binding not found');
    });

    it('returns demo preview when GRAPH_ACCESS_TOKEN unset', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      delete process.env.GRAPH_ACCESS_TOKEN;
      const res = await request(app)
        .get(`/api/excel/${FIXTURE_BINDING_ID}/preview`)
        .set('Authorization', 'Bearer test-token-value-min16');
      expect(res.status).toBe(200);
      expect(res.body.demo).toBe(true);
      expect(res.body.worksheet).toBe('FY26 Returns');
    });

    it('returns 200 with empty arrays for empty sheet', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      delete process.env.GRAPH_ACCESS_TOKEN;
      const res = await request(app)
        .get(`/api/excel/${FIXTURE_BINDING_ID}/preview`)
        .set('Authorization', 'Bearer test-token-value-min16');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.columns)).toBe(true);
      expect(Array.isArray(res.body.rows)).toBe(true);
    });
  });

  describe('POST /api/excel/:bindingId/append', () => {
    it('returns 401 unauthorized without auth token', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post(`/api/excel/${FIXTURE_BINDING_ID}/append`)
        .send({ ticketId: FIXTURE_TICKET_ID });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('returns 400 for missing ticketId', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post(`/api/excel/${FIXTURE_BINDING_ID}/append`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 400 for invalid values array', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post(`/api/excel/${FIXTURE_BINDING_ID}/append`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: FIXTURE_TICKET_ID, values: 'not-an-array' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 404 for unknown binding', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .post('/api/excel/00000000-0000-0000-0000-999999999999/append')
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: FIXTURE_TICKET_ID });
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Binding not found');
    });

    it('successfully appends row and records in cs_excel_appends', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      delete process.env.GRAPH_ACCESS_TOKEN;
      const res = await request(app)
        .post(`/api/excel/${FIXTURE_BINDING_ID}/append`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: FIXTURE_TICKET_ID });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.bindingId).toBe(FIXTURE_BINDING_ID);
      expect(res.body.ticketId).toBe(FIXTURE_TICKET_ID);

      const [append] = await db
        .select()
        .from(csExcelAppends)
        .where(and(
          eq(csExcelAppends.ticketId, FIXTURE_TICKET_ID),
          eq(csExcelAppends.bindingId, FIXTURE_BINDING_ID)
        ))
        .limit(1);
      expect(append).toBeDefined();
    });

    it('returns 409 duplicate_append on second append', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      delete process.env.GRAPH_ACCESS_TOKEN;

      const res1 = await request(app)
        .post(`/api/excel/${FIXTURE_BINDING_ID}/append`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: FIXTURE_TICKET_ID });
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post(`/api/excel/${FIXTURE_BINDING_ID}/append`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({ ticketId: FIXTURE_TICKET_ID });
      expect(res2.status).toBe(409);
      expect(res2.body.error).toBe('duplicate_append');
      expect(res2.body.message).toBe('Row already appended');
    });
  });

  describe('POST /api/tickets/:id/resolve with auto-append', () => {
    it('resolves ticket and triggers auto-append for matching intent', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      delete process.env.GRAPH_ACCESS_TOKEN;

      const res = await request(app)
        .post(`/api/tickets/${FIXTURE_TICKET_ID}/resolve`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe('resolved');
      expect(res.body.appends).toHaveLength(1);
      expect(res.body.appends[0].ok).toBe(true);
      expect(res.body.appends[0].bindingId).toBe(FIXTURE_BINDING_ID);

      const [ticket] = await db
        .select({ status: csTickets.status })
        .from(csTickets)
        .where(eq(csTickets.id, FIXTURE_TICKET_ID))
        .limit(1);
      expect(ticket?.status).toBe('resolved');

      const [append] = await db
        .select()
        .from(csExcelAppends)
        .where(and(
          eq(csExcelAppends.ticketId, FIXTURE_TICKET_ID),
          eq(csExcelAppends.bindingId, FIXTURE_BINDING_ID)
        ))
        .limit(1);
      expect(append).toBeDefined();
    });

    it('second resolve returns 409 and does not insert second row', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      delete process.env.GRAPH_ACCESS_TOKEN;

      const res1 = await request(app)
        .post(`/api/tickets/${FIXTURE_TICKET_ID}/resolve`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({});
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post(`/api/tickets/${FIXTURE_TICKET_ID}/resolve`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({});
      expect(res2.status).toBe(409);
      expect(res2.body.error).toBe('already_resolved');

      const appends = await db
        .select()
        .from(csExcelAppends)
        .where(and(
          eq(csExcelAppends.ticketId, FIXTURE_TICKET_ID),
          eq(csExcelAppends.bindingId, FIXTURE_BINDING_ID)
        ));
      expect(appends).toHaveLength(1);
    });

    it('resolve succeeds even if append returns 409 (duplicate)', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      delete process.env.GRAPH_ACCESS_TOKEN;

      await db.insert(csExcelAppends).values({
        ticketId: FIXTURE_TICKET_ID,
        bindingId: FIXTURE_BINDING_ID,
        rowIndex: null,
        values: null,
      });

      await db
        .update(csTickets)
        .set({ status: 'open' })
        .where(eq(csTickets.id, FIXTURE_TICKET_ID));

      const res = await request(app)
        .post(`/api/tickets/${FIXTURE_TICKET_ID}/resolve`)
        .set('Authorization', 'Bearer test-token-value-min16')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.appends[0].ok).toBe(false);
      expect(res.body.appends[0].error).toBe('duplicate_append');
    });
  });

  describe('GET /api/settings/bindings', () => {
    it('returns 401 unauthorized without auth token', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app).get('/api/settings/bindings');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('returns enabled bindings', async () => {
      process.env.API_AUTH_TOKEN = 'test-token-value-min16';
      const res = await request(app)
        .get('/api/settings/bindings')
        .set('Authorization', 'Bearer test-token-value-min16');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.bindings)).toBe(true);
      const binding = res.body.bindings.find((b: { id: string }) => b.id === FIXTURE_BINDING_ID);
      expect(binding).toBeDefined();
      expect(binding.name).toBe('Returns Log');
    });
  });
});
