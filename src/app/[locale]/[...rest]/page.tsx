import { notFound } from 'next/navigation';

export default function UnknownPage() {
  // The locale layout validates the locale and sets translations for not-found.
  notFound();
}
