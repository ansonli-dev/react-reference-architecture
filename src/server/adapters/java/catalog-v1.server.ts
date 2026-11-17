import 'server-only';
import createClient from 'openapi-fetch';
import { z } from 'zod';
import {
  bookSchema,
  catalogPage,
  catalogPageSize,
  maxCatalogPage,
} from '@/features/catalog/model';
import type { CatalogPort } from '@/features/catalog/server';
import { ApiFailure } from '@/shared/api/error';
import type { paths } from './generated/catalog-v1';

const javaBookSchema = bookSchema.omit({ priceMinor: true }).extend({
  priceCents: z.int().nonnegative(),
});
const javaPageSchema = z.array(javaBookSchema).max(catalogPageSize);
const maxBodyBytes = 256 * 1024;

function toBook({ priceCents, ...book }: z.output<typeof javaBookSchema>) {
  return { ...book, priceMinor: priceCents };
}

async function fetchCatalogJson(request: Request) {
  const response = await fetch(request);
  const { body, status } = response;
  if (status !== 200) {
    void body?.cancel().catch(() => undefined);
    return new Response(null, { status });
  }
  if (
    !body ||
    response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
      'application/json'
  ) {
    void body?.cancel().catch(() => undefined);
    throw new ApiFailure('UPSTREAM_FAILURE');
  }

  const bytes = new Uint8Array(maxBodyBytes);
  const reader = body.getReader();
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > maxBodyBytes)
        throw new ApiFailure('UPSTREAM_FAILURE');
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally {
    // Initiate cancellation without letting upstream cleanup extend the deadline.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return new Response(bytes.subarray(0, size), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readUpstream<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(2_000);
  try {
    const result = await operation(signal);
    signal.throwIfAborted();
    return result;
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
    fetch: fetchCatalogJson,
  });

  async function readPage(
    page: number,
    category: string | undefined,
    signal: AbortSignal,
  ) {
    const { response, data } = await client.GET('/api/v1/books', {
      params: { query: { category, page: page - 1, size: catalogPageSize } },
      signal,
    });
    if (response.status !== 200) throw new ApiFailure('UPSTREAM_FAILURE');
    const books = javaPageSchema.parse(data).map(toBook);
    if (new Set(books.map((book) => book.id)).size !== books.length)
      throw new ApiFailure('UPSTREAM_FAILURE');
    return books;
  }

  return {
    async list(query) {
      if (query.q !== undefined) throw new ApiFailure('UNSUPPORTED_FILTER');
      return readUpstream(async (signal) => {
        const { page, category } = query;
        const books = await readPage(page, category, signal);
        const hasNext =
          books.length === catalogPageSize &&
          page < maxCatalogPage &&
          (await readPage(page + 1, category, signal)).length > 0;
        return catalogPage(page, books, hasNext);
      });
    },
    async get(id) {
      return readUpstream(async (signal) => {
        const { response, data } = await client.GET('/api/v1/books/{id}', {
          params: { path: { id } },
          signal,
        });
        if (response.status === 404) return null;
        if (response.status !== 200) throw new ApiFailure('UPSTREAM_FAILURE');
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
