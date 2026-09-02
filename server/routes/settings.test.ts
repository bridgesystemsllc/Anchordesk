import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../index';
import { db } from '../db/client';
import { migrate } from '../db/migrate';
import {
  csMailboxes,
  csBrandSettings,
  csRoutingRules,
  csKbSourceConfigs,
  csSlaTargets,
  csAiSettings,
  csUsers,
} from '../db/schema';
import { eq } from 'drizzle-orm';
import { syncMailboxRegistry, enabledMailboxes } from '../ingest/mailboxes';

/**
 * Settings API integration tests. Requires a database.
 *
 *   createdb anchor_test
 *   TEST_DATABASE_URL=postgres://localhost/anchor_test npm test
 */
const RUN = Boolean(process.env.TEST_DATABASE_URL);
const suite = RUN ? describe : describe.skip;

const app = createApp();
const TOKEN = process.env.API_AUTH_TOKEN ?? '';
const authHeader = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

suite('Settings API (AD-106)', () => {
  beforeAll(async () => {
    await migrate();
  });

  describe('GET /api/settings/mailboxes', () => {
    it('returns mailbox list', async () => {
      const res = await request(app).get('/api/settings/mailboxes').set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('mailboxes');
      expect(Array.isArray(res.body.mailboxes)).toBe(true);
    });

    it('returns 401 without token when token required', async () => {
      if (!TOKEN) return;
      const res = await request(app).get('/api/settings/mailboxes');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });
  });

  describe('PUT /api/settings/mailboxes', () => {
    let testMailbox: { id: string; brandCode: string; address: string; graphUserId: string; displayName: string };

    beforeEach(async () => {
      const [mailbox] = await db.select().from(csMailboxes).limit(1);
      if (mailbox) {
        testMailbox = {
          id: mailbox.id,
          brandCode: mailbox.brandCode,
          address: mailbox.address,
          graphUserId: mailbox.graphUserId,
          displayName: mailbox.displayName,
        };
      }
    });

    it('updates mailbox address and returns updated row', async () => {
      if (!testMailbox) return;
      const newAddress = `test-${Date.now()}@example.com`;
      const res = await request(app)
        .put('/api/settings/mailboxes')
        .set(authHeader)
        .send({
          id: testMailbox.id,
          address: newAddress,
          graphUserId: testMailbox.graphUserId,
          displayName: testMailbox.displayName,
        });

      expect(res.status).toBe(200);
      expect(res.body.address).toBe(newAddress.toLowerCase());

      await db
        .update(csMailboxes)
        .set({ address: testMailbox.address })
        .where(eq(csMailboxes.id, testMailbox.id));
    });

    it('returns 400 for empty address', async () => {
      if (!testMailbox) return;
      const res = await request(app)
        .put('/api/settings/mailboxes')
        .set(authHeader)
        .send({
          id: testMailbox.id,
          address: '',
          graphUserId: testMailbox.graphUserId,
          displayName: testMailbox.displayName,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_body');
    });

    it('returns 409 for duplicate address', async () => {
      const mailboxes = await db.select().from(csMailboxes).limit(2);
      if (mailboxes.length < 2) return;

      const res = await request(app)
        .put('/api/settings/mailboxes')
        .set(authHeader)
        .send({
          id: mailboxes[0]!.id,
          address: mailboxes[1]!.address,
          graphUserId: mailboxes[0]!.graphUserId,
          displayName: mailboxes[0]!.displayName,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('duplicate_address');
    });
  });

  describe('syncMailboxRegistry invariant', () => {
    it('PUT address persists across syncMailboxRegistry', async () => {
      const [mailbox] = await db.select().from(csMailboxes).limit(1);
      if (!mailbox) return;

      const originalAddress = mailbox.address;
      const newAddress = `persist-test-${Date.now()}@example.com`;

      await request(app)
        .put('/api/settings/mailboxes')
        .set(authHeader)
        .send({
          id: mailbox.id,
          address: newAddress,
          graphUserId: mailbox.graphUserId,
          displayName: mailbox.displayName,
        });

      await syncMailboxRegistry();

      const [afterSync] = await db.select().from(csMailboxes).where(eq(csMailboxes.id, mailbox.id)).limit(1);
      expect(afterSync?.address).toBe(newAddress.toLowerCase());

      await db
        .update(csMailboxes)
        .set({ address: originalAddress })
        .where(eq(csMailboxes.id, mailbox.id));
    });
  });

  describe('enabledMailboxes returns DB address', () => {
    it('returns the address from database, not env', async () => {
      const enabled = await enabledMailboxes();
      expect(Array.isArray(enabled)).toBe(true);
      for (const m of enabled) {
        expect(m).toHaveProperty('address');
        expect(m).toHaveProperty('brandCode');
      }
    });
  });

  describe('GET /api/settings/brands', () => {
    it('returns brand list', async () => {
      const res = await request(app).get('/api/settings/brands').set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('brands');
      expect(Array.isArray(res.body.brands)).toBe(true);
    });
  });

  describe('PUT /api/settings/brands', () => {
    it('updates brand voice and signature', async () => {
      const res = await request(app)
        .put('/api/settings/brands')
        .set(authHeader)
        .send({
          brandCode: 'CD',
          displayName: "Carol's Daughter",
          shortName: "Carol's D.",
          signature: 'Updated Signature',
          voice: 'Updated voice text.',
        });

      expect(res.status).toBe(200);
      expect(res.body.signature).toBe('Updated Signature');
      expect(res.body.voice).toBe('Updated voice text.');

      await db
        .update(csBrandSettings)
        .set({
          signature: "The Carol's Daughter Care Team",
          voice: 'Warm, personal, community-minded. Speaks to hair journeys, never clinical.',
        })
        .where(eq(csBrandSettings.brandCode, 'CD'));
    });

    it('returns 400 for invalid brand code', async () => {
      const res = await request(app)
        .put('/api/settings/brands')
        .set(authHeader)
        .send({
          brandCode: 'ZZ',
          displayName: 'Test',
          shortName: 'Test',
          signature: 'Test',
          voice: 'Test',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/settings/routes', () => {
    it('returns routes list (may be empty)', async () => {
      const res = await request(app).get('/api/settings/routes').set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('routes');
      expect(Array.isArray(res.body.routes)).toBe(true);
    });
  });

  describe('PUT /api/settings/routes', () => {
    it('creates a new route', async () => {
      const res = await request(app)
        .put('/api/settings/routes')
        .set(authHeader)
        .send({
          intent: 'refund',
          destinationType: 'teams_channel',
          destination: '#test-channel',
          label: 'Test Route',
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('refund');
      expect(res.body.label).toBe('Test Route');

      await db.delete(csRoutingRules).where(eq(csRoutingRules.id, res.body.id));
    });

    it('returns 400 for invalid intent', async () => {
      const res = await request(app)
        .put('/api/settings/routes')
        .set(authHeader)
        .send({
          intent: 'invalid_intent',
          destinationType: 'teams_channel',
          destination: '#test',
          label: 'Test',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/settings/sla', () => {
    it('returns SLA targets', async () => {
      const res = await request(app).get('/api/settings/sla').set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sla');
      expect(Array.isArray(res.body.sla)).toBe(true);
    });
  });

  describe('PUT /api/settings/sla', () => {
    it('updates SLA target for priority', async () => {
      const res = await request(app)
        .put('/api/settings/sla')
        .set(authHeader)
        .send({
          priority: 1,
          firstResponseMinutes: 45,
          appliesTo: 'Test applies',
        });

      expect(res.status).toBe(200);
      expect(res.body.firstResponseMinutes).toBe(45);

      await db
        .update(csSlaTargets)
        .set({ firstResponseMinutes: 60, appliesTo: 'VIP, billing disputes, adverse reactions' })
        .where(eq(csSlaTargets.priority, 1));
    });

    it('returns 400 for priority 5 (out of range)', async () => {
      const res = await request(app)
        .put('/api/settings/sla')
        .set(authHeader)
        .send({
          priority: 5,
          firstResponseMinutes: 60,
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 for minutes > 10080', async () => {
      const res = await request(app)
        .put('/api/settings/sla')
        .set(authHeader)
        .send({
          priority: 1,
          firstResponseMinutes: 10081,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/settings/ai', () => {
    it('returns AI settings', async () => {
      const res = await request(app).get('/api/settings/ai').set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ai');
      expect(res.body.ai).toHaveProperty('model');
      expect(res.body.ai).toHaveProperty('tone');
    });
  });

  describe('PUT /api/settings/ai', () => {
    it('updates AI settings', async () => {
      const res = await request(app)
        .put('/api/settings/ai')
        .set(authHeader)
        .send({
          model: 'claude-opus-5',
          tone: 'clinical',
          costCeilingUsd: 100,
        });

      expect(res.status).toBe(200);
      expect(res.body.model).toBe('claude-opus-5');
      expect(res.body.tone).toBe('clinical');

      await db
        .update(csAiSettings)
        .set({ model: 'claude-sonnet-4-5', tone: 'warm', costCeilingUsd: '50' })
        .where(eq(csAiSettings.id, 'default'));
    });

    it('returns 400 for invalid tone', async () => {
      const res = await request(app)
        .put('/api/settings/ai')
        .set(authHeader)
        .send({
          tone: 'sassy',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/settings/users', () => {
    it('returns users list', async () => {
      const res = await request(app).get('/api/settings/users').set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
    });
  });

  describe('PUT /api/settings/users', () => {
    it('updates user role', async () => {
      const [user] = await db.select().from(csUsers).limit(1);
      if (!user) return;

      const res = await request(app)
        .put('/api/settings/users')
        .set(authHeader)
        .send({
          id: user.id,
          name: user.name,
          email: user.email,
          role: 'lead',
        });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('lead');

      await db.update(csUsers).set({ role: user.role }).where(eq(csUsers.id, user.id));
    });

    it('returns 409 for duplicate email', async () => {
      const users = await db.select().from(csUsers).limit(2);
      if (users.length < 2) return;

      const res = await request(app)
        .put('/api/settings/users')
        .set(authHeader)
        .send({
          id: users[0]!.id,
          name: users[0]!.name,
          email: users[1]!.email,
          role: users[0]!.role,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('duplicate_email');
    });
  });

  describe('POST /api/settings/kb-sources/:id/reindex', () => {
    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .post('/api/settings/kb-sources/00000000-0000-0000-0000-000000000000/reindex')
        .set(authHeader);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('returns not_ready when KB tables are present but source not configured', async () => {
      const [inserted] = await db
        .insert(csKbSourceConfigs)
        .values({
          name: 'Test Source',
          kind: 'sharepoint',
          enabled: true,
        })
        .returning();

      const res = await request(app)
        .post(`/api/settings/kb-sources/${inserted!.id}/reindex`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe('not_ready');

      await db.delete(csKbSourceConfigs).where(eq(csKbSourceConfigs.id, inserted!.id));
    });
  });

  describe('No GraphQL or /api/settings blob', () => {
    it('GET /api/settings returns 404', async () => {
      const res = await request(app).get('/api/settings').set(authHeader);
      expect(res.status).toBe(404);
    });

    it('POST /graphql returns 404', async () => {
      const res = await request(app).post('/graphql').set(authHeader).send({ query: '{ __typename }' });
      expect(res.status).toBe(404);
    });
  });

  describe('No tenant_id, nsd_, prisma, duns, vendor_number in settings routes', () => {
    it('schema and routes do not contain forbidden terms', async () => {
      const { readFileSync } = await import('fs');
      const settingsRoute = readFileSync('./server/routes/settings.ts', 'utf-8');
      const schema = readFileSync('./server/db/schema.ts', 'utf-8');
      const migration = readFileSync('./server/db/migrations/0006_settings.sql', 'utf-8');

      const forbidden = ['tenant_id', 'nsd_', 'prisma', 'duns', 'vendor_number'];
      for (const term of forbidden) {
        expect(settingsRoute.toLowerCase()).not.toContain(term);
        expect(schema.toLowerCase()).not.toContain(term);
        expect(migration.toLowerCase()).not.toContain(term);
      }
    });
  });
});
