// Adapted from the MIT-licensed shadcn new-york-v4 registry.
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-surface placeholder:text-muted focus-visible:outline-ring h-10 w-full min-w-0 rounded-md border px-3 py-1 text-base focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
