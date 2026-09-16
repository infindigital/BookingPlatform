'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@booking/ui/button';

/**
 * Submit button that reflects the pending state of its enclosing form action,
 * giving real feedback while the server action runs (progressive enhancement:
 * the form still works without JS).
 */
export function SubmitButton({ children, disabled, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {children}
    </Button>
  );
}
