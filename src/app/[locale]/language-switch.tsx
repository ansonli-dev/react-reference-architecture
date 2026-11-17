'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { Locale } from '@/i18n/routing';

export function LanguageSwitch({
  target,
  label,
}: {
  target: Locale;
  label: string;
}) {
  const path = usePathname().replace(/^\/(zh-CN|en)(?=\/|$)/, '');
  const query = useSearchParams().toString();
  const href = '/' + target + path + (query ? '?' + query : '');
  return (
    <Link
      href={href}
      hrefLang={target}
      lang={target}
      prefetch={false}
      className="text-muted hover:bg-accent inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium"
    >
      {label}
    </Link>
  );
}
