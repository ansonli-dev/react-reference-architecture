import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import type { CatalogPort } from '@/features/catalog/server';
import {
  maxCartTitles,
  shopperIdSchema,
  type CartGroup,
  type Currency,
} from '@/features/checkout/model';
import { ApiFailure } from '@/shared/api/error';
import type { JavaSubmission, createJavaOrderV2 } from './order-v2.server';

type CartItem = {
  bookId: string;
  quantity: number;
  revision: string;
  title: string;
  priceMinor: string;
};

const draftLines = z.array(
  z.object({ bookId: z.uuid(), revision: shopperIdSchema }),
);

type OrderService = ReturnType<typeof createJavaOrderV2>;

function etag(revision: string) {
  return '"' + revision + '"';
}

export function createJavaCart(
  db: Sql,
  subject: string,
  catalog: CatalogPort,
  orders: OrderService,
) {
  async function lockDraft(tx: TransactionSql) {
    await tx`INSERT INTO bookstore_cart_drafts (subject) VALUES (${subject}) ON CONFLICT DO NOTHING`;
    await tx`SELECT subject FROM bookstore_cart_drafts WHERE subject = ${subject} FOR UPDATE`;
  }

  async function cartItem(bookId: string, query: Sql | TransactionSql = db) {
    const [item] = await query<Pick<CartItem, 'quantity' | 'revision'>[]>`
      SELECT quantity, revision FROM bookstore_cart_items
      WHERE subject = ${subject} AND book_id = ${bookId}
    `;
    return item ? { quantity: item.quantity, etag: etag(item.revision) } : null;
  }

  async function setCartItem(
    bookId: string,
    quantity: number,
    matches: (etag: string | null) => boolean,
  ) {
    return db.begin(async (tx) => {
      await lockDraft(tx);
      const current = await cartItem(bookId, tx);
      if (!matches(current?.etag ?? null))
        throw new ApiFailure('CART_ITEM_PRECONDITION_FAILED');
      if (quantity === 0) {
        await tx`DELETE FROM bookstore_cart_items WHERE subject = ${subject} AND book_id = ${bookId}`;
      } else if (current?.quantity !== quantity) {
        const book = await catalog.get(bookId);
        if (!book) throw new ApiFailure('BOOK_NOT_FOUND');
        if (book.currency !== 'CNY')
          throw new ApiFailure('UNSUPPORTED_CURRENCY');
        if (quantity > book.stock) throw new ApiFailure('INSUFFICIENT_STOCK');
        if (!current) {
          const [limit] = await tx<[{ reached: boolean }]>`
            SELECT COUNT(*) >= ${maxCartTitles} AS reached
            FROM bookstore_cart_items WHERE subject = ${subject}
          `;
          if (limit.reached) throw new ApiFailure('CART_LIMIT');
        }
        await tx`
          INSERT INTO bookstore_cart_items (subject, book_id, quantity, revision, title, price_minor)
          VALUES (${subject}, ${bookId}, ${quantity}, ${randomUUID()}, ${book.title}, ${book.priceMinor})
          ON CONFLICT (subject, book_id) DO UPDATE SET quantity = excluded.quantity,
            revision = excluded.revision, title = excluded.title, price_minor = excluded.price_minor
        `;
      }
      return { quantity, created: !current && quantity > 0 };
    });
  }

  async function snapshot() {
    const items = await db<CartItem[]>`
      SELECT book_id AS "bookId", quantity, revision, title, price_minor AS "priceMinor"
      FROM bookstore_cart_items WHERE subject = ${subject} ORDER BY book_id
    `;
    if (!items.length) return null;

    const lines = await Promise.all(
      items.map(async (item) => {
        const book = await catalog.get(item.bookId);
        return {
          bookId: item.bookId,
          quantity: item.quantity,
          title: book?.title ?? item.title,
          stock: book?.currency === 'CNY' ? book.stock : 0,
          priceMinor:
            book?.currency === 'CNY'
              ? book.priceMinor
              : Number(item.priceMinor),
          etag: etag(item.revision),
        };
      }),
    );
    const total = lines.reduce(
      (sum, item) => sum + item.priceMinor * item.quantity,
      0,
    );
    const revision = createHash('sha256')
      .update(
        JSON.stringify(
          lines.map(({ bookId, quantity, priceMinor, title, etag }) => [
            bookId,
            quantity,
            priceMinor,
            title,
            etag,
          ]),
        ),
      )
      .digest('hex');
    const group: CartGroup = {
      currency: 'CNY',
      revision,
      totalMinor: Number.isSafeInteger(total) ? total : null,
      lines,
    };
    return {
      group,
      draft: items.map(({ bookId, revision }) => ({ bookId, revision })),
    };
  }

  async function applySubmission(submission: JavaSubmission, quoteId?: string) {
    await db.begin(async (tx) => {
      await lockDraft(tx);
      const [row] = quoteId
        ? await tx<
            {
              quoteId: string;
              draft: unknown;
              submissionId: string | null;
              state: string | null;
            }[]
          >`
            SELECT quote_id AS "quoteId", draft_lines AS draft, submission_id AS "submissionId", state
            FROM bookstore_checkout_quotes WHERE subject = ${subject} AND quote_id = ${quoteId}
          `
        : await tx<
            {
              quoteId: string;
              draft: unknown;
              submissionId: string;
              state: string | null;
            }[]
          >`
            SELECT quote_id AS "quoteId", draft_lines AS draft, submission_id AS "submissionId", state
            FROM bookstore_checkout_quotes WHERE subject = ${subject} AND submission_id = ${submission.submissionId}
          `;
      if (!row) return;
      if (row.submissionId && row.submissionId !== submission.submissionId)
        throw new ApiFailure('UPSTREAM_FAILURE');
      if (
        row.state === 'PLACED' ||
        row.state === 'REJECTED' ||
        row.state === submission.state
      )
        return;

      if (submission.state === 'PLACED') {
        for (const line of draftLines.parse(row.draft)) {
          await tx`DELETE FROM bookstore_cart_items
            WHERE subject = ${subject} AND book_id = ${line.bookId} AND revision = ${line.revision}`;
        }
      }
      await tx`UPDATE bookstore_checkout_quotes
        SET submission_id = ${submission.submissionId}, state = ${submission.state}
        WHERE subject = ${subject} AND quote_id = ${row.quoteId}`;
    });
  }

  async function submission(id: string) {
    const result = await orders.submission(id);
    await applySubmission(result);
    return result;
  }

  return {
    cartItem,
    setCartItem,
    async cart() {
      const pending = await db<{ id: string }[]>`
        SELECT submission_id AS id FROM bookstore_checkout_quotes
        WHERE subject = ${subject} AND state IN ('PROCESSING', 'RECONCILE_REQUIRED')
      `;
      // A temporary Order failure should not prevent editing a cart.
      await Promise.allSettled(pending.map(({ id }) => submission(id)));
      const current = await snapshot();
      return current ? [current.group] : [];
    },
    async createQuote(currency: Currency, revision: string) {
      if (currency !== 'CNY') throw new ApiFailure('UNSUPPORTED_CURRENCY');
      const current = await snapshot();
      if (!current) throw new ApiFailure('CART_EMPTY');
      const { group, draft } = current;
      if (group.revision !== revision) throw new ApiFailure('CART_CHANGED');
      if (group.totalMinor === null)
        throw new ApiFailure('AMOUNT_OUT_OF_RANGE');
      if (group.lines.some((line) => line.quantity > line.stock))
        throw new ApiFailure('INSUFFICIENT_STOCK');

      const quote = await orders.createQuote(
        group.lines.map(({ bookId, quantity }) => ({ bookId, quantity })),
      );
      const quantities = new Map(
        group.lines.map(({ bookId, quantity }) => [bookId, quantity]),
      );
      if (
        quote.lines.length !== quantities.size ||
        new Set(quote.lines.map((line) => line.bookId)).size !==
          quantities.size ||
        quote.lines.some(
          (line) => quantities.get(line.bookId) !== line.quantity,
        )
      )
        throw new ApiFailure('UPSTREAM_FAILURE');

      await db`INSERT INTO bookstore_checkout_quotes (subject, quote_id, draft_lines)
        VALUES (${subject}, ${quote.quoteId}, ${db.json(draft)})`;
      return quote;
    },
    quote: orders.quote,
    async submitQuote(quoteId: string, key: string) {
      const result = await orders.submit(quoteId, key);
      await applySubmission(result, quoteId);
      return result;
    },
    submission,
  };
}
