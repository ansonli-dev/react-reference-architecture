import 'server-only';
import type { Book, BookPage, CatalogQuery } from './model';

export interface CatalogPort {
  list(input: CatalogQuery): Promise<BookPage>;
  get(bookId: string): Promise<Book | null>;
  categories(): Promise<string[]>;
}
