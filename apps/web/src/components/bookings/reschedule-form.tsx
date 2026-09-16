'use client';

import { useActionState, useEffect } from 'react';
import type { BookingListRow, BookingFormData } from '@booking/db';
import { Button } from '@booking/ui/button';
import { rescheduleBookingAction, type BookingActionState } from '@/server/bookings/actions';

const CONTROL =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function toLocalInputs(iso: string, timeZone: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return { date, time };
}

export function RescheduleForm({
  booking,
  formData,
  timeZone,
  onCancel,
  onDone,
}: {
  booking: BookingListRow;
  formData: BookingFormData;
  timeZone: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<BookingActionState, FormData>(rescheduleBookingAction, {
    ok: false,
  });
  const defaults = toLocalInputs(booking.startISO, timeZone);
  const duration = Math.max(5, Math.round((new Date(booking.endISO).getTime() - new Date(booking.startISO).getTime()) / 60000));

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-sm font-medium">Reschedule</p>
      <input type="hidden" name="bookingId" value={booking.id} />
      <input type="hidden" name="durationMinutes" value={duration} />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Date</span>
          <input type="date" name="date" defaultValue={defaults.date} required className={CONTROL} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Time</span>
          <input type="time" name="time" defaultValue={defaults.time} required className={CONTROL} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Team member</span>
        <select name="employeeId" defaultValue="keep" className={CONTROL}>
          <option value="keep">Keep {booking.employeeName ?? 'current'}</option>
          <option value="none">Unassigned</option>
          {formData.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>

      {state.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
          {pending ? 'Saving…' : 'Save new time'}
        </Button>
      </div>
    </form>
  );
}
