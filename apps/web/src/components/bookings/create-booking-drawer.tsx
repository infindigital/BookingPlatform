'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { BookingFormData } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import {
  createBookingAction,
  loadAvailableSlots,
  type BookingActionState,
  type SlotOption,
} from '@/server/bookings/actions';
import { formatMoney } from '@/components/dashboard/format';

const CONTROL =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function todayInTz(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function CreateBookingForm({
  formData,
  timeZone,
  onDone,
}: {
  formData: BookingFormData;
  timeZone: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<BookingActionState, FormData>(createBookingAction, {
    ok: false,
  });
  const [mode, setMode] = useState<'existing' | 'new'>(formData.customers.length > 0 ? 'existing' : 'new');
  const [serviceId, setServiceId] = useState<string>(formData.services[0]?.id ?? '');
  const [employeeId, setEmployeeId] = useState<string>('none');
  const [date, setDate] = useState<string>(todayInTz(timeZone));

  // Availability-driven slot picker.
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [loadingSlots, setLoadingSlots] = useState(false);

  const selectedSlot = slots.find((s) => s.time === selectedTime);

  const service = formData.services.find((s) => s.id === serviceId);
  const eligibleEmployees = useMemo(
    () => formData.employees.filter((e) => e.serviceIds.length === 0 || e.serviceIds.includes(serviceId)),
    [formData.employees, serviceId],
  );

  // If the chosen employee no longer offers the selected service, fall back to "any".
  useEffect(() => {
    if (employeeId !== 'none' && !eligibleEmployees.some((e) => e.id === employeeId)) {
      setEmployeeId('none');
    }
  }, [eligibleEmployees, employeeId]);

  // Fetch the real bookable start times whenever the service, team member, or date changes.
  useEffect(() => {
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSelectedTime('');
    loadAvailableSlots({ serviceId, employeeId, dayKey: date })
      .then((res) => {
        if (!cancelled) setSlots(res.slots);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, employeeId, date]);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border p-5">
        <SheetTitle className="text-base font-semibold">New booking</SheetTitle>
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Close">
            <X />
          </Button>
        </SheetClose>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* Customer */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</legend>
          <div className="flex rounded-md border border-border p-0.5 text-sm">
            {(['existing', 'new'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded px-3 py-1 font-medium transition-colors ${
                  mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {m === 'existing' ? 'Existing' : 'New'}
              </button>
            ))}
          </div>
          <input type="hidden" name="customerMode" value={mode} />
          {mode === 'existing' ? (
            <select name="customerId" required className={CONTROL} defaultValue="">
              <option value="" disabled>
                Choose a customer…
              </option>
              {formData.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input name="customerFirstName" placeholder="First name" required className={CONTROL} />
              <input name="customerLastName" placeholder="Last name" className={CONTROL} />
              <input name="customerEmail" type="email" placeholder="Email" required className={`${CONTROL} col-span-2`} />
              <input name="customerPhone" placeholder="Phone (optional)" className={`${CONTROL} col-span-2`} />
            </div>
          )}
        </fieldset>

        {/* Service */}
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Service</span>
          <select
            name="serviceId"
            required
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className={CONTROL}
          >
            {formData.services.length === 0 ? <option value="">No services</option> : null}
            {formData.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {service ? (
            <span className="text-xs text-muted-foreground">
              {service.durationMinutes} min · {formatMoney(service.price, formData.currency)}
            </span>
          ) : null}
        </label>

        {/* Team + Location */}
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Team member</span>
            <select
              name="employeeId"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={CONTROL}
            >
              <option value="none">Any available</option>
              {eligibleEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Location</span>
            <select name="locationId" defaultValue="" className={CONTROL}>
              <option value="">None</option>
              {formData.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Date */}
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</span>
          <input
            type="date"
            name="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={CONTROL}
          />
        </label>

        {/* Available times (from the availability engine) */}
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Available times</span>
          <input type="hidden" name="time" value={selectedTime} />
          {/* When "Any available" is chosen, let the server assign a free employee from this slot. */}
          <input type="hidden" name="slotEmployeeIds" value={selectedSlot?.employeeIds.join(',') ?? ''} />
          {loadingSlots ? (
            <p className="py-3 text-sm text-muted-foreground">Finding open times…</p>
          ) : slots.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              No open times for this day. Try another date or team member.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Available times">
              {slots.map((slot) => {
                const active = slot.time === selectedTime;
                return (
                  <button
                    key={slot.time}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedTime(slot.time)}
                    className={`h-9 rounded-md border text-sm font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent'
                    }`}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Notes */}
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</span>
          <textarea name="notes" rows={2} placeholder="Optional notes…" className={`${CONTROL} h-auto py-2`} />
        </label>

        {state.error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
        <SheetClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </SheetClose>
        <Button
          type="submit"
          disabled={pending || formData.services.length === 0 || !selectedTime}
          aria-busy={pending}
        >
          {pending ? 'Creating…' : 'Create booking'}
        </Button>
      </footer>
    </form>
  );
}

export function CreateBookingDrawer({
  open,
  onOpenChange,
  formData,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: BookingFormData;
  timeZone: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[26rem] max-w-[95vw] p-0">
        {open ? (
          <CreateBookingForm formData={formData} timeZone={timeZone} onDone={() => onOpenChange(false)} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
