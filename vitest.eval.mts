import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * The replicated three-arm evaluation (`npm run eval:arms`) — deliberately a separate config.
 *
 * It is not a test: it asserts nothing and takes minutes. Keeping it out of the default include
 * means `npm test` stays fast, while the harness still resolves modules exactly the way the
 * application does. `disableConsoleIntercept` lets the report reach the terminal intact.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['scripts/*.eval.ts'],
    setupFiles: ['./tests/setup/isolate-db.ts'],
    disableConsoleIntercept: true,
    reporters: ['default'],
    testTimeout: 30 * 60 * 1000,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
});
