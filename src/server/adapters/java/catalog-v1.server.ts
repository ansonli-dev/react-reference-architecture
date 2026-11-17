import 'server-only';
import createClient from 'openapi-fetch';
import { z } from 'zod';
import {
  bookSchema,
  catalogPage,
  catalogPageSize,
} from '@/features/catalog/model';
import type { CatalogPort } from '@/features/catalog/server';
import { ApiFailure } from '@/shared/api/error';
import type { paths } from './generated/catalog-v1';

const javaBookSchema = bookSchema.omit({ priceMinor: true }).extend({
  priceCents: z.int().nonnegative(),
});
const javaPageSchema = z.array(javaBookSchema).max(catalogPageSize);

function toBook({ priceCents, ...book }: z.output<typeof javaBookSchema>) {
  return { ...book, priceMinor: priceCents };
}

function requireJson(response: Response) {
  if (
    response.status !== 200 ||
    response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
      'application/json'
  ) {
    throw new ApiFailure('UPSTREAM_FAILURE');
  }
}

async function readUpstream<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(2_000);
  try {
    return await operation(signal);
  } catch {
    throw new ApiFailure(
      signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILURE',
    );
  }
}

type JavaCatalogConfig = {
  baseUrl: string;
  categories: string[];
  token?: string;
};

export function createJavaCatalogV1(config: JavaCatalogConfig): CatalogPort {
  const headers = new Headers({ Accept: 'application/json' });
  if (config.token) headers.set('Authorization', 'Bearer ' + config.token);
  const client = createClient<paths>({
    baseUrl: config.baseUrl,
    headers,
    redirect: 'error',
    cache: 'no-store',
    fetch: (request) => fetch(request),
  });

  return {
    async list(query) {
      if (query.q !== undefined) throw new ApiFailure('UNSUPPORTED_FILTER');
      return readUpstream(async (signal) => {
        const { response, data } = await client.GET('/api/v1/books', {
          params: {
            query: {
              category: query.category,
              page: query.page - 1,
              size: catalogPageSize,
            },
          },
          signal,
        });
        requireJson(response);
        const books = javaPageSchema.parse(data).map(toBook);
        if (new Set(books.map((book) => book.id)).size !== books.length)
          throw new ApiFailure('UPSTREAM_FAILURE');
        return catalogPage(query.page, books, books.length === catalogPageSize);
      });
    },
    async get(id) {
      return readUpstream(async (signal) => {
        const { response, data } = await client.GET('/api/v1/books/{id}', {
          params: { path: { id } },
          signal,
        });
        if (response.status === 404) return null;
        requireJson(response);
        const book = toBook(javaBookSchema.parse(data));
        if (book.id !== id) throw new ApiFailure('UPSTREAM_FAILURE');
        return book;
      });
    },
    async categories() {
      return [...config.categories];
    },
  };
}
