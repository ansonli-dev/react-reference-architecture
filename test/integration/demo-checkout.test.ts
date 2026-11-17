import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { CartGroup } from '@/features/checkout/model';
import { createDemoCatalog } from '@/server/adapters/demo/catalog.server';
import { createDemoCheckout } from '@/server/adapters/demo/checkout.server';
import { createDemoDb } from '@/server/adapters/demo/db.server';

const buyer = 'cadb5345-3eea-4f54-ab48-9fe924738405';
const otherBuyer = '4ca4081a-bfa1-4626-9847-9f03fa47968b';
const firstBook = '00000000-0000-4000-8000-000000000101';
const secondBook = '00000000-0000-4000-8000-000000000102';
const usdBook = '00000000-0000-4000-8000-000000000104';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bookstore-checkout-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function seed() {
  const result = spawnSync(process.execPath, ['scripts/demo-seed.mjs'], {
    env: { ...process.env, DEMO_DATA_DIR: dir },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
}

function openShop() {
  const db = createDemoDb(dir);
  return {
    shop: createDemoCheckout(db, createDemoDb(dir, { write: true })),
    catalog: createDemoCatalog(db),
  };
}

function quoteFor(
  shop: ReturnType<typeof createDemoCheckout>,
  shopper: string,
  cart: CartGroup,
) {
  const quote = shop.createQuote(shopper, cart.currency, cart.revision);
  if ('error' in quote) throw new Error(quote.error);
  return quote;
}

it('upgrades an existing catalog while preserving locally edited metadata and stock', async () => {
  const db = new DatabaseSync(join(dir, 'demo.sqlite'));
  try {
    db.exec(
      readFileSync(
        'src/server/adapters/demo/migrations/001-catalog.sql',
        'utf8',
      ),
    );
    db.prepare(
      'INSERT INTO books (id, title, author, category, price_minor, currency, stock) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      firstBook,
      'Existing local title',
      'Author',
      'Architecture',
      4200,
      'CNY',
      2,
    );
  } finally {
    db.close();
  }
  seed();
  const { shop, catalog } = openShop();
  expect(shop.setCartItem(buyer, firstBook, 2)).toMatchObject({
    created: true,
  });
  expect(shop.cart(buyer)[0]).toMatchObject({
    totalMinor: 8400,
    lines: [{ title: 'Existing local title', quantity: 2 }],
  });
  expect(await catalog.get(firstBook)).toMatchObject({ stock: 2 });
});

it('creates one receipt and deducts stock once on replay, while keeping other currencies and shoppers separate', async () => {
  seed();
  const { shop, catalog } = openShop();
  expect(shop.setCartItem(buyer, firstBook, 1)).toMatchObject({
    created: true,
  });
  expect(shop.setCartItem(buyer, firstBook, 2)).toMatchObject({
    created: false,
  });
  expect(shop.setCartItem(buyer, usdBook, 1)).toMatchObject({ created: true });
  const [cny, usd] = shop.cart(buyer);
  expect(cny).toMatchObject({ currency: 'CNY', totalMinor: 9800 });
  expect(usd.currency).toBe('USD');
  expect(shop.cart(otherBuyer)).toEqual([]);

  const quote = quoteFor(shop, buyer, cny);
  const result = shop.submitQuote(buyer, quote.quoteId, quote.quoteId);
  if ('error' in result) throw new Error(result.error);
  expect(result).toMatchObject({ created: true, bookIds: [firstBook] });
  const { orderId } = result.submission.order;
  expect(shop.cart(buyer)).toEqual([usd]);
  const reopened = openShop().shop;
  expect(reopened.submitQuote(buyer, quote.quoteId, quote.quoteId)).toEqual({
    submission: result.submission,
    created: false,
    bookIds: [],
  });
  expect(
    reopened.submitQuote(buyer, quote.quoteId, crypto.randomUUID()),
  ).toEqual({ error: 'consumed' });
  expect(await catalog.get(firstBook)).toMatchObject({ stock: 3 });
  expect(await catalog.get(usdBook)).toMatchObject({ stock: 4 });
  expect(reopened.orders(otherBuyer)).toEqual([]);
  expect(reopened.orders(buyer)).toEqual([
    {
      id: orderId,
      currency: 'CNY',
      totalMinor: 9800,
      createdAt: expect.any(String),
      lines: [
        {
          bookId: firstBook,
          title: 'React 应用架构',
          priceMinor: 4900,
          quantity: 2,
        },
      ],
    },
  ]);
  expect(reopened.setCartItem(buyer, firstBook, 2)).toMatchObject({
    created: true,
  });
  expect(reopened.cart(buyer)[0].revision).not.toBe(cny.revision);
});

it('rejects a stale cart and leaves all books untouched when a second shopper buys the available stock', async () => {
  seed();
  const { shop, catalog } = openShop();
  expect(shop.setCartItem(buyer, firstBook, 4)).toMatchObject({
    created: true,
  });
  expect(shop.setCartItem(buyer, secondBook, 4)).toMatchObject({
    created: true,
  });
  const oldCartQuote = quoteFor(shop, buyer, shop.cart(buyer)[0]);

  expect(shop.setCartItem(buyer, firstBook, 3)).toMatchObject({
    created: false,
  });
  expect(
    shop.submitQuote(buyer, oldCartQuote.quoteId, oldCartQuote.quoteId),
  ).toEqual({
    error: 'changed',
  });
  expect(await catalog.get(firstBook)).toMatchObject({ stock: 5 });

  const oldPrice = quoteFor(shop, buyer, shop.cart(buyer)[0]);
  const connection = new DatabaseSync(join(dir, 'demo.sqlite'));
  try {
    connection
      .prepare('UPDATE books SET price_minor = ? WHERE id = ?')
      .run(5700, secondBook);
  } finally {
    connection.close();
  }
  expect(shop.quote(buyer, oldPrice.quoteId)).toEqual(oldPrice);
  expect(shop.submitQuote(buyer, oldPrice.quoteId, oldPrice.quoteId)).toEqual({
    error: 'changed',
  });
  expect(shop.cart(buyer)[0].totalMinor).toBe(37500);
  const newQuote = quoteFor(shop, buyer, shop.cart(buyer)[0]);
  expect(shop.setCartItem(otherBuyer, secondBook, 5)).toMatchObject({
    created: true,
  });
  const otherQuote = quoteFor(shop, otherBuyer, shop.cart(otherBuyer)[0]);
  expect(
    shop.submitQuote(otherBuyer, otherQuote.quoteId, otherQuote.quoteId),
  ).toHaveProperty('submission.order.orderId');
  expect(shop.submitQuote(buyer, newQuote.quoteId, newQuote.quoteId)).toEqual({
    error: 'stock',
  });
  expect(await catalog.get(firstBook)).toMatchObject({ stock: 5 });
  expect(await catalog.get(secondBook)).toMatchObject({ stock: 1 });
  expect(shop.cart(buyer)[0].lines).toHaveLength(2);
  expect(shop.orders(buyer)).toEqual([]);
});

it('rejects an expired quote without modifying the cart or stock', async () => {
  seed();
  const { shop, catalog } = openShop();
  expect(shop.setCartItem(buyer, firstBook, 1)).toMatchObject({
    created: true,
  });
  const quote = quoteFor(shop, buyer, shop.cart(buyer)[0]);
  const db = new DatabaseSync(join(dir, 'demo.sqlite'));
  try {
    db.prepare('UPDATE demo_order_quotes SET expires_at = ? WHERE id = ?').run(
      '2000-01-01T00:00:00.000Z',
      quote.quoteId,
    );
  } finally {
    db.close();
  }
  expect(shop.submitQuote(buyer, quote.quoteId, quote.quoteId)).toEqual({
    error: 'expired',
  });
  expect(shop.cart(buyer)[0].lines[0].quantity).toBe(1);
  expect(shop.orders(buyer)).toEqual([]);
  expect(await catalog.get(firstBook)).toMatchObject({ stock: 5 });
});
