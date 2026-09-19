'use client';

import { useState, useTransition } from 'react';
import { X, Plus, CalendarClock, Pencil, Trash2 } from 'lucide-react';
import type { SpecialDayRow } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import {
  listSpecialDaysAction,
  createSpecialDayAction,
  updateSpecialDayAction,
  deleteSpecialDayAction,
} from '@/server/settings/actions';

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export interface SpecialDayLocationOption {
  id: string;
  name: string;
}

function formatDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, m - 1, d)),
    );
  } catch {
    return dayKey;
  }
}

type Editor = { mode: 'create' } | { mode: 'edit'; row: SpecialDayRow };

export function SpecialDaysManager({
  initial,
  locations,
}: {
  initial: SpecialDayRow[];
  locations: SpecialDayLocationOption[];
}) {
  const [rows, setRows] = useState<SpecialDayRow[]>(initial);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reload() {
    start(async () => {
      setRows(await listSpecialDaysAction());
    });
  }

  function remove(row: SpecialDayRow) {
    if (!confirm('Remove this special day?')) return;
    setError(null);
    start(async () => {
      const res = await deleteSpecialDayAction(row.id);
      if (!res.ok) setError(res.error ?? 'Could not delete.');
      setRows(await listSpecialDaysAction());
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Override the normal hours on a specific date — close for the day, or open with different hours.
        </p>
        <Button size="sm" onClick={() => { setError(null); setEditor({ mode: 'create' }); }}>
          <Plus /> Add special day
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="rounded-none border border-dashed border-border bg-card px-6 py-14 text-center">
          <CalendarClock className="mx-auto mb-3 size-8 text-muted-foreground opacity-60" />
          <p className="font-medium">No special days yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Add a date with reduced hours or a one-off closure; availability follows it automatically.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-border bg-card p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.name || formatDay(row.dayKey)}</span>
                  {row.isClosed ? (
                    <Badge tone="danger">Closed</Badge>
                  ) : (
                    <Badge tone="info">
                      {row.openTime}–{row.closeTime}
                    </Badge>
                  )}
                  <Badge tone="neutral">{row.locationName ?? 'All locations'}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{formatDay(row.dayKey)}</p>
              </div>
              <div className="flex items-center gap-1">
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

      <SpecialDayEditor
        key={editor ? (editor.mode === 'edit' ? editor.row.id : 'new') : 'closed'}
        editor={editor}
        locations={locations}
        onOpenChange={(o) => { if (!o) setEditor(null); }}
        onSaved={() => { setEditor(null); reload(); }}
      />
    </div>
  );
}

function SpecialDayEditor({
  editor,
  locations,
  onOpenChange,
  onSaved,
}: {
  editor: Editor | null;
  locations: SpecialDayLocationOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const existing = editor?.mode === 'edit' ? editor.row : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [dayKey, setDayKey] = useState(existing?.dayKey ?? '');
  const [isClosed, setIsClosed] = useState(existing?.isClosed ?? false);
  const [openTime, setOpenTime] = useState(existing?.openTime ?? '09:00');
  const [closeTime, setCloseTime] = useState(existing?.closeTime ?? '17:00');
  const [locationId, setLocationId] = useState(existing?.locationId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      setError('Pick a date.');
      return;
    }
    if (!isClosed && closeTime <= openTime) {
      setError('The closing time must be after the opening time.');
      return;
    }
    start(async () => {
      const input = {
        name: name.trim() || null,
        dayKey,
        isClosed,
        openTime: isClosed ? null : openTime,
        closeTime: isClosed ? null : closeTime,
        locationId: locationId || null,
      };
      const res = existing ? await updateSpecialDayAction(existing.id, input) : await createSpecialDayAction(input);
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save.');
    });
  }

  return (
    <Sheet open={!!editor} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[28rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <SheetTitle className="text-base font-semibold">{existing ? 'Edit special day' : 'Add special day'}</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Label (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={CONTROL} placeholder="Christmas Eve – short hours" autoFocus />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Date</span>
            <input type="date" value={dayKey} onChange={(e) => setDayKey(e.target.value)} className={CONTROL} />
          </label>

          {locations.length > 0 ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Applies to</span>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={CONTROL}>
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} className="size-4 rounded border-border" />
            Closed all day
          </label>

          {!isClosed ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Opens</span>
                <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} className={CONTROL} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Closes</span>
                <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} className={CONTROL} />
              </label>
            </div>
          ) : null}

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
          <Button type="button" onClick={submit} disabled={pending} aria-busy={pending}>
            {pending ? 'Saving…' : existing ? 'Save special day' : 'Add special day'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
