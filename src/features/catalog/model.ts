import { z } from 'zod';
import { ApiFailure } from '@/shared/api/error';

export const catalogPageSize = 12;
export const maxCatalogPage = 100;

const bookIdSchema = z.uuid().transform((value) => value.toLowerCase());

export const bookSchema = z.object({
  id: bookIdSchema,
  title: z.string().min(1).max(500),
  author: z.string().min(1).max(200),
  category: z.string().min(1).max(200),
  priceMinor: z.int().nonnegative(),
  currency: z.enum(['CNY', 'USD']),
  stock: z.int32().nonnegative(),
});

const querySchema = z.strictObject({
  category: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().min(1).max(64).optional(),
  page: z
    .string()
    .regex(/^[1-9][0-9]{0,2}$/)
    .transform(Number)
    .pipe(z.int().max(maxCatalogPage))
    .default(1),
});

export type Book = z.infer<typeof bookSchema>;
export type CatalogQuery = z.infer<typeof querySchema>;
export type BookPage = { books: Book[]; page: number; hasNext: boolean };

export function parseBookId(input: unknown) {
  const result = bookIdSchema.safeParse(input);
  if (!result.success) throw new ApiFailure('INVALID_INPUT');
  return result.data;
}

export function parseCatalogQuery(input: unknown): CatalogQuery {
  if (input instanceof URLSearchParams) {
    if (new Set(input.keys()).size !== input.size)
      throw new ApiFailure('INVALID_INPUT');
    input = Object.fromEntries(input);
  }
  const result = querySchema.safeParse(input);
  if (!result.success) throw new ApiFailure('INVALID_INPUT');
  return result.data;
}

export function catalogPage(
  page: number,
  books: Book[],
  hasMore: boolean,
): BookPage {
  return { page, books, hasNext: page < maxCatalogPage && hasMore };
}
