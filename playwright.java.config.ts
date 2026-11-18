import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/live-java',
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3000',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
});
