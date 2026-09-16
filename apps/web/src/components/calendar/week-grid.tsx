'use client';

import { useMemo } from 'react';
import type { CalendarBooking } from '@booking/db';
import { assignLanes, hourWindow, toNoonUTC } from '@booking/core';
import { cn } from '@booking/ui/lib/cn';
import { formatTime } from '@/components/dashboard/format';

const HOUR_HEIGHT = 56; // px
const PX_PER_MIN = HOUR_HEIGHT / 60;

function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function dayHeader(dayKey: string, timeZone: string): { weekday: string; day: string } {
  const d = toNoonUTC(dayKey);
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(d),
    day: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric' }).format(d),
  };
}

export function WeekGrid({
  days,
  bookings,
  timeZone,
  todayKey,
  nowMinutes,
  onSelect,
}: {
  days: string[];
  bookings: CalendarBooking[];
  timeZone: string;
  todayKey: string;
  nowMinutes: number;
  onSelect: (b: CalendarBooking) => void;
}) {
  const { startHour, endHour } = useMemo(() => hourWindow(bookings), [bookings]);
  const totalMinutes = (endHour - startHour) * 60;
  const gridHeight = totalMinutes * PX_PER_MIN;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of bookings) {
      const arr = map.get(b.dayKey) ?? [];
      arr.push(b);
      map.set(b.dayKey, arr);
    }
    return map;
  }, [bookings]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="min-w-[640px]">
        {/* Header row */}
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="border-r border-border" />
          {days.map((day) => {
            const { weekday, day: dayNum } = dayHeader(day, timeZone);
            const isToday = day === todayKey;
            return (
              <div
                key={day}
                className={cn(
                  'flex items-center justify-center gap-1.5 border-r border-border py-2 text-xs',
                  isToday ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span className="uppercase">{weekday}</span>
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full font-semibold',
                    isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {dayNum}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div
          className="grid"
          style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {/* Time axis */}
          <div className="relative border-r border-border" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: (h - startHour) * HOUR_HEIGHT }}
              >
                {h > startHour ? hourLabel(h) : ''}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const placed = assignLanes(byDay.get(day) ?? []);
            const isToday = day === todayKey;
            const showNow = isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;
            return (
              <div key={day} className="relative border-r border-border" style={{ height: gridHeight }}>
                {/* Hour gridlines */}
                {hours.slice(0, -1).map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: (h - startHour) * HOUR_HEIGHT }}
                  />
                ))}

                {/* Current-time indicator */}
                {showNow ? (
                  <div
                    className="absolute inset-x-0 z-20 flex items-center"
                    style={{ top: (nowMinutes - startHour * 60) * PX_PER_MIN }}
                  >
                    <span className="size-2 -translate-x-1/2 rounded-full bg-red-500" />
                    <span className="h-px flex-1 bg-red-500" />
                  </div>
                ) : null}

                {/* Bookings */}
                {placed.map(({ item, lane, lanes }) => {
                  const top = (item.startMinutes - startHour * 60) * PX_PER_MIN;
                  const height = Math.max(18, (item.endMinutes - item.startMinutes) * PX_PER_MIN - 2);
                  const color = item.serviceColor ?? 'hsl(var(--primary))';
                  const pending = item.status === 'PENDING';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item)}
                      className={cn(
                        'absolute z-10 overflow-hidden rounded-md border-l-2 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        pending ? 'border-dashed' : '',
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        backgroundColor: pending ? 'transparent' : `color-mix(in srgb, ${color} 14%, hsl(var(--card)))`,
                        borderLeftColor: color,
                        boxShadow: pending ? `inset 0 0 0 1px ${color}55` : undefined,
                      }}
                      title={`${item.customerName} · ${item.serviceName}`}
                    >
                      <span className="block font-medium tabular-nums text-foreground">
                        {formatTime(new Date(item.startISO), timeZone)}
                      </span>
                      <span className="block truncate font-medium text-foreground">{item.customerName}</span>
                      {height > 34 ? (
                        <span className="block truncate text-muted-foreground">{item.serviceName}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
