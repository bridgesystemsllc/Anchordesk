import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import {
  csMailboxes,
  csBrandSettings,
  csRoutingRules,
  csExcelBindings,
  csKbSourceConfigs,
  csSlaTargets,
  csAiSettings,
  csUsers,
  csKbSources,
  csKbChunks,
} from '../db/schema';
import { errFields, log } from '../log';

export const settingsRouter = Router();

const VALID_INTENTS = ['wismo', 'return', 'refund', 'damage', 'product_q', 'supervisor', 'other'] as const;
const VALID_TONES = ['warm', 'clinical', 'understated', 'plainspoken', 'direct'] as const;
const VALID_ROLES = ['agent', 'lead', 'admin'] as const;
const VALID_BRAND_CODES = ['CD', 'DB', 'BOC', 'AMBI', 'AF'] as const;

/* -------------------------------------------------------------------------- */
/* Mailboxes                                                                  */
/* -------------------------------------------------------------------------- */

const mailboxPutSchema = z.object({
  id: z.string().uuid(),
  address: z.string().email().min(1),
  graphUserId: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean().optional(),
});

settingsRouter.get('/settings/mailboxes', async (_req, res) => {
  try {
    const rows = await db.select().from(csMailboxes).orderBy(csMailboxes.brandCode);
    res.json({
      mailboxes: rows.map((r) => ({
        id: r.id,
        brandCode: r.brandCode,
        address: r.address,
        graphUserId: r.graphUserId,
        displayName: r.displayName,
        enabled: r.enabled,
        subscriptionExpiresAt: r.subscriptionExpiresAt?.toISOString() ?? null,
        lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    log.error('failed to get mailboxes', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

settingsRouter.put('/settings/mailboxes', async (req, res) => {
  const parsed = mailboxPutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { id, address, graphUserId, displayName, enabled } = parsed.data;
  const normalizedAddress = address.toLowerCase();

  try {
    const [existing] = await db.select().from(csMailboxes).where(eq(csMailboxes.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const [duplicate] = await db
      .select({ id: csMailboxes.id })
      .from(csMailboxes)
      .where(sql`lower(${csMailboxes.address}) = ${normalizedAddress} AND ${csMailboxes.id} != ${id}`)
      .limit(1);

    if (duplicate) {
      res.status(409).json({ error: 'duplicate_address' });
      return;
    }

    const addressChanged = existing.address.toLowerCase() !== normalizedAddress;

    const [updated] = await db
      .update(csMailboxes)
      .set({
        address: normalizedAddress,
        graphUserId,
        displayName,
        enabled: enabled ?? existing.enabled,
        updatedAt: new Date(),
        ...(addressChanged
          ? {
              subscriptionId: null,
              subscriptionExpiresAt: null,
              inboxDeltaLink: null,
              sentDeltaLink: null,
            }
          : {}),
      })
      .where(eq(csMailboxes.id, id))
      .returning();

    res.json({
      id: updated!.id,
      brandCode: updated!.brandCode,
      address: updated!.address,
      graphUserId: updated!.graphUserId,
      displayName: updated!.displayName,
      enabled: updated!.enabled,
      subscriptionExpiresAt: updated!.subscriptionExpiresAt?.toISOString() ?? null,
      lastSyncAt: updated!.lastSyncAt?.toISOString() ?? null,
    });
  } catch (e) {
    log.error('failed to update mailbox', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------------------------------------------------------- */
/* Brands                                                                     */
/* -------------------------------------------------------------------------- */

const brandPutSchema = z.object({
  brandCode: z.enum(VALID_BRAND_CODES),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  signature: z.string().min(1),
  voice: z.string().min(1),
});

settingsRouter.get('/settings/brands', async (_req, res) => {
  try {
    const rows = await db.select().from(csBrandSettings);
    res.json({ brands: rows });
  } catch (e) {
    log.error('failed to get brands', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

settingsRouter.put('/settings/brands', async (req, res) => {
  const parsed = brandPutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { brandCode, displayName, shortName, signature, voice } = parsed.data;

  try {
    const [updated] = await db
      .update(csBrandSettings)
      .set({ displayName, shortName, signature, voice, updatedAt: new Date() })
      .where(eq(csBrandSettings.brandCode, brandCode))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    res.json(updated);
  } catch (e) {
    log.error('failed to update brand', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------------------------------------------------------- */
/* Routing Rules                                                              */
/* -------------------------------------------------------------------------- */

const routePutSchema = z.object({
  id: z.string().uuid().optional(),
  intent: z.enum(VALID_INTENTS),
  brandCode: z.enum(VALID_BRAND_CODES).nullable().optional(),
  destinationType: z.enum(['teams_channel', 'user']),
  destination: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean().optional(),
});

settingsRouter.get('/settings/routes', async (_req, res) => {
  try {
    const rows = await db.select().from(csRoutingRules).orderBy(csRoutingRules.intent);
    res.json({ routes: rows });
  } catch (e) {
    log.error('failed to get routes', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

settingsRouter.put('/settings/routes', async (req, res) => {
  const parsed = routePutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { id, intent, brandCode, destinationType, destination, label, enabled } = parsed.data;

  try {
    if (id) {
      const [updated] = await db
        .update(csRoutingRules)
        .set({
          intent,
          brandCode: brandCode ?? null,
          destinationType,
          destination,
          label,
          enabled: enabled ?? true,
          updatedAt: new Date(),
        })
        .where(eq(csRoutingRules.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      res.json(updated);
    } else {
      const [inserted] = await db
        .insert(csRoutingRules)
        .values({
          intent,
          brandCode: brandCode ?? null,
          destinationType,
          destination,
          label,
          enabled: enabled ?? true,
        })
        .returning();

      res.json(inserted);
    }
  } catch (e) {
    log.error('failed to update route', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------------------------------------------------------- */
/* Excel Bindings                                                             */
/* -------------------------------------------------------------------------- */

const bindingPutSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  workbookId: z.string().min(1),
  worksheet: z.string().min(1),
  owner: z.string().min(1),
  columns: z.array(z.string()).optional(),
  autoAppendOn: z.enum(VALID_INTENTS).nullable().optional(),
  enabled: z.boolean().optional(),
});

settingsRouter.get('/settings/bindings', async (_req, res) => {
  try {
    const rows = await db.select().from(csExcelBindings).orderBy(csExcelBindings.name);
    res.json({
      bindings: rows.map((r) => ({
        ...r,
        lastWriteAt: r.lastWriteAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    log.error('failed to get bindings', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

settingsRouter.put('/settings/bindings', async (req, res) => {
  const parsed = bindingPutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { id, name, workbookId, worksheet, owner, columns, autoAppendOn, enabled } = parsed.data;

  try {
    if (id) {
      const [existing] = await db.select().from(csExcelBindings).where(eq(csExcelBindings.id, id)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const [duplicate] = await db
        .select({ id: csExcelBindings.id })
        .from(csExcelBindings)
        .where(
          sql`${csExcelBindings.workbookId} = ${workbookId} AND ${csExcelBindings.worksheet} = ${worksheet} AND ${csExcelBindings.id} != ${id}`,
        )
        .limit(1);

      if (duplicate) {
        res.status(409).json({ error: 'duplicate_binding' });
        return;
      }

      const [updated] = await db
        .update(csExcelBindings)
        .set({
          name,
          workbookId,
          worksheet,
          owner,
          columns: columns ?? existing.columns,
          autoAppendOn: autoAppendOn ?? null,
          enabled: enabled ?? existing.enabled,
          updatedAt: new Date(),
        })
        .where(eq(csExcelBindings.id, id))
        .returning();

      log.info('binding updated', { id, workbookId });
      res.json({
        ...updated!,
        lastWriteAt: updated!.lastWriteAt?.toISOString() ?? null,
        createdAt: updated!.createdAt.toISOString(),
        updatedAt: updated!.updatedAt.toISOString(),
      });
    } else {
      const [duplicate] = await db
        .select({ id: csExcelBindings.id })
        .from(csExcelBindings)
        .where(sql`${csExcelBindings.workbookId} = ${workbookId} AND ${csExcelBindings.worksheet} = ${worksheet}`)
        .limit(1);

      if (duplicate) {
        res.status(409).json({ error: 'duplicate_binding' });
        return;
      }

      const [inserted] = await db
        .insert(csExcelBindings)
        .values({
          name,
          workbookId,
          worksheet,
          owner,
          columns: columns ?? [],
          autoAppendOn: autoAppendOn ?? null,
          enabled: enabled ?? true,
        })
        .returning();

      log.info('binding created', { id: inserted!.id, workbookId });
      res.json({
        ...inserted!,
        lastWriteAt: inserted!.lastWriteAt?.toISOString() ?? null,
        createdAt: inserted!.createdAt.toISOString(),
        updatedAt: inserted!.updatedAt.toISOString(),
      });
    }
  } catch (e) {
    log.error('failed to update binding', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------------------------------------------------------- */
/* KB Source Configs                                                          */
/* -------------------------------------------------------------------------- */

const kbSourcePutSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  kind: z.enum(['sharepoint', 'fixture']),
  brandCode: z.enum(VALID_BRAND_CODES).nullable().optional(),
  siteId: z.string().nullable().optional(),
  driveId: z.string().nullable().optional(),
  itemPath: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

settingsRouter.get('/settings/kb-sources', async (_req, res) => {
  try {
    const rows = await db.select().from(csKbSourceConfigs).orderBy(csKbSourceConfigs.name);
    res.json({
      kbSources: rows.map((r) => ({
        ...r,
        lastIndexedAt: r.lastIndexedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    log.error('failed to get kb sources', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

settingsRouter.put('/settings/kb-sources', async (req, res) => {
  const parsed = kbSourcePutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { id, name, kind, brandCode, siteId, driveId, itemPath, enabled } = parsed.data;

  try {
    if (id) {
      const [existing] = await db.select().from(csKbSourceConfigs).where(eq(csKbSourceConfigs.id, id)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const [updated] = await db
        .update(csKbSourceConfigs)
        .set({
          name,
          kind,
          brandCode: brandCode ?? null,
          siteId: siteId ?? null,
          driveId: driveId ?? null,
          itemPath: itemPath ?? null,
          enabled: enabled ?? existing.enabled,
          updatedAt: new Date(),
        })
        .where(eq(csKbSourceConfigs.id, id))
        .returning();

      res.json({
        ...updated!,
        lastIndexedAt: updated!.lastIndexedAt?.toISOString() ?? null,
        createdAt: updated!.createdAt.toISOString(),
        updatedAt: updated!.updatedAt.toISOString(),
      });
    } else {
      const [inserted] = await db
        .insert(csKbSourceConfigs)
        .values({
          name,
          kind,
          brandCode: brandCode ?? null,
          siteId: siteId ?? null,
          driveId: driveId ?? null,
          itemPath: itemPath ?? null,
          enabled: enabled ?? true,
        })
        .returning();

      res.json({
        ...inserted!,
        lastIndexedAt: inserted!.lastIndexedAt?.toISOString() ?? null,
        createdAt: inserted!.createdAt.toISOString(),
        updatedAt: inserted!.updatedAt.toISOString(),
      });
    }
  } catch (e) {
    log.error('failed to update kb source', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

settingsRouter.post('/settings/kb-sources/:id/reindex', async (req, res) => {
  const idParam = z.string().uuid().safeParse(req.params.id);
  if (!idParam.success) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  try {
    const [source] = await db
      .select()
      .from(csKbSourceConfigs)
      .where(eq(csKbSourceConfigs.id, idParam.data))
      .limit(1);

    if (!source) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    let kbTablesExist = true;
    try {
      await db.select({ id: csKbSources.id }).from(csKbSources).limit(1);
      await db.select({ id: csKbChunks.id }).from(csKbChunks).limit(1);
    } catch {
      kbTablesExist = false;
    }

    if (!kbTablesExist) {
      res.json({ ok: true, sourceId: source.id, status: 'not_ready' });
      return;
    }

    if (!source.siteId || !source.driveId) {
      res.json({ ok: true, sourceId: source.id, status: 'not_ready' });
      return;
    }

    res.json({ ok: true, sourceId: source.id, status: 'queued' });
  } catch (e) {
    log.error('failed to reindex kb source', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------------------------------------------------------- */
/* SLA Targets                                                                */
/* -------------------------------------------------------------------------- */

const slaPutSchema = z.object({
  priority: z.number().int().min(1).max(4),
  firstResponseMinutes: z.number().int().min(1).max(10080),
  appliesTo: z.string().optional(),
});

settingsRouter.get('/settings/sla', async (_req, res) => {
  try {
    const rows = await db.select().from(csSlaTargets).orderBy(csSlaTargets.priority);
    res.json({ sla: rows });
  } catch (e) {
    log.error('failed to get sla', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

settingsRouter.put('/settings/sla', async (req, res) => {
  const parsed = slaPutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { priority, firstResponseMinutes, appliesTo } = parsed.data;

  try {
    const [updated] = await db
      .update(csSlaTargets)
      .set({ firstResponseMinutes, appliesTo: appliesTo ?? '' })
      .where(eq(csSlaTargets.priority, priority))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    res.json(updated);
  } catch (e) {
    log.error('failed to update sla', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------------------------------------------------------- */
/* AI Settings                                                                */
/* -------------------------------------------------------------------------- */

const aiPutSchema = z.object({
  model: z.string().min(1).optional(),
  tone: z.enum(VALID_TONES).optional(),
  costCeilingUsd: z.number().min(0).optional(),
  autoDraft: z.boolean().optional(),
  requireCitations: z.boolean().optional(),
});

settingsRouter.get('/settings/ai', async (_req, res) => {
  try {
    const [row] = await db.select().from(csAiSettings).where(eq(csAiSettings.id, 'default')).limit(1);
    if (!row) {
      res.json({
        ai: {
          id: 'default',
          model: 'claude-sonnet-4-5',
          tone: 'warm',
          costCeilingUsd: '50',
          autoDraft: true,
          requireCitations: true,
        },
      });
      return;
    }
    res.json({ ai: row });
  } catch (e) {
    log.error('failed to get ai settings', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

settingsRouter.put('/settings/ai', async (req, res) => {
  const parsed = aiPutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { model, tone, costCeilingUsd, autoDraft, requireCitations } = parsed.data;

  try {
    const [existing] = await db.select().from(csAiSettings).where(eq(csAiSettings.id, 'default')).limit(1);

    if (!existing) {
      const [inserted] = await db
        .insert(csAiSettings)
        .values({
          id: 'default',
          model: model ?? 'claude-sonnet-4-5',
          tone: tone ?? 'warm',
          costCeilingUsd: costCeilingUsd?.toString() ?? '50',
          autoDraft: autoDraft ?? true,
          requireCitations: requireCitations ?? true,
        })
        .returning();
      res.json(inserted);
      return;
    }

    const [updated] = await db
      .update(csAiSettings)
      .set({
        model: model ?? existing.model,
        tone: tone ?? existing.tone,
        costCeilingUsd: costCeilingUsd !== undefined ? costCeilingUsd.toString() : existing.costCeilingUsd,
        autoDraft: autoDraft ?? existing.autoDraft,
        requireCitations: requireCitations ?? existing.requireCitations,
        updatedAt: new Date(),
      })
      .where(eq(csAiSettings.id, 'default'))
      .returning();

    res.json(updated);
  } catch (e) {
    log.error('failed to update ai settings', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

const userPutSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  email: z.string().email().min(1),
  role: z.enum(VALID_ROLES),
  title: z.string().optional(),
  entraGroup: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

settingsRouter.get('/settings/users', async (_req, res) => {
  try {
    const rows = await db.select().from(csUsers).orderBy(csUsers.name);
    res.json({
      users: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    log.error('failed to get users', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});

settingsRouter.put('/settings/users', async (req, res) => {
  const parsed = userPutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { id, name, email, role, title, entraGroup, enabled } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    if (id) {
      const [existing] = await db.select().from(csUsers).where(eq(csUsers.id, id)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const [duplicate] = await db
        .select({ id: csUsers.id })
        .from(csUsers)
        .where(sql`lower(${csUsers.email}) = ${normalizedEmail} AND ${csUsers.id} != ${id}`)
        .limit(1);

      if (duplicate) {
        res.status(409).json({ error: 'duplicate_email' });
        return;
      }

      const [updated] = await db
        .update(csUsers)
        .set({
          name,
          email: normalizedEmail,
          role,
          title: title ?? existing.title,
          entraGroup: entraGroup ?? null,
          enabled: enabled ?? existing.enabled,
          updatedAt: new Date(),
        })
        .where(eq(csUsers.id, id))
        .returning();

      res.json({
        ...updated!,
        createdAt: updated!.createdAt.toISOString(),
        updatedAt: updated!.updatedAt.toISOString(),
      });
    } else {
      const [duplicate] = await db
        .select({ id: csUsers.id })
        .from(csUsers)
        .where(sql`lower(${csUsers.email}) = ${normalizedEmail}`)
        .limit(1);

      if (duplicate) {
        res.status(409).json({ error: 'duplicate_email' });
        return;
      }

      const [inserted] = await db
        .insert(csUsers)
        .values({
          name,
          email: normalizedEmail,
          role,
          title: title ?? '',
          entraGroup: entraGroup ?? null,
          enabled: enabled ?? true,
        })
        .returning();

      res.json({
        ...inserted!,
        createdAt: inserted!.createdAt.toISOString(),
        updatedAt: inserted!.updatedAt.toISOString(),
      });
    }
  } catch (e) {
    log.error('failed to update user', errFields(e));
    res.status(500).json({ error: 'internal_error' });
  }
});
