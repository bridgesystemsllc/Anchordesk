/**
 * Shopify Admin API HTTP client for AD-102.
 * Only used when SHOPIFY_ADMIN_TOKEN is set.
 */

import { env } from '../env';
import { log, errFields } from '../log';
import type { ShopifyOrder } from './types';

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'unauthorized' | 'not_found' | 'shopify_unavailable',
  ) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

async function shopifyRequest<T>(path: string): Promise<T> {
  const token = env.SHOPIFY_ADMIN_TOKEN;
  const domain = env.SHOPIFY_STORE_DOMAIN;

  if (!token || !domain) {
    throw new ShopifyApiError('Shopify is not connected', 0, 'shopify_unavailable');
  }

  const url = `https://${domain}/admin/api/2024-01${path}`;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: timeout,
      headers: {
        Accept: 'application/json',
        'X-Shopify-Access-Token': token,
      },
    });
  } catch (e) {
    log.error('shopify request failed', { path, ...errFields(e) });
    throw new ShopifyApiError('Shopify is not reachable', 0, 'shopify_unavailable');
  }

  if (res.status === 401 || res.status === 403) {
    throw new ShopifyApiError('Shopify is not connected', res.status, 'unauthorized');
  }

  if (res.status === 404) {
    throw new ShopifyApiError('Order not found', res.status, 'not_found');
  }

  if (res.status >= 500) {
    throw new ShopifyApiError('Order lookup failed', res.status, 'shopify_unavailable');
  }

  if (!res.ok) {
    throw new ShopifyApiError(`Shopify error: ${res.status}`, res.status, 'shopify_unavailable');
  }

  return (await res.json()) as T;
}

function computeVip(ordersCount: number, totalSpent: string): boolean {
  const ltv = parseFloat(totalSpent) || 0;
  return ordersCount >= 3 || ltv >= 300;
}

interface ShopifyApiOrder {
  id: number;
  name: string;
  email: string;
  customer?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    orders_count: number;
    total_spent: string;
  };
  created_at: string;
  fulfillment_status: string | null;
  financial_status: string;
  total_price: string;
  currency: string;
  line_items: Array<{
    id: number;
    title: string;
    sku: string;
    quantity: number;
    price: string;
  }>;
  shipping_address?: {
    address1: string;
    address2?: string;
    city: string;
    province: string;
    zip: string;
    country: string;
  };
}

function mapApiOrder(o: ShopifyApiOrder): ShopifyOrder {
  const ordersCount = o.customer?.orders_count ?? 0;
  const totalSpent = o.customer?.total_spent ?? '0';
  return {
    id: String(o.id),
    name: o.name,
    email: o.email?.toLowerCase() ?? '',
    customer: o.customer
      ? {
          id: String(o.customer.id),
          email: o.customer.email?.toLowerCase() ?? '',
          firstName: o.customer.first_name ?? '',
          lastName: o.customer.last_name ?? '',
          ordersCount,
          totalSpent,
        }
      : {
          id: '',
          email: o.email?.toLowerCase() ?? '',
          firstName: '',
          lastName: '',
          ordersCount: 0,
          totalSpent: '0',
        },
    createdAt: o.created_at,
    fulfillmentStatus: o.fulfillment_status ?? 'unfulfilled',
    financialStatus: o.financial_status,
    totalPrice: o.total_price,
    currency: o.currency,
    lineItems: o.line_items.map((li) => ({
      id: String(li.id),
      title: li.title,
      sku: li.sku ?? '',
      quantity: li.quantity,
      price: li.price,
    })),
    shippingAddress: o.shipping_address
      ? {
          address1: o.shipping_address.address1,
          address2: o.shipping_address.address2,
          city: o.shipping_address.city,
          province: o.shipping_address.province,
          zip: o.shipping_address.zip,
          country: o.shipping_address.country,
        }
      : null,
    vip: computeVip(ordersCount, totalSpent),
  };
}

export async function fetchOrderById(id: string): Promise<ShopifyOrder> {
  const data = await shopifyRequest<{ order: ShopifyApiOrder }>(`/orders/${id}.json`);
  return mapApiOrder(data.order);
}

export async function fetchOrdersByEmail(email: string): Promise<ShopifyOrder[]> {
  const data = await shopifyRequest<{ orders: ShopifyApiOrder[] }>(
    `/orders.json?email=${encodeURIComponent(email)}&status=any&limit=50`,
  );
  return data.orders.map(mapApiOrder);
}

export async function fetchOrdersByName(name: string): Promise<ShopifyOrder[]> {
  const data = await shopifyRequest<{ orders: ShopifyApiOrder[] }>(
    `/orders.json?name=${encodeURIComponent(name)}&status=any&limit=50`,
  );
  return data.orders.map(mapApiOrder);
}

export async function fetchOrderByNumber(orderNumber: string): Promise<ShopifyOrder[]> {
  const normalized = orderNumber.replace(/^#/, '');
  const data = await shopifyRequest<{ orders: ShopifyApiOrder[] }>(
    `/orders.json?name=%23${encodeURIComponent(normalized)}&status=any&limit=10`,
  );
  return data.orders.map(mapApiOrder);
}
