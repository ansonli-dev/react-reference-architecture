import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { javaAuthHref } from '@/server/auth.server';
import { Button } from '@/shared/ui/button';

export async function CheckoutSignIn({
  locale,
  returnTo,
  intent,
}: {
  locale: Locale;
  returnTo: string;
  intent: 'add' | 'cart' | 'orders' | 'resume';
}) {
  const [shell, checkout] = await Promise.all([
    getTranslations({ locale, namespace: 'Shell' }),
    getTranslations({ locale, namespace: 'Checkout' }),
  ]);
  return (
    <div className="border-line bg-surface mt-4 rounded-xl border p-4 sm:p-5">
      <p
        role={intent === 'resume' ? 'alert' : undefined}
        className="text-foreground text-sm font-medium"
      >
        {checkout('auth.' + intent)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Button asChild>
          <a href={javaAuthHref(returnTo)}>{checkout('auth.continue')}</a>
        </Button>
        <a
          href={javaAuthHref(returnTo, 'register')}
          className="text-primary inline-flex min-h-11 items-center rounded-sm text-sm font-semibold underline underline-offset-4 hover:no-underline"
        >
          {shell('register')}
        </a>
      </div>
    </div>
  );
}
