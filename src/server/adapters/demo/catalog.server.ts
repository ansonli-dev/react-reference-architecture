import 'server-only';
import {
  bookSchema,
  catalogPage,
  catalogPageSize,
} from '@/features/catalog/model';
import type { CatalogPort } from '@/features/catalog/server';
import type { ReadDemoDb } from './db.server';

const fields =
  'id, title, author, category, price_minor AS priceMinor, currency, stock';

export function createDemoCatalog(read: ReadDemoDb): CatalogPort {
  return {
    async list(query) {
      const category = query.category ?? null;
      const q = query.q ?? null;
      return read((db) => {
        const rows = db
          .prepare(
            'SELECT ' +
              fields +
              ' FROM books WHERE (? IS NULL OR category = ?) ' +
              "AND (? IS NULL OR instr(lower(title || ' ' || author), lower(?)) > 0) " +
              'ORDER BY id LIMIT ? OFFSET ?',
          )
          .all(
            category,
            category,
            q,
            q,
            catalogPageSize + 1,
            (query.page - 1) * catalogPageSize,
          );
        const books = rows
          .slice(0, catalogPageSize)
          .map((row) => bookSchema.parse(row));
        return catalogPage(query.page, books, rows.length > catalogPageSize);
      });
    },
    async get(id) {
      return read((db) => {
        const row = db
          .prepare('SELECT ' + fields + ' FROM books WHERE id = ?')
          .get(id);
        return row ? bookSchema.parse(row) : null;
      });
    },
    async categories() {
      return read((db) =>
        db
          .prepare('SELECT DISTINCT category FROM books ORDER BY category')
          .all()
          .map(({ category }) => bookSchema.shape.category.parse(category)),
      );
    },
  };
}
