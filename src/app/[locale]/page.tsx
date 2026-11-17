import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { Button } from '@/shared/ui/button';

const boundaries = ['browser', 'renderer', 'bff', 'backend'] as const;
const exerciseQuery = '?category=Architecture';

export default async function Home({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Home' });
  const shell = await getTranslations({ locale, namespace: 'Shell' });
  const catalog = '/' + locale + '/books';
  return (
    <>
      <h1 className="font-display max-w-3xl text-4xl leading-tight sm:text-6xl">
        {t('title')}
      </h1>
      <p className="text-muted mt-5 max-w-xl text-lg leading-relaxed">
        {t('description')}
      </p>
      <Button asChild size="lg" className="mt-7">
        <Link href={catalog} prefetch={false}>
          {shell('books')} <ArrowUpRight aria-hidden />
        </Link>
      </Button>
      <section
        aria-labelledby="catalog-exercise"
        className="border-line bg-surface mt-10 max-w-3xl rounded-xl border p-5 sm:p-7"
      >
        <h2 id="catalog-exercise" className="font-display text-2xl">
          {t('exercise.title')}
        </h2>
        <ol className="text-muted mt-4 list-decimal space-y-4 ps-5 leading-relaxed">
          <li>
            {t.rich('exercise.filter', {
              query: () => (
                <code className="text-foreground">{exerciseQuery}</code>
              ),
            })}
          </li>
          <li>
            {t('exercise.compare')}
            <div className="text-primary mt-2 flex flex-wrap gap-x-5 gap-y-2 font-medium">
              <Link
                href={catalog + exerciseQuery}
                prefetch={false}
                className="underline underline-offset-4"
              >
                {t('exercise.pageLink')}
              </Link>
              <a
                href={'/api/v1/catalog/books' + exerciseQuery}
                className="underline underline-offset-4"
              >
                {t('exercise.jsonLink')}
              </a>
            </div>
          </li>
        </ol>
      </section>
      <section
        aria-labelledby="boundaries"
        className="border-line mt-10 border-t pt-8"
      >
        <h2 id="boundaries" className="text-xl font-semibold">
          {t('boundaries')}
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {boundaries.map((key) => (
            <article key={key} className="border-primary/35 border-l-2 pl-4">
              <h3 className="font-semibold">{t(key + '.title')}</h3>
              <p className="text-muted mt-2 text-sm leading-relaxed">
                {t(key + '.description')}
              </p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
