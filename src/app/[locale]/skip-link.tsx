'use client';

import Link from 'next/link';

export function SkipLink({ label }: { label: string }) {
  return (
    <Link
      href="#main"
      prefetch={false}
      onNavigate={() => document.getElementById('main')?.focus()}
      className="focus:bg-surface sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10 focus:rounded-md focus:px-4 focus:py-2"
    >
      {label}
    </Link>
  );
}
