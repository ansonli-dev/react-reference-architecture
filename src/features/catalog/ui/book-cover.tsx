import type { Book } from '../model';

const palettes = [
  ['#29345e', '#faf1dc', '#d8ae61'],
  ['#d7def1', '#27345e', '#626fbe'],
  ['#753e4d', '#fff3e8', '#e1a481'],
  ['#303954', '#ecf0ff', '#86accf'],
  ['#e6d9bd', '#463328', '#a66d56'],
  ['#4d395f', '#fbebf8', '#bc9aca'],
  ['#d9dbef', '#343353', '#7974ad'],
  ['#26364a', '#eff5fa', '#78a7be'],
  ['#e8d9dd', '#4a293a', '#ac718e'],
  ['#513f3b', '#fbefdb', '#dea96e'],
] as const;

export function BookCover({
  book,
  size = 'card',
}: {
  book: Pick<Book, 'id' | 'title'> & Partial<Pick<Book, 'author' | 'coverUrl'>>;
  size?: 'card' | 'detail' | 'thumbnail';
}) {
  const seed = Number.parseInt(book.id.slice(-6), 16);
  const [paper, ink, motif] = palettes[seed % palettes.length];

  return (
    <span className="book-cover-stage" data-size={size} aria-hidden="true">
      <span
        className="book-cover-art"
        data-pattern={seed % 5}
        style={{ backgroundColor: paper, color: ink }}
      >
        <span className="book-cover-motif" style={{ color: motif }} />
        {size !== 'thumbnail' && (
          <>
            <span className="book-cover-title">{book.title}</span>
            {book.author && (
              <span className="book-cover-author">{book.author}</span>
            )}
          </>
        )}
        {book.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- The browser loads the catalog's external cover directly.
          <img
            src={book.coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </span>
    </span>
  );
}
