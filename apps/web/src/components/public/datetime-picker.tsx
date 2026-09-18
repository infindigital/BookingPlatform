'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchPublicAvailability, type PublicDaySlots } from '@/server/public/actions';
import { dayParts, slotLabel, slotTime24 } from './format';

const DAYS_AHEAD = 14;

function addDayKey(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export interface SelectedSlot {
  startISO: string;
  time: string; // HH:MM (24h) in business tz
  employeeIds: string[];
}

export function DateTimePicker({
  slug,
  serviceId,
  employeeId,
  timeZone,
  todayKey,
  selected,
  onSelect,
}: {
  slug: string;
  serviceId: string;
  employeeId: string | null;
  timeZone: string;
  todayKey: string;
  selected: SelectedSlot | null;
  onSelect: (slot: SelectedSlot | null) => void;
}) {
  const [days, setDays] = useState<PublicDaySlots[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string>(selected ? selected.startISO.slice(0, 10) : todayKey);
  const dayScroller = useRef<HTMLDivElement>(null);

  const fromDayKey = todayKey;
  const toDayKey = addDayKey(todayKey, DAYS_AHEAD - 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublicAvailability({ slug, serviceId, employeeId, fromDayKey, toDayKey })
      .then((res) => {
        if (cancelled) return;
        setDays(res.days);
        // Land on the first day that actually has openings.
        const firstOpen = res.days.find((d) => d.slots.length > 0);
        if (firstOpen) setActiveDay((cur) => (res.days.some((d) => d.dayKey === cur && d.slots.length > 0) ? cur : firstOpen.dayKey));
      })
      .catch(() => {
        if (!cancelled) setDays([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, serviceId, employeeId]);

  const daysWithOpenings = useMemo(() => days.filter((d) => d.slots.length > 0), [days]);
  const activeSlots = useMemo(() => days.find((d) => d.dayKey === activeDay)?.slots ?? [], [days, activeDay]);

  function scrollDays(dir: -1 | 1) {
    dayScroller.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (daysWithOpenings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
        No open appointments in the next {DAYS_AHEAD} days. Please check back soon or contact us directly.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Day selector */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Earlier days"
            onClick={() => scrollDays(-1)}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent sm:flex"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div ref={dayScroller} className="flex gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {daysWithOpenings.map((d) => {
              const parts = dayParts(d.dayKey);
              const active = d.dayKey === activeDay;
              return (
                <button
                  key={d.dayKey}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveDay(d.dayKey)}
                  className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border text-center transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/40'
                  }`}
                >
                  <span className="text-[11px] font-medium uppercase opacity-80">{parts.weekday}</span>
                  <span className="text-lg font-semibold leading-tight">{parts.day}</span>
                  <span className="text-[11px] opacity-80">{parts.month}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Later days"
            onClick={() => scrollDays(1)}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent sm:flex"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Time slots for the active day */}
      {activeSlots.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          No times left on this day. Try another date.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Available times">
          {activeSlots.map((s) => {
            const active = selected?.startISO === s.startISO;
            return (
              <button
                key={s.startISO}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  onSelect(
                    active
                      ? null
                      : { startISO: s.startISO, time: slotTime24(s.startISO, timeZone), employeeIds: s.employeeIds },
                  )
                }
                className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:border-primary/50 hover:bg-accent'
                }`}
              >
                {slotLabel(s.startISO, timeZone)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
