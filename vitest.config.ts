import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['server/test/setup.ts'],
    // The integration suites share one database and truncate between tests.
    // Run files one at a time so they cannot clear each other's fixtures
    // mid-run — the alternative is a database per file, which is not worth it
    // for a suite this size.
    fileParallelism: false,
  },
});
