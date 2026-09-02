/**
 * Shopify order lookup service for AD-102.
 * Returns fixture data when SHOPIFY_ADMIN_TOKEN is unset; live data otherwise.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../env';
import { log, errFields } from '../log';
import {
  ShopifyApiError,
  fetchOrderById,
  fetchOrdersByEmail,
  fetchOrdersByName,
  fetchOrderByNumber,
} from './client';
import type { ShopifyOrder, LookupBy } from './types';

export { ShopifyApiError };
export type { ShopifyOrder, LookupBy };

let fixtureCache: ShopifyOrder[] | null = null;

function loadFixtures(): ShopifyOrder[] {
  if (fixtureCache) return fixtureCache;
  try {
    const fixturePath = join(process.cwd(), 'tests/fixtures/shopify-orders.json');
    const raw = readFileSync(fixturePath, 'utf8');
    const data = JSON.parse(raw) as { orders: ShopifyOrder[] };
    fixtureCache = data.orders;
    return fixtureCache;
  } catch (e) {
    log.warn('failed to load shopify fixtures', errFields(e));
    return [];
  }
}

export function isLiveShopify(): boolean {
  return Boolean(env.SHOPIFY_ADMIN_TOKEN && env.SHOPIFY_STORE_DOMAIN);
}

export async function lookupOrders(q: string, by: LookupBy): Promise<ShopifyOrder[]> {
  if (!q.trim()) return [];

  if (isLiveShopify()) {
    try {
      switch (by) {
        case 'number':
          return await fetchOrderByNumber(q);
        case 'email':
          return await fetchOrdersByEmail(q.toLowerCase());
        case 'name':
          return await fetchOrdersByName(q);
      }
    } catch (e) {
      if (e instanceof ShopifyApiError) throw e;
      log.error('shopify lookup failed', { q, by, ...errFields(e) });
      throw new ShopifyApiError('Order lookup failed', 503, 'shopify_unavailable');
    }
  }

  const fixtures = loadFixtures();
  const query = q.toLowerCase().trim();

  switch (by) {
    case 'number': {
      const normalized = query.replace(/^#/, '');
      return fixtures.filter(
        (o) => o.name.toLowerCase().replace(/^#/, '') === normalized || o.id === normalized,
      );
    }
    case 'email':
      return fixtures.filter((o) => o.email.toLowerCase() === query);
    case 'name': {
      const parts = query.split(/\s+/);
      return fixtures.filter((o) => {
        const fullName = `${o.customer.firstName} ${o.customer.lastName}`.toLowerCase();
        return parts.every((p) => fullName.includes(p));
      });
    }
  }
}

export async function getOrderById(id: string): Promise<ShopifyOrder | null> {
  if (isLiveShopify()) {
    try {
      return await fetchOrderById(id);
    } catch (e) {
      if (e instanceof ShopifyApiError && e.code === 'not_found') return null;
      throw e;
    }
  }

  const fixtures = loadFixtures();
  return fixtures.find((o) => o.id === id) ?? null;
}

export async function lookupOrdersByEmail(email: string): Promise<ShopifyOrder[]> {
  return lookupOrders(email, 'email');
}
