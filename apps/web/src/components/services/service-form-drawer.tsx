'use client';

import { useActionState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import type { ServiceCategoryRow } from '@booking/db';
import {
  createServiceAction,
  updateServiceAction,
  type ServiceActionState,
} from '@/server/services/actions';

export interface ServiceEditSeed {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number | null;
  slotIntervalMinutes: number | null;
  price: number;
  color: string | null;
  isActive: boolean;
}

const CONTROL =
  'h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ServiceFormDrawer({
  open,
  onOpenChange,
  seed,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode; null → create mode. */
  seed: ServiceEditSeed | null;
  categories: ServiceCategoryRow[];
  onSaved: () => void;
}) {
  const isEdit = !!seed;
  const [state, action, pending] = useActionState<ServiceActionState, FormData>(
    isEdit ? updateServiceAction : createServiceAction,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.serviceId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[28rem] max-w-[95vw] p-0">
        {open ? (
          <form action={action} className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-border p-5">
              <SheetTitle className="text-base font-semibold">{isEdit ? 'Edit service' : 'New service'}</SheetTitle>
              <SheetClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close">
                  <X />
                </Button>
              </SheetClose>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {isEdit ? <input type="hidden" name="serviceId" value={seed!.id} /> : null}

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Service name *</span>
                <input name="name" required defaultValue={seed?.name ?? ''} className={CONTROL} placeholder="e.g. Signature Consultation" />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Category</span>
                <select name="categoryId" defaultValue={seed?.categoryId ?? ''} className={CONTROL}>
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Duration (mins) *</span>
                  <input name="durationMinutes" type="number" min={5} step={5} required defaultValue={seed?.durationMinutes ?? 60} className={CONTROL} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Price</span>
                  <input name="price" type="number" min={0} step="0.01" defaultValue={seed?.price ?? 0} className={CONTROL} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Buffer before (mins)</span>
                  <input name="bufferBeforeMinutes" type="number" min={0} step={5} defaultValue={seed?.bufferBeforeMinutes ?? 0} className={CONTROL} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Buffer after (mins)</span>
                  <input name="bufferAfterMinutes" type="number" min={0} step={5} defaultValue={seed?.bufferAfterMinutes ?? 0} className={CONTROL} />
                </label>
              </div>

              <fieldset className="space-y-2 border border-border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Booking rules</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Min. notice (mins)</span>
                    <input name="minAdvanceMinutes" type="number" min={0} step={15} defaultValue={seed?.minAdvanceMinutes ?? 0} className={CONTROL} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Book up to (days)</span>
                    <input
                      name="maxAdvanceDays"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={seed?.maxAdvanceDays ?? ''}
                      placeholder="No limit"
                      className={CONTROL}
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Time-slot step (mins)</span>
                  <input
                    name="slotIntervalMinutes"
                    type="number"
                    min={0}
                    step={5}
                    defaultValue={seed?.slotIntervalMinutes ?? ''}
                    placeholder="Use default"
                    className={CONTROL}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  How soon before the start a customer may book, how far ahead, and the interval between offered times.
                  Leave the last two empty for no limit / the default step.
                </p>
              </fieldset>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Colour</span>
                <div className="flex items-center gap-2">
                  <input
                    name="color"
                    type="color"
                    defaultValue={seed?.color ?? '#4f46e5'}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-none border border-border bg-background p-1"
                  />
                  <span className="text-xs text-muted-foreground">Used on calendar and service cards.</span>
                </div>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Description</span>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={seed?.description ?? ''}
                  className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Shown to customers on the booking form."
                  maxLength={500}
                />
              </label>

              {isEdit ? (
                <label className="flex items-center gap-2.5 border border-border bg-muted/30 p-3">
                  <input type="checkbox" name="isActive" defaultChecked={seed!.isActive} className="size-4 rounded border-border accent-primary" />
                  <span>
                    <span className="block text-sm font-medium">Active</span>
                    <span className="block text-xs text-muted-foreground">Inactive services are hidden from the booking form.</span>
                  </span>
                </label>
              ) : null}

              {state.error ? (
                <p role="alert" className="rounded-none border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
                {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create service'}
              </Button>
            </footer>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
