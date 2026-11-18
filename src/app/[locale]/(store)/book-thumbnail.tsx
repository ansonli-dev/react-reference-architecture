import { BookCover } from '@/features/catalog/client';

export function renderBookThumbnail(bookId: string, title: string) {
  return <BookCover book={{ id: bookId, title }} size="thumbnail" />;
}
