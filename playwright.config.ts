import { defineConfig, devices } from '@playwright/test';
import { emptyCatalogPorts } from './test/support/java-catalog-stub.mjs';

const dev = process.env.BOOKSTORE_E2E_DEV === '1';
const targets = dev
  ? [{ name: 'dev', port: 3210 }]
  : [
      { name: 'demo', port: 3210 },
      { name: 'release', port: 3211 },
    ];

const servers = [
  ...targets.map((target) => ({ ...target, mode: '' })),
  ...(!dev
    ? Object.entries(emptyCatalogPorts).map(([name, port]) => ({
        name,
        port,
        mode: ' without-catalog',
      }))
    : []),
];

export default defineConfig({
  testDir: './test/e2e',
  outputDir: 'test-results/e2e',
  workers: 1,
  use: { trace: 'retain-on-failure' },
  projects: targets.map(({ name, port }) => ({
    name,
    use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:' + port },
  })),
  webServer: servers.map(({ name, port, mode }) => ({
    command: dev
      ? 'pnpm dev:mock'
      : 'node test/support/run-built-app.mjs ' + name + ' ' + port + mode,
    url: 'http://127.0.0.1:' + port + '/api/health',
    env: { PORT: String(port), NEXT_TELEMETRY_DISABLED: '1' },
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  })),
});
