import 'server-only';
import { z } from 'zod';
import {
  bookSchema,
  catalogPage,
  catalogPageSize,
} from '@/features/catalog/model';
import type { CatalogPort } from '@/features/catalog/server';
import { ApiFailure } from '@/shared/api/error';
import type { operations } from './generated/catalog-v2';
import { readJava } from './http.server';

const pageSchema = z.object({
  page: z.int().positive(),
  hasNext: z.boolean(),
  books: z.array(bookSchema).max(catalogPageSize),
});

const categoriesSchema = z.object({
  categories: z.array(z.string().min(1).max(80)),
});

export function createJavaCatalogV2(baseUrl: string): CatalogPort {
  const books = baseUrl + '/api/v2/books';
  return {
    async list({ category, page, q }) {
      const query = {
        category,
        q,
        page,
        size: catalogPageSize,
      } satisfies NonNullable<operations['listBooks']['parameters']['query']>;
      const params = new URLSearchParams({
        page: String(query.page),
        size: String(query.size),
      });
      if (query.category) params.set('category', query.category);
      if (query.q) params.set('q', query.q);
      const { data } = await readJava(books + '?' + params, pageSchema);
      if (
        data.page !== page ||
        new Set(data.books.map((book) => book.id)).size !== data.books.length
      )
        throw new ApiFailure('UPSTREAM_FAILURE');
      return catalogPage(page, data.books, data.hasNext);
    },
    async get(id) {
      try {
        const { data } = await readJava(books + '/' + id, bookSchema);
        if (data.id !== id) throw new ApiFailure('UPSTREAM_FAILURE');
        return data;
      } catch (error) {
        if (error instanceof ApiFailure && error.code === 'BOOK_NOT_FOUND')
          return null;
        throw error;
      }
    },
    async categories() {
      const { data } = await readJava(
        baseUrl + '/api/v2/categories',
        categoriesSchema,
      );
      return data.categories;
    },
  };
}
