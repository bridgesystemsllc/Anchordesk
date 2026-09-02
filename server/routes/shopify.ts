/**
 * Shopify order lookup and attach routes for AD-102.
 *
 * GET /api/shopify/orders?q=&by=number|email|name → { orders, demo }
 * GET /api/shopify/orders/:id → { order }
 * POST /api/tickets/:id/attach-order { shopifyOrderId } → { ok, ticketId, snapshotId }
 */

import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { csTickets, csOrderSnapshots } from '../db/schema';
import {
  lookupOrders,
  getOrderById,
  isLiveShopify,
  ShopifyApiError,
} from '../shopify/orders';
import { errFields, log } from '../log';

export const shopifyRouter = Router();

const lookupQuery = z.object({
  q: z.string().default(''),
  by: z.enum(['number', 'email', 'name']).default('number'),
});

shopifyRouter.get('/shopify/orders', async (req, res) => {
  const parsed = lookupQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { q, by } = parsed.data;

  if (!q.trim()) {
    res.json({ orders: [], demo: !isLiveShopify() });
    return;
  }

  try {
    const orders = await lookupOrders(q, by);
    res.json({ orders, demo: !isLiveShopify() });
  } catch (e) {
    if (e instanceof ShopifyApiError) {
      if (e.code === 'unauthorized') {
        res.status(503).json({ error: 'shopify_unavailable', message: 'Shopify is not connected' });
        return;
      }
      if (e.code === 'shopify_unavailable') {
        res.status(503).json({ error: 'shopify_unavailable', message: 'Order lookup failed' });
        return;
      }
    }
    log.error('shopify lookup error', errFields(e));
    res.status(503).json({ error: 'shopify_unavailable', message: 'Order lookup failed' });
  }
});

shopifyRouter.get('/shopify/orders/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const order = await getOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ order, demo: !isLiveShopify() });
  } catch (e) {
    if (e instanceof ShopifyApiError) {
      if (e.code === 'unauthorized') {
        res.status(503).json({ error: 'shopify_unavailable', message: 'Shopify is not connected' });
        return;
      }
      if (e.code === 'not_found') {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      if (e.code === 'shopify_unavailable') {
        res.status(503).json({ error: 'shopify_unavailable', message: 'Order lookup failed' });
        return;
      }
    }
    log.error('shopify get order error', errFields(e));
    res.status(503).json({ error: 'shopify_unavailable', message: 'Order lookup failed' });
  }
});

const attachBody = z.object({
  shopifyOrderId: z.string().min(1),
});

shopifyRouter.post('/tickets/:id/attach-order', async (req, res) => {
  const ticketId = z.string().uuid().safeParse(req.params.id);
  if (!ticketId.success) {
    res.status(400).json({ error: 'invalid_body', message: 'Invalid ticket ID' });
    return;
  }

  const parsed = attachBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { shopifyOrderId } = parsed.data;

  if (!/^\d+$/.test(shopifyOrderId)) {
    res.status(400).json({ error: 'invalid_body', message: 'shopifyOrderId must be numeric' });
    return;
  }

  try {
    const [ticket] = await db
      .select({ id: csTickets.id })
      .from(csTickets)
      .where(eq(csTickets.id, ticketId.data))
      .limit(1);

    if (!ticket) {
      res.status(404).json({ error: 'not_found', message: 'Ticket not found' });
      return;
    }

    const [existingSnapshot] = await db
      .select({ id: csOrderSnapshots.id })
      .from(csOrderSnapshots)
      .where(
        and(
          eq(csOrderSnapshots.ticketId, ticketId.data),
          eq(csOrderSnapshots.shopifyOrderId, shopifyOrderId),
        ),
      )
      .limit(1);

    if (existingSnapshot) {
      res.json({ ok: true, ticketId: ticketId.data, snapshotId: existingSnapshot.id });
      return;
    }

    const order = await getOrderById(shopifyOrderId);
    if (!order) {
      res.status(404).json({ error: 'not_found', message: 'Order not found' });
      return;
    }

    const [snapshot] = await db
      .insert(csOrderSnapshots)
      .values({
        ticketId: ticketId.data,
        shopifyOrderId,
        payload: order,
      })
      .onConflictDoNothing()
      .returning({ id: csOrderSnapshots.id });

    if (!snapshot) {
      const [existing] = await db
        .select({ id: csOrderSnapshots.id })
        .from(csOrderSnapshots)
        .where(
          and(
            eq(csOrderSnapshots.ticketId, ticketId.data),
            eq(csOrderSnapshots.shopifyOrderId, shopifyOrderId),
          ),
        )
        .limit(1);

      res.json({ ok: true, ticketId: ticketId.data, snapshotId: existing?.id ?? null });
      return;
    }

    res.json({ ok: true, ticketId: ticketId.data, snapshotId: snapshot.id });
  } catch (e) {
    if (e instanceof ShopifyApiError) {
      if (e.code === 'shopify_unavailable') {
        res.status(503).json({ error: 'shopify_unavailable', message: 'Order could not be attached' });
        return;
      }
    }
    log.error('attach order error', errFields(e));
    res.status(503).json({ error: 'shopify_unavailable', message: 'Order could not be attached' });
  }
});
