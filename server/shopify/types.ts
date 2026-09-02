/**
 * Shopify order types for AD-102.
 * Represents order data from either Shopify Admin API or fixture files.
 */

export interface ShopifyCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  ordersCount: number;
  totalSpent: string;
}

export interface ShopifyLineItem {
  id: string;
  title: string;
  sku: string;
  quantity: number;
  price: string;
}

export interface ShopifyAddress {
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  email: string;
  customer: ShopifyCustomer;
  createdAt: string;
  fulfillmentStatus: 'unfulfilled' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | string;
  financialStatus: 'pending' | 'paid' | 'refunded' | 'partially_refunded' | string;
  totalPrice: string;
  currency: string;
  lineItems: ShopifyLineItem[];
  shippingAddress: ShopifyAddress | null;
  vip: boolean;
}

export type LookupBy = 'number' | 'email' | 'name';
