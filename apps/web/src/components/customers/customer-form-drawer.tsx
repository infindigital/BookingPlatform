'use client';

import { useActionState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerActionState,
} from '@/server/customers/actions';
import type { CustomerEditSeed } from './customer-detail-drawer';

const CONTROL =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CustomerFormDrawer({
  open,
  onOpenChange,
  seed,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode; null → create mode. */
  seed: CustomerEditSeed | null;
  onSaved: (customerId: string) => void;
}) {
  const isEdit = !!seed;
  const [state, action, pending] = useActionState<CustomerActionState, FormData>(
    isEdit ? updateCustomerAction : createCustomerAction,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok && state.customerId) onSaved(state.customerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.customerId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[26rem] max-w-[95vw] p-0">
        {open ? (
          <form action={action} className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-border p-5">
              <SheetTitle className="text-base font-semibold">{isEdit ? 'Edit customer' : 'New customer'}</SheetTitle>
              <SheetClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close">
                  <X />
                </Button>
              </SheetClose>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {isEdit ? <input type="hidden" name="customerId" value={seed!.id} /> : null}
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">First name *</span>
                  <input name="firstName" required defaultValue={seed?.firstName ?? ''} className={CONTROL} autoComplete="given-name" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Last name</span>
                  <input name="lastName" defaultValue={seed?.lastName ?? ''} className={CONTROL} autoComplete="family-name" />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Email *</span>
                <input name="email" type="email" required defaultValue={seed?.email ?? ''} className={CONTROL} autoComplete="email" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Phone</span>
                <input name="phone" type="tel" defaultValue={seed?.phone ?? ''} className={CONTROL} autoComplete="tel" />
              </label>

              {state.error ? (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {state.error}
                </p>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
              <SheetClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
              </Button>
            </footer>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
