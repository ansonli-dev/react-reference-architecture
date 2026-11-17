'use client';

import { usePathname } from 'next/navigation';
import { Button } from '@/shared/ui/button';
import english from '../../../../../messages/en.json';
import chinese from '../../../../../messages/zh-CN.json';

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  const { Catalog: labels } = usePathname().startsWith('/en/')
    ? english
    : chinese;
  return (
    <div role="alert" className="border-line bg-surface rounded-lg border p-5">
      <p>{labels.unavailable}</p>
      <Button type="button" onClick={reset} className="mt-3">
        {labels.retry}
      </Button>
    </div>
  );
}
