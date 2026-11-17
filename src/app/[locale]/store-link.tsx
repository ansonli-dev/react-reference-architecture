'use client';

import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Props = { href: string; children: ReactNode };
const style =
  'text-muted hover:bg-accent aria-[current]:bg-accent aria-[current]:text-primary inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold sm:gap-2 sm:px-3';

function CurrentStoreLink({ href, children }: Props) {
  const path = usePathname();
  const current =
    path === href
      ? 'page'
      : path.startsWith(href + '/')
        ? 'location'
        : undefined;
  return (
    <Link href={href} prefetch={false} aria-current={current} className={style}>
      {children}
    </Link>
  );
}

export function StoreLink({ href, children }: Props) {
  return (
    <Suspense
      fallback={
        <Link href={href} prefetch={false} className={style}>
          {children}
        </Link>
      }
    >
      <CurrentStoreLink href={href}>{children}</CurrentStoreLink>
    </Suspense>
  );
}
