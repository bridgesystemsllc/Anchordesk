/**
 * Fake configuration so modules that read env at import time can be loaded in
 * tests. Nothing here reaches a real network or database: the Postgres pool is
 * lazy, and MSAL only contacts Entra when a token is actually requested.
 */
process.env.NODE_ENV = 'test';
// Integration tests run only when TEST_DATABASE_URL points at a throwaway
// database. Without it the pool is created but never connected to.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://anchor:anchor@127.0.0.1:5432/anchor_test';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '11111111-1111-1111-1111-111111111111';
process.env.AZURE_CLIENT_SECRET ??= 'test-secret';
process.env.PUBLIC_BASE_URL ??= 'https://anchor.example.com';
process.env.GRAPH_CLIENT_STATE_SECRET ??= 'test-client-state-secret-value';
process.env.LOG_LEVEL ??= 'error';
process.env.ENABLE_SUBSCRIPTIONS ??= 'false';
process.env.ENABLE_SCHEDULER ??= 'false';
process.env.MAILBOXES ??= JSON.stringify([
  {
    brand: 'CD',
    address: 'care@carolsdaughter.com',
    userId: 'care@carolsdaughter.com',
    displayName: "Carol's Daughter Care",
  },
]);
