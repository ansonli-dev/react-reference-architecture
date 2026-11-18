import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { javaLoginHref } from '@/server/auth.server';
import { Button } from '@/shared/ui/button';

export async function CheckoutSignIn({
  locale,
  returnTo,
}: {
  locale: Locale;
  returnTo: string;
}) {
  const [shell, checkout] = await Promise.all([
    getTranslations({ locale, namespace: 'Shell' }),
    getTranslations({ locale, namespace: 'Checkout' }),
  ]);
  return (
    <div className="mt-4">
      <p className="text-muted mb-2 text-sm">{checkout('notices.signIn')}</p>
      <Button asChild>
        <a href={javaLoginHref(returnTo)}>{shell('signIn')}</a>
      </Button>
    </div>
  );
}
