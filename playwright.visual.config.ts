import { defineConfig, devices } from '@playwright/test';

const previewURL = process.env.BOOKSTORE_VISUAL_URL;
const port = 3230;
const baseURL = previewURL || 'http://127.0.0.1:' + port;

if (!previewURL && (process.platform !== 'linux' || process.arch !== 'arm64')) {
  throw new Error(
    'Run bash scripts/test-visual.sh for screenshots, or set BOOKSTORE_VISUAL_URL to check a running preview.',
  );
}

export default defineConfig({
  testDir: './test/visual',
  testMatch: previewURL ? 'catalog-styles.spec.ts' : '*.spec.ts',
  outputDir: 'test-results/visual',
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  updateSnapshots: 'none',
  workers: 1,
  expect: {
    toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 100 },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: previewURL
    ? undefined
    : {
        command: 'node test/support/run-built-app.mjs demo ' + port,
        url: baseURL + '/api/ready',
        env: { NEXT_TELEMETRY_DISABLED: '1' },
        reuseExistingServer: false,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
      },
});
