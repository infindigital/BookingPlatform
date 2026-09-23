'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type { CalendarBooking, CalendarEmployee, CalendarService, CalendarOff } from '@booking/db';
import { Button } from '@booking/ui/button';
import { cn } from '@booking/ui/lib/cn';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@booking/ui/dropdown-menu';
import { addDays, toNoonUTC } from '@booking/core';
import { WeekGrid } from './week-grid';
import { AgendaList } from './agenda-list';
import { BookingDrawer } from './booking-drawer';

export type CalendarViewMode = 'day' | 'week' | 'agenda';

const VIEWS: { key: CalendarViewMode; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'agenda', label: 'Agenda' },
];

function rangeLabel(days: string[], view: CalendarViewMode): string {
  if (days.length === 0) return '';
  const first = toNoonUTC(days[0]!);
  const last = toNoonUTC(days[days.length - 1]!);
  if (view === 'day') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(first);
  }
  const sameMonth = first.getUTCMonth() === last.getUTCMonth() && first.getUTCFullYear() === last.getUTCFullYear();
  const startFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(first);
  const endFmt = sameMonth
    ? `${last.getUTCDate()}, ${last.getUTCFullYear()}`
    : new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(last);
  return `${startFmt} - ${endFmt}`;
}

export function CalendarView({
  view,
  date,
  days,
  bookings,
  employees,
  services,
  off,
  employeeId,
  timeZone,
  todayKey,
  nowMinutes,
}: {
  view: CalendarViewMode;
  date: string;
  days: string[];
  bookings: CalendarBooking[];
  employees: CalendarEmployee[];
  services: CalendarService[];
  off: CalendarOff[];
  employeeId: string;
  timeZone: string;
  todayKey: string;
  nowMinutes: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarBooking | null>(null);
  const [open, setOpen] = useState(false);

  const go = (next: { view?: CalendarViewMode; date?: string; employee?: string }) => {
    const v = next.view ?? view;
    const d = next.date ?? date;
    const e = next.employee ?? employeeId;
    const params = new URLSearchParams({ view: v, date: d });
    if (e && e !== 'all') params.set('employee', e);
    router.push(`/admin/calendar?${params.toString()}`);
  };

  const step = view === 'day' ? 1 : days.length || 7;
  const activeEmployee = employees.find((e) => e.id === employeeId);

  const onSelect = (b: CalendarBooking) => {
    setSelected(b);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border">
            <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => go({ date: addDays(date, -step) })}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next" onClick={() => go({ date: addDays(date, step) })}>
              <ChevronRight />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => go({ date: todayKey })}>
            Today
          </Button>
          <h1 className="ml-1 text-lg font-semibold tracking-tight">{rangeLabel(days, view)}</h1>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter />
                {activeEmployee ? activeEmployee.name : 'All team'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Team member</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => go({ employee: 'all' })}>All team</DropdownMenuItem>
              {employees.map((e) => (
                <DropdownMenuItem key={e.id} onSelect={() => go({ employee: e.id })}>
                  {e.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center rounded-md border border-border p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => go({ view: v.key })}
                className={cn(
                  'rounded px-3 py-1 text-sm font-medium transition-colors',
                  v.key === view
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {services.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {services.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: s.color ?? 'hsl(var(--primary))' }}
              />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}

      {view === 'agenda' ? (
        <AgendaList days={days} bookings={bookings} off={off} timeZone={timeZone} todayKey={todayKey} onSelect={onSelect} />
      ) : (
        <WeekGrid
          days={days}
          bookings={bookings}
          off={off}
          timeZone={timeZone}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          onSelect={onSelect}
        />
      )}

      <BookingDrawer booking={selected} open={open} onOpenChange={setOpen} timeZone={timeZone} />
    </div>
  );
}
