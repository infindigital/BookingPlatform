'use client';

import { useActionState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import type { LocationMode, AssignableService, AssignableEmployee } from '@booking/db';
import {
  createLocationAction,
  updateLocationAction,
  type LocationActionState,
} from '@/server/locations/actions';

export interface LocationEditSeed {
  id: string;
  name: string;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  mapUrl: string | null;
  phone: string | null;
  email: string | null;
  instructions: string | null;
  mode: LocationMode;
  timezone: string | null;
  isDefault: boolean;
  isActive: boolean;
  /** Services explicitly offered here (empty = all services). */
  serviceIds: string[];
  /** Staff explicitly assigned here (empty = all staff). */
  employeeIds: string[];
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
  timezones,
  services,
  employees,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present -> edit mode; null -> create mode. */
  seed: LocationEditSeed | null;
  /** IANA timezone options; a location can override the business timezone. */
  timezones: string[];
  /** Every service that can be offered here. */
  services: AssignableService[];
  /** Every employee that can be assigned here. */
  employees: AssignableEmployee[];
  onSaved: () => void;
}) {
  const seededServiceIds = new Set(seed?.serviceIds ?? []);
  const seededEmployeeIds = new Set(seed?.employeeIds ?? []);
  const seededTz = seed?.timezone ?? '';
  const tzOptions = seededTz && !timezones.includes(seededTz) ? [seededTz, ...timezones] : timezones;
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
                  placeholder="8101 E. Bannister Rd"
                  maxLength={300}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Address line 2</span>
                <input
                  name="addressLine2"
                  defaultValue={seed?.addressLine2 ?? ''}
                  className={CONTROL}
                  placeholder="Suite, unit, floor (optional)"
                  maxLength={300}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">City</span>
                  <input name="city" defaultValue={seed?.city ?? ''} className={CONTROL} placeholder="Kansas City" maxLength={120} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">State</span>
                  <input name="state" defaultValue={seed?.state ?? ''} className={CONTROL} placeholder="MO" maxLength={120} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">ZIP / postal code</span>
                  <input name="postalCode" defaultValue={seed?.postalCode ?? ''} className={CONTROL} placeholder="64134" maxLength={32} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Country</span>
                  <input name="country" defaultValue={seed?.country ?? ''} className={CONTROL} placeholder="United States" maxLength={120} />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Google Maps URL</span>
                <input
                  name="mapUrl"
                  type="url"
                  defaultValue={seed?.mapUrl ?? ''}
                  className={CONTROL}
                  placeholder="https://maps.google.com/..."
                  maxLength={500}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Phone</span>
                  <input name="phone" defaultValue={seed?.phone ?? ''} className={CONTROL} placeholder="(816) 442-0295" maxLength={40} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Email</span>
                  <input name="email" type="email" defaultValue={seed?.email ?? ''} className={CONTROL} placeholder="office@example.com" maxLength={160} />
                </label>
              </div>

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

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Timezone</span>
                <select name="timezone" defaultValue={seededTz} className={CONTROL}>
                  <option value="">Inherit business timezone</option>
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  Leave as inherit unless this location runs on a different clock.
                </span>
              </label>

              <fieldset className="space-y-2 border border-border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Services offered here</legend>
                <p className="text-xs text-muted-foreground">
                  Leave all unchecked to offer every service at this location.
                </p>
                {services.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No services yet.</p>
                ) : (
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {services.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="serviceIds"
                          value={s.id}
                          defaultChecked={seededServiceIds.has(s.id)}
                          className="size-4 rounded border-border accent-primary"
                        />
                        <span className={s.isActive ? '' : 'text-muted-foreground'}>
                          {s.name}
                          {s.isActive ? '' : ' (inactive)'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <fieldset className="space-y-2 border border-border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Staff at this location</legend>
                <p className="text-xs text-muted-foreground">
                  Leave all unchecked to let every team member work here.
                </p>
                {employees.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No staff yet.</p>
                ) : (
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {employees.map((e) => (
                      <label key={e.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="employeeIds"
                          value={e.id}
                          defaultChecked={seededEmployeeIds.has(e.id)}
                          className="size-4 rounded border-border accent-primary"
                        />
                        <span className={e.isActive ? '' : 'text-muted-foreground'}>
                          {e.name}
                          {e.isActive ? '' : ' (inactive)'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <label className="flex items-center gap-2.5 border border-border bg-muted/30 p-3">
                <input
                  type="checkbox"
                  name="isDefault"
                  defaultChecked={seed?.isDefault ?? false}
                  className="size-4 rounded border-border accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">Default location</span>
                  <span className="block text-xs text-muted-foreground">
                    Used as the fallback when a booking has no specific location.
                  </span>
                </span>
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
