import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations('Shell');
  return (
    <section>
      <h1 className="font-display text-4xl">{t('notFound')}</h1>
      <Link
        href={'/' + locale}
        className="text-primary mt-5 inline-block underline"
      >
        {t('backHome')}
      </Link>
    </section>
  );
}
