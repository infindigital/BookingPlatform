'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { EVENT_STATUSES, EVENT_STATUS_LABELS, type EventStatus } from '@booking/core';
import type { EventListRow } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { createEvent, updateEvent } from '@/server/events/actions';

export interface Option {
  id: string;
  name: string;
}

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

type EditorState = { mode: 'create' } | { mode: 'edit'; event: EventListRow };

function localParts(iso: string, timeZone: string): { dayKey: string; time: string } {
  const d = new Date(iso);
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return { dayKey, time };
}

export function EventEditor({
  editor,
  locations,
  employees,
  currency,
  timeZone,
  today,
  onOpenChange,
  onSaved,
}: {
  editor: EditorState | null;
  locations: Option[];
  employees: Option[];
  currency: string;
  timeZone: string;
  today: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const existing = editor?.mode === 'edit' ? editor.event : null;
  const startParts = existing ? localParts(existing.startISO, timeZone) : null;
  const endParts = existing ? localParts(existing.endISO, timeZone) : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [dayKey, setDayKey] = useState(startParts?.dayKey ?? today);
  const [startTime, setStartTime] = useState(startParts?.time ?? '18:00');
  const [endTime, setEndTime] = useState(endParts?.time ?? '19:00');
  const [capacity, setCapacity] = useState(String(existing?.capacity ?? 10));
  const [price, setPrice] = useState(String(existing?.price ?? 0));
  const [locationId, setLocationId] = useState(existing?.locationId ?? '');
  const [employeeId, setEmployeeId] = useState(existing?.employeeId ?? '');
  const [status, setStatus] = useState<EventStatus>(existing?.status ?? 'DRAFT');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!title.trim()) {
      setError('Enter a title.');
      return;
    }
    const input = {
      title: title.trim(),
      description: description.trim() || null,
      dayKey,
      startTime,
      endTime,
      capacity: Math.max(1, Math.floor(Number(capacity) || 0)),
      price: Number(price) || 0,
      currency,
      locationId: locationId || null,
      employeeId: employeeId || null,
      status,
    };
    start(async () => {
      const res = existing ? await updateEvent(existing.id, input) : await createEvent(input);
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save.');
    });
  }

  return (
    <Sheet open={!!editor} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[32rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <SheetTitle className="text-base font-semibold">{existing ? 'Edit event' : 'New event'}</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={CONTROL} placeholder="Morning Yoga" autoFocus />
          </Field>
          <Field label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={CONTROL} />
          </Field>
          <Field label="Date">
            <input type="date" value={dayKey} onChange={(e) => setDayKey(e.target.value)} className={CONTROL} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={CONTROL} />
            </Field>
            <Field label="End">
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={CONTROL} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacity">
              <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={CONTROL} />
            </Field>
            <Field label={`Price (${currency})`}>
              <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={CONTROL} />
            </Field>
          </div>
          <Field label="Host (optional)">
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={CONTROL}>
              <option value="">No host</option>
              {employees.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Location (optional)">
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={CONTROL}>
              <option value="">No location</option>
              {locations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)} className={CONTROL}>
              {EVENT_STATUSES.map((s) => (
                <option key={s} value={s}>{EVENT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
          <SheetClose asChild>
            <Button type="button" variant="ghost">Cancel</Button>
          </SheetClose>
          <Button type="button" onClick={submit} disabled={pending || !title.trim()} aria-busy={pending}>
            {pending ? 'Saving…' : existing ? 'Save event' : 'Create event'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
