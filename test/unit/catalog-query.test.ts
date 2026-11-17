import { expect, it } from 'vitest';
import {
  catalogPage,
  parseBookId,
  parseCatalogQuery,
  type Book,
} from '@/features/catalog/model';

it('normalizes catalog URL fields and defaults to page one', () => {
  expect(
    parseCatalogQuery(
      new URLSearchParams('category=Architecture%20&q=%20React%20'),
    ),
  ).toEqual({
    category: 'Architecture',
    q: 'React',
    page: 1,
  });
  expect(parseCatalogQuery({ page: '100' })).toEqual({ page: 100 });
});

it.each([
  'page=0',
  'page=101',
  'page=2&page=3',
  'page=1.0',
  'page=01',
  'page=1e1',
  'category=A&category=B',
  'q=',
  'q=%20',
  'q=' + 'x'.repeat(65),
  'category=' + 'a'.repeat(81),
])('rejects invalid catalog query %s', (input) =>
  expect(() => parseCatalogQuery(new URLSearchParams(input))).toThrow(
    'INVALID_INPUT',
  ),
);

it('rejects repeated values from Next search params and validates UUIDs', () => {
  expect(() => parseCatalogQuery({ page: ['1', '2'] })).toThrow(
    'INVALID_INPUT',
  );
  expect(() => parseBookId('not-a-book')).toThrow('INVALID_INPUT');
  expect(parseBookId('ABCDEF00-0000-4000-8000-000000000101')).toBe(
    'abcdef00-0000-4000-8000-000000000101',
  );
});

it('never exposes a next page after page 100 even when the page is full', () => {
  const book: Book = {
    id: '00000000-0000-4000-8000-000000000101',
    title: 'React',
    author: 'Anson',
    category: 'Architecture',
    currency: 'CNY',
    priceMinor: 4900,
    stock: 5,
  };
  const books = Array.from({ length: 12 }, () => book);
  expect(catalogPage(99, books, true).hasNext).toBe(true);
  expect(catalogPage(100, books, true).hasNext).toBe(false);
});
