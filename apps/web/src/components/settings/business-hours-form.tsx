'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { DAY_LABELS, type DayHours } from '@booking/core';
import { Button } from '@booking/ui/button';
import { saveBusinessHoursAction } from '@/server/settings/actions';

const TIME =
  'rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40';

export function BusinessHoursForm({ initial }: { initial: DayHours[] }) {
  const [week, setWeek] = useState<DayHours[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function patch(day: number, next: Partial<DayHours>) {
    setWeek((prev) => prev.map((d) => (d.dayOfWeek === day ? { ...d, ...next } : d)));
  }

  function save() {
    setError(null);
    setSaved(false);
    // Reject any open day whose window is non-positive before sending.
    const bad = week.find((d) => !d.isClosed && d.openTime >= d.closeTime);
    if (bad) {
      setError(`${DAY_LABELS[bad.dayOfWeek]}: the closing time must be after the opening time.`);
      return;
    }
    start(async () => {
      const res = await saveBusinessHoursAction(week);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(res.error ?? 'Could not save.');
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">Opening hours</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The hours your business is open. Bookable times are kept within these hours; days left closed offer no availability.
          A day with no hours set is unconstrained.
        </p>
      </div>

      <ul className="divide-y divide-border">
        {week.map((day) => (
          <li key={day.dayOfWeek} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="w-24 text-sm font-medium">{DAY_LABELS[day.dayOfWeek]}</span>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={!day.isClosed}
                onChange={(e) => patch(day.dayOfWeek, { isClosed: !e.target.checked })}
                className="size-4 rounded border-border"
              />
              Open
            </label>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="time"
                value={day.openTime}
                disabled={day.isClosed}
                onChange={(e) => patch(day.dayOfWeek, { openTime: e.target.value })}
                className={TIME}
                aria-label={`${DAY_LABELS[day.dayOfWeek]} open time`}
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="time"
                value={day.closeTime}
                disabled={day.isClosed}
                onChange={(e) => patch(day.dayOfWeek, { closeTime: e.target.value })}
                className={TIME}
                aria-label={`${DAY_LABELS[day.dayOfWeek]} close time`}
              />
            </div>
          </li>
        ))}
      </ul>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save opening hours'}
        </Button>
        {saved ? (
          <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <Check className="size-4" /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
