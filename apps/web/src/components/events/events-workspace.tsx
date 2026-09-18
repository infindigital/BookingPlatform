'use client';

import { useState, useTransition } from 'react';
import { Plus, Ticket, Pencil, Trash2, Users, MapPin, User as UserIcon } from 'lucide-react';
import { formatMoney, EVENT_STATUS_LABELS, type EventStatus } from '@booking/core';
import type { EventListRow } from '@booking/db';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import { EventEditor, type Option } from './event-editor';
import { EventRegistrations } from './event-registrations';
import { loadEvents, setEventStatus, deleteEvent } from '@/server/events/actions';

const STATUS_TONE: Record<EventStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  CANCELLED: 'danger',
  COMPLETED: 'info',
};

export function EventsWorkspace({
  initial,
  locations,
  employees,
  currency,
  timeZone,
  today,
}: {
  initial: EventListRow[];
  locations: Option[];
  employees: Option[];
  currency: string;
  timeZone: string;
  today: string;
}) {
  const [rows, setRows] = useState<EventListRow[]>(initial);
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; event: EventListRow } | null>(null);
  const [manage, setManage] = useState<EventListRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reload() {
    start(async () => setRows(await loadEvents()));
  }

  function changeStatus(row: EventListRow, status: EventStatus) {
    setError(null);
    start(async () => {
      const res = await setEventStatus(row.id, status);
      if (!res.ok) setError(res.error ?? 'Could not update.');
      setRows(await loadEvents());
    });
  }

  function remove(row: EventListRow) {
    if (!confirm(`Delete “${row.title}”? This cannot be undone.`)) return;
    setError(null);
    start(async () => {
      const res = await deleteEvent(row.id);
      if (!res.ok) setError(res.error ?? 'Could not delete.');
      setRows(await loadEvents());
    });
  }

  function fmtRange(startISO: string, endISO: string): string {
    const s = new Date(startISO);
    const e = new Date(endISO);
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(s);
    const t = (x: Date) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(x);
    return `${day} · ${t(s)} – ${t(e)}`;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ticketed classes and workshops with limited seats.</p>
        </div>
        <Button onClick={() => { setError(null); setEditor({ mode: 'create' }); }}>
          <Plus /> New event
        </Button>
      </header>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Ticket className="mx-auto mb-3 size-8 text-muted-foreground opacity-60" />
          <p className="font-medium">No events yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Create a class or workshop, set its capacity, and register attendees.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const soldOut = row.remaining <= 0 && row.capacity > 0;
            const fillPct = row.capacity > 0 ? Math.min(100, (row.registeredSeats / row.capacity) * 100) : 0;
            return (
              <li key={row.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{row.title}</h2>
                      <Badge tone={STATUS_TONE[row.status]}>{EVENT_STATUS_LABELS[row.status]}</Badge>
                      {soldOut ? <Badge tone="warning">Sold out</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{fmtRange(row.startISO, row.endISO)}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {row.hostName ? <span className="flex items-center gap-1"><UserIcon className="size-3" /> {row.hostName}</span> : null}
                      {row.locationName ? <span className="flex items-center gap-1"><MapPin className="size-3" /> {row.locationName}</span> : null}
                      <span>{row.price > 0 ? formatMoney(row.price, row.currency) : 'Free'}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="secondary" size="sm" onClick={() => setManage(row)}>
                      <Users /> Attendees
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setError(null); setEditor({ mode: 'edit', event: row }); }}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(row)} disabled={pending}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {/* Capacity */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">{row.registeredSeats}</span> / {row.capacity} seats
                      <span className="ml-2">· {row.attendeeCount} {row.attendeeCount === 1 ? 'registration' : 'registrations'}</span>
                    </span>
                    <span>{row.remaining} left</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${soldOut ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${fillPct}%` }} />
                  </div>
                </div>

                {/* Status actions */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.status === 'DRAFT' ? (
                    <Button variant="outline" size="sm" onClick={() => changeStatus(row, 'PUBLISHED')} disabled={pending}>Publish</Button>
                  ) : null}
                  {row.status === 'PUBLISHED' ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => changeStatus(row, 'COMPLETED')} disabled={pending}>Mark completed</Button>
                      <Button variant="outline" size="sm" onClick={() => changeStatus(row, 'CANCELLED')} disabled={pending}>Cancel</Button>
                    </>
                  ) : null}
                  {(row.status === 'CANCELLED' || row.status === 'COMPLETED') ? (
                    <Button variant="outline" size="sm" onClick={() => changeStatus(row, 'PUBLISHED')} disabled={pending}>Re-open</Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pending ? <p className="text-xs text-muted-foreground">Updating…</p> : null}

      <EventEditor
        key={editor ? (editor.mode === 'edit' ? editor.event.id : 'new') : 'closed'}
        editor={editor}
        locations={locations}
        employees={employees}
        currency={currency}
        timeZone={timeZone}
        today={today}
        onOpenChange={(o) => { if (!o) setEditor(null); }}
        onSaved={() => { setEditor(null); reload(); }}
      />

      <EventRegistrations
        key={manage ? manage.id : 'none'}
        event={manage}
        onOpenChange={(o) => { if (!o) setManage(null); }}
        onChanged={reload}
      />
    </div>
  );
}
