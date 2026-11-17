import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('serves the correct profile from a live production server', async ({
  request,
}, info) => {
  test.skip(info.project.name === 'dev');
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);

  const home = await request.get('/en');
  expect(home.status()).toBe(200);
  const html = await home.text();
  if (info.project.name === 'demo') {
    expect(html).toContain('Teaching mode');
  } else {
    expect(html).not.toContain('Teaching mode');
    const entry = await request.post('/api/v1/session/demo', {
      data: { account: 'reader-a' },
      maxRedirects: 0,
    });
    expect(entry.status()).toBe(404);
    expect(entry.headers()['set-cookie']).toBeUndefined();
  }
});

test('rejects a release artifact placed in the demo slot', async ({}, info) => {
  test.skip(info.project.name !== 'demo');
  const cwd = mkdtempSync(resolve(tmpdir(), 'bookstore-wrong-build-'));
  try {
    symlinkSync(resolve('.next'), resolve(cwd, '.next-demo'), 'junction');
    const result = spawnSync(
      process.execPath,
      [resolve('test/support/run-built-app.mjs'), 'demo', '3219'],
      { cwd, encoding: 'utf8', timeout: 5000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Expected a demo build');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
