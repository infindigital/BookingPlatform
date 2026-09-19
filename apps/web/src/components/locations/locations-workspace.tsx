'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, MapPin, Pencil, Trash2, Phone, Building2, Car, Video } from 'lucide-react';
import type { LocationRow, LocationMode, AssignableService, AssignableEmployee } from '@booking/db';
import { Button } from '@booking/ui/button';
import { LocationFormDrawer, type LocationEditSeed } from './location-form-drawer';
import { deleteLocationAction } from '@/server/locations/actions';

const MODE_META: Record<LocationMode, { label: string; Icon: typeof Building2 }> = {
  IN_PERSON: { label: 'In person', Icon: Building2 },
  MOBILE: { label: 'Mobile', Icon: Car },
  VIRTUAL: { label: 'Virtual', Icon: Video },
};

/** "City, State ZIP" from whichever parts are present. */
function localityLine(l: LocationRow): string {
  const cityState = [l.city, l.state].filter(Boolean).join(', ');
  return [cityState, l.postalCode].filter(Boolean).join(' ').trim();
}

export function LocationsWorkspace({
  locations,
  timezones,
  services,
  employees,
}: {
  locations: LocationRow[];
  timezones: string[];
  services: AssignableService[];
  employees: AssignableEmployee[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [seed, setSeed] = useState<LocationEditSeed | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setSeed(null);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }
  function openEdit(l: LocationRow) {
    setSeed({
      id: l.id,
      name: l.name,
      address: l.address,
      addressLine2: l.addressLine2,
      city: l.city,
      state: l.state,
      postalCode: l.postalCode,
      country: l.country,
      mapUrl: l.mapUrl,
      phone: l.phone,
      email: l.email,
      instructions: l.instructions,
      mode: l.mode,
      timezone: l.timezone,
      isDefault: l.isDefault,
      isActive: l.isActive,
      serviceIds: l.serviceIds,
      employeeIds: l.employeeIds,
    });
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }
  function onSaved() {
    setFormOpen(false);
    router.refresh();
  }

  function removeLocation(l: LocationRow) {
    const warn =
      l.bookingCount > 0
        ? `"${l.name}" is linked to ${l.bookingCount} booking${l.bookingCount === 1 ? '' : 's'}. Those bookings will keep their history but lose the location. Delete anyway?`
        : `Delete "${l.name}"? This can't be undone.`;
    if (!confirm(warn)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteLocationAction({ locationId: l.id });
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Could not delete the location.');
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Where you serve customers. Add offices, mobile service areas or virtual appointments.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus aria-hidden /> New location
        </Button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-none border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {locations.length === 0 ? (
        <div className="rounded-none border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          <MapPin className="mx-auto mb-2 size-6 opacity-50" />
          No locations yet. Click &ldquo;New location&rdquo; to add your first one.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((l) => {
            const meta = MODE_META[l.mode];
            const Icon = meta.Icon;
            return (
              <article key={l.id} className="flex flex-col rounded-none border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center border border-border bg-muted/40">
                      <Icon className="size-4 text-muted-foreground" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {l.name}
                        {l.isDefault ? (
                          <span className="inline-flex items-center rounded-none border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Default
                          </span>
                        ) : null}
                        {!l.isActive ? (
                          <span className="inline-flex items-center rounded-none bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Inactive
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{meta.label}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${l.name}`} onClick={() => openEdit(l)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${l.name}`}
                      disabled={pending}
                      onClick={() => removeLocation(l)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <dl className="mt-3 space-y-1.5 text-sm">
                  {l.address || localityLine(l) ? (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0">
                        {l.address ? <span className="block">{l.address}</span> : null}
                        {localityLine(l) ? <span className="block">{localityLine(l)}</span> : null}
                      </span>
                    </div>
                  ) : null}
                  {l.phone ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{l.phone}</span>
                    </div>
                  ) : null}
                </dl>

                {l.instructions ? (
                  <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{l.instructions}</p>
                ) : null}

                <p className="mt-auto pt-3 text-xs text-muted-foreground">
                  {l.bookingCount} booking{l.bookingCount === 1 ? '' : 's'}
                  {' · '}
                  {l.serviceIds.length === 0
                    ? 'all services'
                    : `${l.serviceIds.length} service${l.serviceIds.length === 1 ? '' : 's'}`}
                  {' · '}
                  {l.employeeIds.length === 0 ? 'all staff' : `${l.employeeIds.length} staff`}
                </p>
              </article>
            );
          })}
        </div>
      )}

      <LocationFormDrawer
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        seed={seed}
        timezones={timezones}
        services={services}
        employees={employees}
        onSaved={onSaved}
      />
    </div>
  );
}
