import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3210';

export default defineConfig({
  testDir: './test/e2e',
  use: { ...devices['Desktop Chrome'], baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm dev:mock',
    url: `${baseURL}/api/health`,
    env: { PORT: '3210' },
    reuseExistingServer: false,
  },
});
