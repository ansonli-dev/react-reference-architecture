import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  cartQuantityValue,
  currencySchema,
  maxBookQuantity,
  maxCartTitles,
  type CartGroup,
  type CheckoutErrorNotice,
  type Currency,
  type DemoOrder,
  type OrderQuote,
} from '@/features/checkout/model';
import type { ReadDemoDb } from './db.server';

const orderLine = z.object({
  bookId: z.uuid(),
  title: z.string(),
  priceMinor: z.int().nonnegative(),
  quantity: z.int().min(1).max(maxBookQuantity),
});
const cartLine = orderLine.extend({
  currency: currencySchema,
  stock: z.int().nonnegative(),
  lineVersion: z.string(),
});
const order = z.object({
  id: z.uuid(),
  currency: currencySchema,
  totalMinor: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
});

function cartItemEtag(version: unknown) {
  return '"' + z.uuidv4().parse(version) + '"';
}

function cartGroups(db: DatabaseSync, shopper: string): CartGroup[] {
  const rows = z
    .array(cartLine)
    .parse(
      db
        .prepare(
          'SELECT c.book_id AS bookId, b.title, b.price_minor AS priceMinor, ' +
            'c.quantity, b.currency, b.stock, c.line_version AS lineVersion ' +
            'FROM demo_cart_items c JOIN books b ON b.id = c.book_id ' +
            'WHERE c.shopper_id = ? ORDER BY b.currency, c.book_id',
        )
        .all(shopper),
    );
  const groups = Map.groupBy(rows, (line) => line.currency);
  return Array.from(groups, ([currency, items]) => {
    const total = items.reduce(
      (sum, item) => sum + item.priceMinor * item.quantity,
      0,
    );
    const revision = createHash('sha256')
      .update(
        JSON.stringify(
          items.map(({ bookId, title, priceMinor, quantity, lineVersion }) => [
            bookId,
            title,
            priceMinor,
            quantity,
            lineVersion,
          ]),
        ),
      )
      .digest('hex');
    return {
      currency,
      revision,
      totalMinor: Number.isSafeInteger(total) ? total : null,
      lines: items.map(
        ({ bookId, title, priceMinor, quantity, stock, lineVersion }) => ({
          bookId,
          title,
          priceMinor,
          quantity,
          stock,
          etag: cartItemEtag(lineVersion),
        }),
      ),
    };
  });
}

function transaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

type CartWrite =
  { quantity: number; created: boolean } | { error: CheckoutErrorNotice };

function cartItem(db: DatabaseSync, shopper: string, bookId: string) {
  const row = db
    .prepare(
      'SELECT quantity, line_version AS version FROM demo_cart_items WHERE shopper_id = ? AND book_id = ?',
    )
    .get(shopper, bookId);
  return row
    ? {
        quantity: cartQuantityValue.parse(row.quantity),
        etag: cartItemEtag(row.version),
      }
    : null;
}

const storedQuote = z.object({
  quoteId: z.uuidv4(),
  revision: z.string(),
  currency: currencySchema,
  totalMinor: z.int().nonnegative(),
  expiresAt: z.iso.datetime(),
  linesJson: z.string(),
});
const storedSubmission = z.object({
  submissionId: z.uuidv4(),
  quoteId: z.uuidv4(),
  orderId: z.uuidv4(),
});

type PlacedSubmission = {
  submissionId: string;
  state: 'PLACED';
  order: { orderId: string };
};

function quoteById(db: DatabaseSync, shopper: string, id: string) {
  const row = db
    .prepare(
      'SELECT id AS quoteId, cart_revision AS revision, currency, ' +
        'total_minor AS totalMinor, expires_at AS expiresAt, lines_json AS linesJson ' +
        'FROM demo_order_quotes WHERE shopper_id = ? AND id = ?',
    )
    .get(shopper, id);
  if (!row) return null;
  const { revision, linesJson, ...values } = storedQuote.parse(row);
  return {
    revision,
    quote: {
      ...values,
      lines: z.array(orderLine).parse(JSON.parse(linesJson)),
    },
  };
}

function placed({
  submissionId,
  orderId,
}: z.infer<typeof storedSubmission>): PlacedSubmission {
  return { submissionId, state: 'PLACED', order: { orderId } };
}

function checkCart(
  db: DatabaseSync,
  shopper: string,
  currency: Currency,
  revision: string,
):
  | { group: CartGroup & { totalMinor: number } }
  | { error: CheckoutErrorNotice } {
  const group = cartGroups(db, shopper).find(
    (cart) => cart.currency === currency,
  );
  if (!group) return { error: 'empty' };
  if (group.revision !== revision) return { error: 'changed' };
  if (group.totalMinor === null) return { error: 'total' };
  if (group.lines.some((line) => line.stock < line.quantity))
    return { error: 'stock' };
  return { group: { ...group, totalMinor: group.totalMinor } };
}

function writeQuantity(
  db: DatabaseSync,
  shopper: string,
  bookId: string,
  quantity: number,
  matches?: (etag: string | null) => boolean,
): CartWrite {
  const current = cartItem(db, shopper, bookId);
  if (matches && !matches(current?.etag ?? null))
    return { error: 'precondition' };
  if (quantity === 0) {
    db.prepare(
      'DELETE FROM demo_cart_items WHERE shopper_id = ? AND book_id = ?',
    ).run(shopper, bookId);
    return { quantity: 0, created: false };
  }
  const book = db.prepare('SELECT stock FROM books WHERE id = ?').get(bookId);
  if (!book) return { error: 'missing' };
  if (!cartQuantityValue.safeParse(quantity).success)
    return { error: 'invalid' };
  if (current?.quantity === quantity) return { quantity, created: false };
  if (quantity > Number(book.stock)) return { error: 'stock' };
  if (!current) {
    const count = db
      .prepare(
        'SELECT COUNT(*) AS count FROM demo_cart_items WHERE shopper_id = ?',
      )
      .get(shopper);
    if (Number(count?.count) >= maxCartTitles) return { error: 'limit' };
  }
  const version = randomUUID();
  db.prepare(
    'INSERT INTO demo_cart_items (shopper_id, book_id, quantity, line_version) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT (shopper_id, book_id) DO UPDATE SET quantity = excluded.quantity, line_version = excluded.line_version',
  ).run(shopper, bookId, quantity, version);
  return { quantity, created: !current };
}

function storeOrder(
  db: DatabaseSync,
  shopper: string,
  group: CartGroup & { totalMinor: number },
) {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO demo_orders (id, shopper_id, cart_revision, currency, total_minor, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    shopper,
    group.revision,
    group.currency,
    group.totalMinor,
    new Date().toISOString(),
  );
  const insertLine = db.prepare(
    'INSERT INTO demo_order_lines (order_id, book_id, title, price_minor, quantity) VALUES (?, ?, ?, ?, ?)',
  );
  const takeStock = db.prepare(
    'UPDATE books SET stock = stock - ? WHERE id = ?',
  );
  const removeLine = db.prepare(
    'DELETE FROM demo_cart_items WHERE shopper_id = ? AND book_id = ?',
  );
  for (const { bookId, title, priceMinor, quantity } of group.lines) {
    insertLine.run(id, bookId, title, priceMinor, quantity);
    takeStock.run(quantity, bookId);
    removeLine.run(shopper, bookId);
  }
  return { orderId: id, bookIds: group.lines.map((line) => line.bookId) };
}

function orderLines(db: DatabaseSync, id: string) {
  return z
    .array(orderLine)
    .parse(
      db
        .prepare(
          'SELECT book_id AS bookId, title, price_minor AS priceMinor, quantity ' +
            'FROM demo_order_lines WHERE order_id = ? ORDER BY book_id',
        )
        .all(id),
    );
}

export function createDemoCheckout(read: ReadDemoDb, write: ReadDemoDb) {
  return {
    cart(shopper: string) {
      return read((db) => cartGroups(db, shopper));
    },
    cartItem(shopper: string, bookId: string) {
      return read((db) => cartItem(db, shopper, bookId));
    },
    setCartItem(
      shopper: string,
      bookId: string,
      quantity: number,
      matches?: (etag: string | null) => boolean,
    ) {
      return write((db) =>
        transaction(db, () =>
          writeQuantity(db, shopper, bookId, quantity, matches),
        ),
      );
    },
    createQuote(
      shopper: string,
      currency: Currency,
      revision: string,
    ): OrderQuote | { error: CheckoutErrorNotice } {
      return write((db) =>
        transaction(db, () => {
          const checked = checkCart(db, shopper, currency, revision);
          if ('error' in checked) return checked;
          const { group } = checked;
          const lines = z.array(orderLine).parse(group.lines);
          const quoteId = randomUUID();
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          db.prepare(
            'INSERT INTO demo_order_quotes (id, shopper_id, cart_revision, currency, total_minor, expires_at, lines_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            quoteId,
            shopper,
            revision,
            currency,
            group.totalMinor,
            expiresAt,
            JSON.stringify(lines),
          );
          return {
            quoteId,
            currency,
            totalMinor: group.totalMinor,
            expiresAt,
            lines,
          };
        }),
      );
    },
    quote(shopper: string, quoteId: string) {
      return read((db) => quoteById(db, shopper, quoteId)?.quote ?? null);
    },
    submitQuote(
      shopper: string,
      quoteId: string,
      key: string,
    ):
      | { submission: PlacedSubmission; created: boolean; bookIds: string[] }
      | { error: CheckoutErrorNotice } {
      return write((db) =>
        transaction(db, () => {
          const replay = db
            .prepare(
              'SELECT id AS submissionId, quote_id AS quoteId, order_id AS orderId ' +
                'FROM demo_order_submissions WHERE shopper_id = ? AND idempotency_key = ?',
            )
            .get(shopper, key);
          if (replay) {
            const existing = storedSubmission.parse(replay);
            if (existing.quoteId !== quoteId) return { error: 'conflict' };
            return {
              submission: placed(existing),
              created: false,
              bookIds: [],
            };
          }
          const found = quoteById(db, shopper, quoteId);
          if (!found) return { error: 'quoteMissing' };
          if (
            db
              .prepare(
                'SELECT 1 FROM demo_order_submissions WHERE quote_id = ?',
              )
              .get(quoteId)
          )
            return { error: 'consumed' };
          if (Date.parse(found.quote.expiresAt) <= Date.now())
            return { error: 'expired' };
          const checked = checkCart(
            db,
            shopper,
            found.quote.currency,
            found.revision,
          );
          if ('error' in checked) return checked;
          const { orderId, bookIds } = storeOrder(db, shopper, checked.group);
          const submissionId = randomUUID();
          db.prepare(
            'INSERT INTO demo_order_submissions (id, shopper_id, quote_id, idempotency_key, order_id) VALUES (?, ?, ?, ?, ?)',
          ).run(submissionId, shopper, quoteId, key, orderId);
          return {
            submission: placed({ submissionId, quoteId, orderId }),
            created: true,
            bookIds,
          };
        }),
      );
    },
    submission(shopper: string, id: string) {
      return read((db) => {
        const row = db
          .prepare(
            'SELECT id AS submissionId, quote_id AS quoteId, order_id AS orderId ' +
              'FROM demo_order_submissions WHERE shopper_id = ? AND id = ?',
          )
          .get(shopper, id);
        return row ? placed(storedSubmission.parse(row)) : null;
      });
    },
    order(shopper: string, id: string): DemoOrder | null {
      return read((db) => {
        const row = db
          .prepare(
            'SELECT id, currency, total_minor AS totalMinor, created_at AS createdAt ' +
              'FROM demo_orders WHERE shopper_id = ? AND id = ?',
          )
          .get(shopper, id);
        return row ? { ...order.parse(row), lines: orderLines(db, id) } : null;
      });
    },
    orders(shopper: string): DemoOrder[] {
      return read((db) => {
        const orders = z
          .array(order)
          .parse(
            db
              .prepare(
                'SELECT id, currency, total_minor AS totalMinor, created_at AS createdAt ' +
                  'FROM demo_orders WHERE shopper_id = ? ORDER BY created_at DESC, rowid DESC',
              )
              .all(shopper),
          );
        return orders.map((order) => ({
          ...order,
          lines: orderLines(db, order.id),
        }));
      });
    },
  };
}
