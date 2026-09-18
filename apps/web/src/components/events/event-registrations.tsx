'use client';

import { useEffect, useState, useTransition, useCallback } from 'react';
import { X, UserPlus, Search } from 'lucide-react';
import { EVENT_REGISTRATION_STATUS_LABELS, type EventRegistrationStatus } from '@booking/core';
import type { EventListRow, EventDetail } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import {
  loadEventDetail,
  registerAttendee,
  setRegistrationStatus,
  searchCustomers,
  type CustomerOption,
} from '@/server/events/actions';

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const REG_TONE: Record<EventRegistrationStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  REGISTERED: 'success',
  ATTENDED: 'info',
  NO_SHOW: 'warning',
  CANCELLED: 'danger',
};

export function EventRegistrations({
  event,
  onOpenChange,
  onChanged,
}: {
  event: EventListRow | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Add-attendee form
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [selected, setSelected] = useState<CustomerOption | null>(null);
  const [seats, setSeats] = useState('1');
  const [note, setNote] = useState('');

  const eventId = event?.id ?? null;

  const reload = useCallback(() => {
    if (!eventId) return;
    start(async () => setDetail(await loadEventDetail(eventId)));
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  function runSearch(q: string) {
    setQuery(q);
    setSelected(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    start(async () => setResults(await searchCustomers(q)));
  }

  function add() {
    if (!selected || !eventId) return;
    setError(null);
    start(async () => {
      const res = await registerAttendee({ eventId, customerId: selected.id, seats: Math.max(1, Number(seats) || 1), note: note.trim() || null });
      if (res.ok) {
        setQuery('');
        setResults([]);
        setSelected(null);
        setSeats('1');
        setNote('');
        setDetail(await loadEventDetail(eventId));
        onChanged();
      } else {
        setError(res.error ?? 'Could not register.');
      }
    });
  }

  function changeStatus(id: string, status: EventRegistrationStatus) {
    setError(null);
    start(async () => {
      const res = await setRegistrationStatus(id, status);
      if (!res.ok) setError(res.error ?? 'Could not update.');
      if (eventId) setDetail(await loadEventDetail(eventId));
      onChanged();
    });
  }

  return (
    <Sheet open={!!event} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[34rem] max-w-[96vw] flex-col p-0">
        <header className="border-b border-border p-5">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold">{event?.title ?? 'Event'}</SheetTitle>
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close"><X /></Button>
            </SheetClose>
          </div>
          {detail ? (
            <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
              <span><span className="font-semibold text-foreground">{detail.registeredSeats}</span> / {detail.capacity} seats</span>
              <span><span className="font-semibold text-foreground">{detail.remaining}</span> left</span>
              <span>{detail.attendeeCount} {detail.attendeeCount === 1 ? 'registration' : 'registrations'}</span>
            </div>
          ) : null}
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Add attendee */}
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><UserPlus className="size-4" /> Register an attendee</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="Search customer by name or email…"
                className={`${CONTROL} pl-8`}
              />
              {results.length > 0 && !selected ? (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => { setSelected(c); setQuery(c.name); setResults([]); }}
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {selected ? (
              <div className="mt-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5 text-sm">
                <span>{selected.name} · <span className="text-muted-foreground">{selected.email}</span></span>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setSelected(null); setQuery(''); }}>Change</button>
              </div>
            ) : null}
            <div className="mt-2 flex items-end gap-2">
              <label className="block">
                <span className="text-xs text-muted-foreground">Seats</span>
                <input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} className={`${CONTROL} w-20`} />
              </label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={CONTROL} />
              <Button type="button" onClick={add} disabled={pending || !selected}>Register</Button>
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}

          {/* Registrations list */}
          {detail && detail.registrations.length > 0 ? (
            <ul className="space-y-2">
              {detail.registrations.map((r) => (
                <li key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.customerName}</span>
                        <Badge tone={REG_TONE[r.status]}>{EVENT_REGISTRATION_STATUS_LABELS[r.status]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.email} · {r.seats} {r.seats === 1 ? 'seat' : 'seats'}</p>
                      {r.note ? <p className="mt-1 text-xs text-muted-foreground">“{r.note}”</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {r.status === 'REGISTERED' ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => changeStatus(r.id, 'ATTENDED')} disabled={pending}>Attended</Button>
                          <Button variant="outline" size="sm" onClick={() => changeStatus(r.id, 'NO_SHOW')} disabled={pending}>No-show</Button>
                          <Button variant="ghost" size="sm" onClick={() => changeStatus(r.id, 'CANCELLED')} disabled={pending}>Cancel</Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => changeStatus(r.id, 'REGISTERED')} disabled={pending}>Reinstate</Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : detail ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No registrations yet.</p>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
