'use client';

import { useActionState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import type { LocationMode } from '@booking/db';
import {
  createLocationAction,
  updateLocationAction,
  type LocationActionState,
} from '@/server/locations/actions';

export interface LocationEditSeed {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  instructions: string | null;
  mode: LocationMode;
  isActive: boolean;
}

const CONTROL =
  'h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const MODE_OPTIONS: { value: LocationMode; label: string; hint: string }[] = [
  { value: 'IN_PERSON', label: 'In person', hint: 'Customers come to this address.' },
  { value: 'MOBILE', label: 'Mobile', hint: 'You travel to the customer’s address.' },
  { value: 'VIRTUAL', label: 'Virtual', hint: 'Online / phone appointment, no physical address.' },
];

export function LocationFormDrawer({
  open,
  onOpenChange,
  seed,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present -> edit mode; null -> create mode. */
  seed: LocationEditSeed | null;
  onSaved: () => void;
}) {
  const isEdit = !!seed;
  const [state, action, pending] = useActionState<LocationActionState, FormData>(
    isEdit ? updateLocationAction : createLocationAction,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.locationId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[28rem] max-w-[95vw] p-0">
        {open ? (
          <form action={action} className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-border p-5">
              <SheetTitle className="text-base font-semibold">
                {isEdit ? 'Edit location' : 'New location'}
              </SheetTitle>
              <SheetClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close">
                  <X />
                </Button>
              </SheetClose>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {isEdit ? <input type="hidden" name="locationId" value={seed!.id} /> : null}

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Location name *</span>
                <input
                  name="name"
                  required
                  defaultValue={seed?.name ?? ''}
                  className={CONTROL}
                  placeholder="e.g. Downtown Office"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Type</span>
                <select name="mode" defaultValue={seed?.mode ?? 'IN_PERSON'} className={CONTROL}>
                  {MODE_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  Mobile locations use the customer&rsquo;s address at booking time.
                </span>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Address</span>
                <input
                  name="address"
                  defaultValue={seed?.address ?? ''}
                  className={CONTROL}
                  placeholder="8101 E. Bannister Rd, Kansas City, MO 64134"
                  maxLength={300}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Phone</span>
                <input
                  name="phone"
                  defaultValue={seed?.phone ?? ''}
                  className={CONTROL}
                  placeholder="(816) 442-0295"
                  maxLength={40}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Instructions</span>
                <textarea
                  name="instructions"
                  rows={3}
                  defaultValue={seed?.instructions ?? ''}
                  className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Parking, entrance, what to bring - shown to customers on confirmation."
                  maxLength={1000}
                />
              </label>

              {isEdit ? (
                <label className="flex items-center gap-2.5 border border-border bg-muted/30 p-3">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={seed!.isActive}
                    className="size-4 rounded border-border accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium">Active</span>
                    <span className="block text-xs text-muted-foreground">
                      Inactive locations are hidden from new bookings.
                    </span>
                  </span>
                </label>
              ) : null}

              {state.error ? (
                <p
                  role="alert"
                  className="rounded-none border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
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
                {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create location'}
              </Button>
            </footer>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
