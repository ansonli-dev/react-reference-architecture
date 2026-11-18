'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, LogOut, ReceiptText, UserRound } from 'lucide-react';

const control =
  'text-foreground hover:bg-accent focus-visible:outline-ring inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 sm:gap-2 sm:px-3';
const item =
  'text-foreground hover:bg-accent focus-visible:outline-ring flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2';

export function AccountSignIn({
  action,
  label,
}: {
  action: string;
  label: string;
}) {
  const path = usePathname();
  const query = useSearchParams().toString();
  const href = new URL(action, 'https://bookstore.invalid');
  href.searchParams.set('returnTo', query ? path + '?' + query : path);
  return (
    <a href={href.pathname + href.search} className={control}>
      <UserRound size={17} aria-hidden />
      {label}
    </a>
  );
}

export function AccountMenu({
  label,
  orders,
  ordersHref,
  signOut,
  logoutAction,
}: {
  label: string;
  orders: string;
  ordersHref: string;
  signOut: string;
  logoutAction: string;
}) {
  return (
    <details
      className="group relative"
      onBlur={({ currentTarget, relatedTarget }) => {
        if (!currentTarget.contains(relatedTarget)) currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        const details = event.currentTarget;
        if (event.key !== 'Escape' || !details.open) return;
        event.preventDefault();
        details.open = false;
        details.querySelector('summary')?.focus();
      }}
    >
      <summary
        className={control + ' list-none [&::-webkit-details-marker]:hidden'}
      >
        <UserRound size={17} aria-hidden />
        {label}
        <ChevronDown size={14} className="group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-line bg-surface absolute end-0 top-full z-20 mt-1 w-48 rounded-xl border p-1.5 shadow-lg">
        <Link
          href={ordersHref}
          prefetch={false}
          className={item}
          onClick={({ currentTarget }) =>
            currentTarget.closest('details')?.removeAttribute('open')
          }
        >
          <ReceiptText size={16} aria-hidden />
          {orders}
        </Link>
        <form method="post" action={logoutAction}>
          <button type="submit" className={item}>
            <LogOut size={16} aria-hidden />
            {signOut}
          </button>
        </form>
      </div>
    </details>
  );
}
