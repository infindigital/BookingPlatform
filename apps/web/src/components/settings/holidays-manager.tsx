'use client';

import { useState, useTransition } from 'react';
import { X, Plus, CalendarOff, Pencil, Trash2, Repeat } from 'lucide-react';
import type { HolidayRow } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import {
  listHolidaysAction,
  createHolidayAction,
  updateHolidayAction,
  deleteHolidayAction,
} from '@/server/settings/actions';

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function formatDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return dayKey;
  }
}

type Editor = { mode: 'create' } | { mode: 'edit'; row: HolidayRow };

export function HolidaysManager({ initial }: { initial: HolidayRow[] }) {
  const [rows, setRows] = useState<HolidayRow[]>(initial);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reload() {
    start(async () => {
      setRows(await listHolidaysAction());
    });
  }

  function remove(row: HolidayRow) {
    if (!confirm(`Remove the closure “${row.name}”?`)) return;
    setError(null);
    start(async () => {
      const res = await deleteHolidayAction(row.id);
      if (!res.ok) setError(res.error ?? 'Could not delete.');
      setRows(await listHolidaysAction());
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Days the business is closed. No availability is offered on a closure.</p>
        <Button size="sm" onClick={() => { setError(null); setEditor({ mode: 'create' }); }}>
          <Plus /> Add closure
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <CalendarOff className="mx-auto mb-3 size-8 text-muted-foreground opacity-60" />
          <p className="font-medium">No closures yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Add holidays or one-off closed days; they’re removed from availability automatically.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.name}</span>
                  {row.recurringYearly ? (
                    <Badge tone="info">
                      <Repeat className="mr-1 size-3" /> Yearly
                    </Badge>
                  ) : null}
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

      <HolidayEditor
        key={editor ? (editor.mode === 'edit' ? editor.row.id : 'new') : 'closed'}
        editor={editor}
        onOpenChange={(o) => { if (!o) setEditor(null); }}
        onSaved={() => { setEditor(null); reload(); }}
      />
    </div>
  );
}

function HolidayEditor({
  editor,
  onOpenChange,
  onSaved,
}: {
  editor: Editor | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const existing = editor?.mode === 'edit' ? editor.row : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [dayKey, setDayKey] = useState(existing?.dayKey ?? '');
  const [recurringYearly, setRecurring] = useState(existing?.recurringYearly ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      setError('Pick a date.');
      return;
    }
    start(async () => {
      const input = { name: name.trim(), dayKey, recurringYearly };
      const res = existing ? await updateHolidayAction(existing.id, input) : await createHolidayAction(input);
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save.');
    });
  }

  return (
    <Sheet open={!!editor} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[28rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <SheetTitle className="text-base font-semibold">{existing ? 'Edit closure' : 'Add closure'}</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={CONTROL} placeholder="Christmas Day" autoFocus />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Date</span>
            <input type="date" value={dayKey} onChange={(e) => setDayKey(e.target.value)} className={CONTROL} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={recurringYearly} onChange={(e) => setRecurring(e.target.checked)} className="size-4 rounded border-border" />
            Repeats every year
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
          <Button type="button" onClick={submit} disabled={pending} aria-busy={pending}>
            {pending ? 'Saving…' : existing ? 'Save closure' : 'Add closure'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
