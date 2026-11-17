import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Book } from '../model';
import { BookCover } from './book-cover';

export function formatBookPrice(
  locale: string,
  book: Pick<Book, 'priceMinor' | 'currency'>,
) {
  const digits = String(book.priceMinor).padStart(3, '0');
  // Intl accepts an exact decimal string, so the last cent survives at Number.MAX_SAFE_INTEGER.
  const amount = (digits.slice(0, -2) + '.' + digits.slice(-2)) as `${number}`;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: book.currency,
  }).format(amount);
}

export function BookCard({
  book,
  href,
  locale,
  stock,
}: {
  book: Book;
  href: string;
  locale: string;
  stock: string;
}) {
  return (
    <article className="group border-line hover:border-input bg-surface relative flex min-w-0 flex-col rounded-xl border">
      <BookCover book={book} />
      <div className="flex grow flex-col p-3 sm:p-4">
        <p className="text-muted text-xs font-medium wrap-anywhere">
          {book.category}
        </p>
        <h2 className="mt-1.5 text-base leading-snug font-semibold wrap-anywhere">
          <Link
            href={href}
            prefetch={false}
            className="group-hover:text-primary rounded-sm after:absolute after:inset-0 after:rounded-xl"
          >
            {book.title}
          </Link>
        </h2>
        <p className="text-muted mt-1 text-sm wrap-anywhere">{book.author}</p>
        <div className="mt-auto flex items-end justify-between gap-1.5 pt-4">
          <div className="min-w-0">
            <p className="text-lg leading-tight font-bold tracking-tight tabular-nums">
              {formatBookPrice(locale, book)}
            </p>
            <p className="text-muted mt-0.5 text-xs">{stock}</p>
          </div>
          <ChevronRight
            className="text-primary hidden shrink-0 sm:block"
            size={17}
            aria-hidden
          />
        </div>
      </div>
    </article>
  );
}
