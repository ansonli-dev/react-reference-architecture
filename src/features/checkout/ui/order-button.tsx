'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/shared/ui/button';

export function CheckoutButton({
  label,
  pendingLabel,
  blocked,
  children,
}: {
  label: string;
  pendingLabel: string;
  blocked: boolean;
  children?: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending || blocked}
      className="w-full"
    >
      {children}
      {pending ? pendingLabel : label}
    </Button>
  );
}
