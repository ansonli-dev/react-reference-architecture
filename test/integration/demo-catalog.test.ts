import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDemoCatalog } from '@/server/adapters/demo/catalog.server';
import { createDemoDb } from '@/server/adapters/demo/db.server';

const dir = mkdtempSync(join(tmpdir(), 'bookstore-seed-'));
const id = '00000000-0000-4000-8000-000000000101';

function seed(dataDir: string) {
  return spawnSync(process.execPath, ['scripts/demo-seed.mjs'], {
    env: { ...process.env, DEMO_DATA_DIR: dataDir },
    encoding: 'utf8',
  });
}

beforeAll(() => {
  const result = seed(dir);
  expect(result.status, result.stderr).toBe(0);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it('reads seeded books, categories and a second page by UUID order', async () => {
  const catalog = createDemoCatalog(createDemoDb(dir));
  const first = await catalog.list({ page: 1 });
  const second = await catalog.list({ page: 2 });
  expect(first.books).toHaveLength(12);
  expect(first.hasNext).toBe(true);
  expect(second.books.length).toBeGreaterThan(0);
  expect(second.books[0].id > first.books[11].id).toBe(true);
  expect(await catalog.categories()).toEqual(['Architecture', 'Programming']);
  expect(await catalog.get(id)).toMatchObject({
    priceMinor: 4900,
    stock: 5,
    currency: 'CNY',
  });
  expect(await catalog.get('00000000-0000-4000-8000-000000009999')).toBeNull();
  expect(
    (await catalog.list({ page: 1, category: 'Architecture', q: 'REACT' }))
      .books,
  ).toContainEqual(expect.objectContaining({ id }));
});

it('reseeds without overwriting prior data', async () => {
  const db = new DatabaseSync(join(dir, 'demo.sqlite'));
  db.prepare('UPDATE books SET stock = 4 WHERE id = ?').run(id);
  db.close();
  const result = seed(dir);
  expect(result.status, result.stderr).toBe(0);
  await expect(
    createDemoCatalog(createDemoDb(dir)).get(id),
  ).resolves.toMatchObject({ stock: 4 });
});

it('fails closed for a missing or redirected database', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'bookstore-empty-'));
  try {
    const catalog = createDemoCatalog(createDemoDb(outside));
    await expect(catalog.list({ page: 1 })).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
    });
    symlinkSync(join(dir, 'demo.sqlite'), join(outside, 'demo.sqlite'));
    await expect(catalog.list({ page: 1 })).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
    });
    expect(seed(outside).status).toBe(1);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
