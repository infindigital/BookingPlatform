'use client';

import { CalendarClock } from 'lucide-react';
import type { CalendarBooking } from '@booking/db';
import { toNoonUTC } from '@booking/core';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { formatDurationMinutes, formatTime } from '@/components/dashboard/format';

function fullDay(dayKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(toNoonUTC(dayKey));
}

export function AgendaList({
  days,
  bookings,
  timeZone,
  todayKey,
  onSelect,
}: {
  days: string[];
  bookings: CalendarBooking[];
  timeZone: string;
  todayKey: string;
  onSelect: (b: CalendarBooking) => void;
}) {
  const byDay = new Map<string, CalendarBooking[]>();
  for (const b of bookings) {
    const arr = byDay.get(b.dayKey) ?? [];
    arr.push(b);
    byDay.set(b.dayKey, arr);
  }
  const populated = days.filter((d) => (byDay.get(d)?.length ?? 0) > 0);

  if (populated.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-none border border-dashed border-border py-16 text-center">
        <CalendarClock className="size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Nothing scheduled in this range</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Try a different date or team member.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {populated.map((day) => {
        const items = (byDay.get(day) ?? []).slice().sort((a, b) => a.startMinutes - b.startMinutes);
        return (
          <section key={day}>
            <h3 className="sticky top-14 z-10 mb-2 flex items-center gap-2 bg-background/80 py-1 text-sm font-semibold backdrop-blur">
              {fullDay(day)}
              {day === todayKey ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Today
                </span>
              ) : null}
            </h3>
            <ul className="overflow-hidden rounded-none border border-border bg-card">
              {items.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(b)}
                    className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-accent/40 focus:outline-none focus-visible:bg-accent/40"
                  >
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: b.serviceColor ?? 'hsl(var(--primary))' }}
                      aria-hidden
                    />
                    <div className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatTime(new Date(b.startISO), timeZone)}
                      <span className="block">{formatDurationMinutes(new Date(b.startISO), new Date(b.endISO))}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.customerName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.serviceName}
                        {b.employeeName ? ` · ${b.employeeName}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
