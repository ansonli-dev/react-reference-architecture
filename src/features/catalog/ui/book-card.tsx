import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/shared/lib/utils';
import type { Book } from '../model';

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

export function BookCover({
  category,
  detail = false,
}: {
  category: string;
  detail?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-accent grid place-items-center',
        category === 'Programming' && 'bg-line/55',
        detail
          ? 'min-h-64 rounded-xl p-8 sm:min-h-80'
          : 'aspect-[5/3] px-5 py-4',
      )}
    >
      <Image
        src="/books/placeholder.svg"
        alt=""
        width={176}
        height={240}
        unoptimized
        className={cn(
          'h-auto drop-shadow-md',
          detail ? 'w-36 sm:w-44' : 'w-[35%] max-w-28',
        )}
      />
    </div>
  );
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
    <article className="border-line bg-surface flex min-w-0 flex-col overflow-hidden rounded-lg border">
      <BookCover category={book.category} />
      <div className="flex grow flex-col p-4">
        <p className="text-muted text-xs font-medium wrap-anywhere">
          {book.category}
        </p>
        <h2 className="font-display mt-1.5 text-xl leading-snug wrap-anywhere">
          <Link
            href={href}
            prefetch={false}
            className="hover:text-primary rounded-sm hover:underline"
          >
            {book.title}
          </Link>
        </h2>
        <p className="text-muted mt-1 text-sm wrap-anywhere">{book.author}</p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-1 pt-5 text-sm">
          <p className="text-primary font-semibold">
            {formatBookPrice(locale, book)}
          </p>
          <p className="text-muted">{stock}</p>
        </div>
      </div>
    </article>
  );
}
