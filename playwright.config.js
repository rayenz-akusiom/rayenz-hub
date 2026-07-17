import { defineConfig } from '@playwright/test';

export default defineConfig({
   testDir: 'tests/e2e',
   testMatch: '**/*.spec.{js,ts}',
   fullyParallel: true,
   retries: process.env.CI ? 1 : 0,
   reporter: 'list',
   use: {
      baseURL: 'http://127.0.0.1:4173',
      trace: 'on-first-retry',
   },
   webServer: {
      command: 'node tests/e2e/static-server.mjs',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
   },
});
