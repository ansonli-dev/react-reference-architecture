import { defineConfig, devices } from '@playwright/test';

const javaURL = process.env.JAVA_CATALOG_BASE_URL;
const v2Browser = process.env.JAVA_V2_BROWSER === '1';
if (!v2Browser && !javaURL) {
  throw new Error('Set JAVA_CATALOG_BASE_URL to a seeded Java v1 Catalog.');
}

const port = '3220';
const baseURL = v2Browser
  ? 'http://localhost:3000'
  : 'http://127.0.0.1:' + port;

export default defineConfig({
  testDir: './test/live-java',
  testMatch: v2Browser ? 'checkout-v2.spec.ts' : 'catalog.spec.ts',
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  webServer: v2Browser
    ? undefined
    : {
        command: 'pnpm start',
        url: baseURL + '/api/health',
        env: {
          PORT: port,
          BOOKSTORE_HOST: '127.0.0.1',
          APP_ORIGIN: baseURL,
          JAVA_CONTRACT: 'v1-catalog',
          JAVA_CATALOG_BASE_URL: javaURL!,
          CATALOG_CATEGORIES_JSON: '["Architecture","Engineering"]',
          NEXT_TELEMETRY_DISABLED: '1',
        },
        reuseExistingServer: false,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      },
});
