import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

export default async function BookNotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'Catalog' });
  return (
    <section>
      <h1 className="font-display text-4xl">{t('notFound')}</h1>
      <Link
        href={'/' + locale + '/books'}
        className="text-primary mt-5 inline-block underline"
      >
        {t('back')}
      </Link>
    </section>
  );
}
