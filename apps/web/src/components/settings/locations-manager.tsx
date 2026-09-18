'use client';

import { useState, useTransition } from 'react';
import { X, Plus, MapPin, Pencil, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import {
  listLocationsAction,
  createLocationAction,
  updateLocationAction,
  toggleLocationActiveAction,
  deleteLocationAction,
  type LocationView,
} from '@/server/settings/actions';

export type { LocationView };

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

type Editor = { mode: 'create' } | { mode: 'edit'; row: LocationView };

export function LocationsManager({ initial, timezones }: { initial: LocationView[]; timezones: string[] }) {
  const [rows, setRows] = useState<LocationView[]>(initial);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reload() {
    start(async () => {
      setRows(await listLocationsAction());
    });
  }

  function toggle(row: LocationView) {
    setError(null);
    start(async () => {
      const res = await toggleLocationActiveAction(row.id, !row.isActive);
      if (!res.ok) setError(res.error ?? 'Could not update.');
      setRows(await listLocationsAction());
    });
  }

  function remove(row: LocationView) {
    if (!confirm(`Delete “${row.name}”? This cannot be undone.`)) return;
    setError(null);
    start(async () => {
      const res = await deleteLocationAction(row.id);
      if (!res.ok) setError(res.error ?? 'Could not delete.');
      setRows(await listLocationsAction());
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Where you take bookings. Each location can override the business timezone.</p>
        <Button size="sm" onClick={() => { setError(null); setEditor({ mode: 'create' }); }}>
          <Plus /> New location
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <MapPin className="mx-auto mb-3 size-8 text-muted-foreground opacity-60" />
          <p className="font-medium">No locations yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Add your first location to organise bookings and opening hours.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.name}</span>
                  {row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {row.address || 'No address'}
                  {row.timezone ? ` · ${row.timezone}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => toggle(row)} disabled={pending}>
                  {row.isActive ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setError(null); setEditor({ mode: 'edit', row }); }}>
                  <Pencil /> Edit
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(row)} disabled={pending}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <LocationEditor
        key={editor ? (editor.mode === 'edit' ? editor.row.id : 'new') : 'closed'}
        editor={editor}
        timezones={timezones}
        onOpenChange={(o) => { if (!o) setEditor(null); }}
        onSaved={() => { setEditor(null); reload(); }}
      />
    </div>
  );
}

function LocationEditor({
  editor,
  timezones,
  onOpenChange,
  onSaved,
}: {
  editor: Editor | null;
  timezones: string[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const existing = editor?.mode === 'edit' ? editor.row : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [timezone, setTimezone] = useState(existing?.timezone ?? '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const tzOptions = timezones.includes(timezone) || !timezone ? timezones : [timezone, ...timezones];

  function submit() {
    setError(null);
    start(async () => {
      const input = { name, address: address.trim() || null, timezone: timezone.trim() || null, isActive };
      const res = existing ? await updateLocationAction(existing.id, input) : await createLocationAction(input);
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save.');
    });
  }

  return (
    <Sheet open={!!editor} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[30rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <SheetTitle className="text-base font-semibold">{existing ? 'Edit location' : 'New location'}</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={CONTROL} placeholder="Downtown studio" autoFocus />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Address (optional)</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={CONTROL} placeholder="1 Main St, Suite 200" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Timezone (optional — inherits the business zone)</span>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={CONTROL}>
              <option value="">Inherit business timezone</option>
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-border" />
            Active
          </label>

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
          <SheetClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </SheetClose>
          <Button type="button" onClick={submit} disabled={pending || !name.trim()} aria-busy={pending}>
            {pending ? 'Saving…' : existing ? 'Save location' : 'Create location'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
