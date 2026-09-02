/**
 * Synthetic test corpus for recall@5 testing.
 * 25 labeled queries with expected chunk matches.
 * No real customer data — synthetic policies only.
 */

export interface TestChunk {
  id: string;
  title: string;
  text: string;
  brandCode: string | null;
}

export interface LabeledQuery {
  query: string;
  expectedChunkIds: string[];
  brand?: string;
}

export const SYNTHETIC_CHUNKS: TestChunk[] = [
  {
    id: 'chunk-001',
    title: 'Return Policy Overview',
    text: 'All products may be returned within 30 days of purchase for a full refund. Items must be unused and in original packaging. Return shipping is free for defective items. For non-defective returns, customers are responsible for return shipping costs.',
    brandCode: null,
  },
  {
    id: 'chunk-002',
    title: 'Refund Processing Time',
    text: 'Refunds are processed within 5-7 business days after we receive the returned item. Credit card refunds may take an additional 3-5 business days to appear on your statement. Store credit refunds are instant.',
    brandCode: null,
  },
  {
    id: 'chunk-003',
    title: 'Damaged Product Policy',
    text: 'If you receive a damaged product, please contact us within 48 hours with photos of the damage. We will either send a replacement at no cost or issue a full refund including shipping. Do not dispose of damaged items until instructed.',
    brandCode: null,
  },
  {
    id: 'chunk-004',
    title: 'Shipping Times',
    text: 'Standard shipping takes 5-7 business days. Express shipping is 2-3 business days. Next-day shipping is available for orders placed before 2pm EST. International shipping varies by destination, typically 7-14 business days.',
    brandCode: null,
  },
  {
    id: 'chunk-005',
    title: 'Order Tracking',
    text: 'Once your order ships, you will receive an email with tracking information. You can also track your order on our website by entering your order number. Tracking updates may take 24 hours to appear after shipment.',
    brandCode: null,
  },
  {
    id: 'chunk-006',
    title: 'Product Ingredients - Moisturizer',
    text: 'Our daily moisturizer contains hyaluronic acid, vitamin E, aloe vera, and jojoba oil. It is fragrance-free and dermatologist tested. Suitable for all skin types including sensitive skin. Apply twice daily for best results.',
    brandCode: 'CD',
  },
  {
    id: 'chunk-007',
    title: 'Allergic Reaction Protocol',
    text: 'If you experience an allergic reaction to any product, discontinue use immediately and wash the affected area with cool water. Seek medical attention if symptoms persist. Contact our customer service to report the reaction and request a full refund.',
    brandCode: null,
  },
  {
    id: 'chunk-008',
    title: 'Subscription Management',
    text: 'You can manage your subscription in your account settings. Pause, skip, or cancel anytime. Changes must be made 48 hours before your next shipment date. Reactivating a cancelled subscription restores your previous discount.',
    brandCode: null,
  },
  {
    id: 'chunk-009',
    title: 'Gift Card Terms',
    text: 'Gift cards never expire and have no fees. They can be used online or in-store. Gift cards cannot be redeemed for cash except where required by law. Lost or stolen gift cards cannot be replaced.',
    brandCode: null,
  },
  {
    id: 'chunk-010',
    title: 'Price Match Guarantee',
    text: 'We match prices from authorized retailers within 14 days of purchase. The item must be identical including size and shade. Clearance items, flash sales, and membership discounts are excluded from price matching.',
    brandCode: null,
  },
  {
    id: 'chunk-011',
    title: 'VIP Rewards Program',
    text: 'VIP members earn 2 points per dollar spent. Reach Gold status at 500 points for free shipping on all orders. Platinum status at 1000 points includes early access to new products and exclusive sales.',
    brandCode: null,
  },
  {
    id: 'chunk-012',
    title: 'Product Storage Guidelines',
    text: 'Store products in a cool, dry place away from direct sunlight. Avoid storing in bathrooms where humidity is high. Most products are good for 12 months after opening. Check the PAO symbol on packaging.',
    brandCode: null,
  },
  {
    id: 'chunk-013',
    title: 'Dermablend Coverage Foundation',
    text: 'Dermablend full coverage foundation provides 16-hour wear and covers tattoos, scars, and skin conditions. Available in 40 shades. Water-resistant formula. Remove with oil-based cleanser for best results.',
    brandCode: 'DB',
  },
  {
    id: 'chunk-014',
    title: 'Order Cancellation',
    text: 'Orders can be cancelled within 1 hour of placement. After this window, we cannot guarantee cancellation as orders enter fulfillment quickly. Contact customer service immediately for cancellation requests.',
    brandCode: null,
  },
  {
    id: 'chunk-015',
    title: 'International Orders',
    text: 'We ship to over 50 countries. International customers are responsible for customs duties and taxes. Orders may be held at customs. We are not responsible for delays due to customs processing.',
    brandCode: null,
  },
  {
    id: 'chunk-016',
    title: 'Acne Free Product Line',
    text: 'AcneFree products contain benzoyl peroxide and salicylic acid. Start with once-daily application and increase to twice daily. Some initial dryness is normal. Use with SPF as these ingredients increase sun sensitivity.',
    brandCode: 'AF',
  },
  {
    id: 'chunk-017',
    title: 'Exchange Policy',
    text: 'Exchanges are free within 30 days. For different products, return the original and place a new order. For size or shade exchanges, contact us for a prepaid return label and we will ship the replacement when original is in transit.',
    brandCode: null,
  },
  {
    id: 'chunk-018',
    title: 'Baxter Grooming Products',
    text: 'Baxter of California products are formulated for men. The clay pomade provides medium hold with matte finish. Apply to damp or dry hair. Water-soluble formula washes out easily. Paraben-free formulation.',
    brandCode: 'BOC',
  },
  {
    id: 'chunk-019',
    title: 'Coupon Code Policy',
    text: 'Only one coupon code can be used per order. Coupons cannot be combined with other promotions. Coupon must be entered at checkout; cannot be applied after order placement. Some exclusions may apply.',
    brandCode: null,
  },
  {
    id: 'chunk-020',
    title: 'Wholesale Inquiries',
    text: 'For wholesale or bulk orders, contact our B2B team. Minimum order quantities apply. Volume discounts available for qualifying retailers. Must provide valid resale certificate.',
    brandCode: null,
  },
  {
    id: 'chunk-021',
    title: 'Product Expiration',
    text: 'Unopened products are guaranteed for 3 years from manufacture date. Once opened, most products are good for 12 months. Eye products should be replaced every 3-6 months. Check packaging for specific guidance.',
    brandCode: null,
  },
  {
    id: 'chunk-022',
    title: 'AMBI Skin Care',
    text: 'AMBI skincare targets hyperpigmentation and dark spots. The fade cream should be applied twice daily. Results visible in 2-4 weeks. Use sunscreen daily when using fade products. Discontinue if irritation occurs.',
    brandCode: 'AMBI',
  },
  {
    id: 'chunk-023',
    title: 'Lost Package Claims',
    text: 'If tracking shows delivered but package not received, check with neighbors and any alternate delivery locations. File a claim after 48 hours. We will reship or refund once the carrier confirms the package is lost.',
    brandCode: null,
  },
  {
    id: 'chunk-024',
    title: 'Sensitive Skin Recommendations',
    text: 'For sensitive skin, we recommend fragrance-free formulas. Patch test new products before full application. Avoid products with alcohol, retinoids, or exfoliating acids until skin tolerance is established.',
    brandCode: null,
  },
  {
    id: 'chunk-025',
    title: 'Holiday Shipping Deadlines',
    text: 'For holiday delivery, order by December 15 for standard shipping, December 20 for express, and December 22 for next-day. These dates may vary by destination. International orders should order by December 10.',
    brandCode: null,
  },
];

export const LABELED_QUERIES: LabeledQuery[] = [
  {
    query: 'How long do I have to return a product?',
    expectedChunkIds: ['chunk-001', 'chunk-017'],
  },
  {
    query: 'When will I get my refund?',
    expectedChunkIds: ['chunk-002'],
  },
  {
    query: 'I received a damaged item',
    expectedChunkIds: ['chunk-003'],
  },
  {
    query: 'How long does shipping take?',
    expectedChunkIds: ['chunk-004'],
  },
  {
    query: 'Where is my order?',
    expectedChunkIds: ['chunk-005', 'chunk-023'],
  },
  {
    query: 'What ingredients are in the moisturizer?',
    expectedChunkIds: ['chunk-006'],
    brand: 'CD',
  },
  {
    query: 'I had a reaction to a product',
    expectedChunkIds: ['chunk-007'],
  },
  {
    query: 'How do I cancel my subscription?',
    expectedChunkIds: ['chunk-008'],
  },
  {
    query: 'Does my gift card expire?',
    expectedChunkIds: ['chunk-009'],
  },
  {
    query: 'Can you match a lower price?',
    expectedChunkIds: ['chunk-010'],
  },
  {
    query: 'How does the rewards program work?',
    expectedChunkIds: ['chunk-011'],
  },
  {
    query: 'How should I store my products?',
    expectedChunkIds: ['chunk-012', 'chunk-021'],
  },
  {
    query: 'Tell me about Dermablend foundation',
    expectedChunkIds: ['chunk-013'],
    brand: 'DB',
  },
  {
    query: 'I need to cancel my order',
    expectedChunkIds: ['chunk-014'],
  },
  {
    query: 'Do you ship internationally?',
    expectedChunkIds: ['chunk-015'],
  },
  {
    query: 'How do I use AcneFree products?',
    expectedChunkIds: ['chunk-016'],
    brand: 'AF',
  },
  {
    query: 'Can I exchange for a different size?',
    expectedChunkIds: ['chunk-017'],
  },
  {
    query: 'Tell me about Baxter hair products',
    expectedChunkIds: ['chunk-018'],
    brand: 'BOC',
  },
  {
    query: 'Can I use multiple coupon codes?',
    expectedChunkIds: ['chunk-019'],
  },
  {
    query: 'I want to buy wholesale',
    expectedChunkIds: ['chunk-020'],
  },
  {
    query: 'When do products expire?',
    expectedChunkIds: ['chunk-021', 'chunk-012'],
  },
  {
    query: 'What does AMBI fade cream do?',
    expectedChunkIds: ['chunk-022'],
    brand: 'AMBI',
  },
  {
    query: 'My package shows delivered but I never got it',
    expectedChunkIds: ['chunk-023'],
  },
  {
    query: 'What products are good for sensitive skin?',
    expectedChunkIds: ['chunk-024'],
  },
  {
    query: 'What is the holiday shipping deadline?',
    expectedChunkIds: ['chunk-025'],
  },
];
