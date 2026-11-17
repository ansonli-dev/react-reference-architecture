'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { Locale } from '@/i18n/routing';

export function LanguageLink({
  target,
  suffix = '',
}: {
  target: Locale;
  suffix?: string;
}) {
  return (
    <Link
      href={'/' + target + suffix}
      hrefLang={target}
      lang={target}
      prefetch={false}
      className="hover:bg-accent rounded-md px-2 py-2 text-sm font-medium"
    >
      {target === 'en' ? 'English' : '简体中文'}
    </Link>
  );
}

export function LanguageSwitch({ target }: { target: Locale }) {
  const path = usePathname().replace(/^\/(zh-CN|en)(?=\/|$)/, '');
  const query = useSearchParams().toString();
  return (
    <LanguageLink target={target} suffix={query ? path + '?' + query : path} />
  );
}
