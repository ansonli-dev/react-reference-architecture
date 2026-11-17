import { defineConfig, devices } from '@playwright/test';

const javaURL = process.env.JAVA_CATALOG_BASE_URL;
if (!javaURL) {
  throw new Error('Set JAVA_CATALOG_BASE_URL to a seeded Java v1 Catalog.');
}

const port = '3220';
const baseURL = 'http://127.0.0.1:' + port;

export default defineConfig({
  testDir: './test/live-java',
  workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm start',
    url: baseURL + '/api/health',
    env: {
      PORT: port,
      BOOKSTORE_HOST: '127.0.0.1',
      APP_ORIGIN: baseURL,
      JAVA_CONTRACT: 'v1-catalog',
      JAVA_CATALOG_BASE_URL: javaURL,
      CATALOG_CATEGORIES_JSON: '["Architecture","Engineering"]',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
