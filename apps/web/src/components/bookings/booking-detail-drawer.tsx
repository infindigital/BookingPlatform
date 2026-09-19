'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarClock, DollarSign, Home, ListChecks, MapPin, Scissors, Tag, User, UserCog, X } from 'lucide-react';
import type { BookingListRow, BookingFormData } from '@booking/db';
import { availableActions, isReschedulable } from '@booking/core';
import { Sheet, SheetContent, SheetClose, SheetTitle, SheetDescription } from '@booking/ui/sheet';
import { Button, type ButtonProps } from '@booking/ui/button';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { formatDay, formatMoney, formatTime } from '@/components/dashboard/format';
import { bookingAction } from '@/server/bookings/actions';
import { RescheduleForm } from './reschedule-form';

function Row({ icon: Icon, label, value }: { icon: typeof User; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm">{value}</div>
      </div>
    </div>
  );
}

const TONE_VARIANT: Record<string, ButtonProps['variant']> = {
  primary: 'primary',
  destructive: 'destructive',
  default: 'outline',
};

export function BookingDetailDrawer({
  booking,
  open,
  onOpenChange,
  formData,
  timeZone,
  canApprove,
  canWrite,
}: {
  booking: BookingListRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: BookingFormData;
  timeZone: string;
  canApprove: boolean;
  canWrite: boolean;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  useEffect(() => {
    if (!open) setRescheduling(false);
  }, [open]);

  const actions = booking
    ? availableActions(booking.status).filter((a) =>
        a.permission === 'booking.approve' ? canApprove : canWrite,
      )
    : [];
  const showReschedule = booking ? isReschedulable(booking.status) && canWrite : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 max-w-[92vw] p-0">
        {booking ? (
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div className="min-w-0">
                <SheetTitle className="truncate text-base font-semibold">{booking.serviceName}</SheetTitle>
                <SheetDescription className="mt-1">
                  <StatusBadge status={booking.status} />
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button variant="ghost" size="icon" aria-label="Close">
                  <X />
                </Button>
              </SheetClose>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-2">
              <div className="divide-y divide-border">
                <Row
                  icon={CalendarClock}
                  label="When"
                  value={
                    <span>
                      {formatDay(new Date(booking.startISO), timeZone)} ·{' '}
                      {formatTime(new Date(booking.startISO), timeZone)} -{' '}
                      {formatTime(new Date(booking.endISO), timeZone)}
                    </span>
                  }
                />
                <Row
                  icon={User}
                  label="Customer"
                  value={
                    <div>
                      <p className="font-medium">{booking.customerName}</p>
                      {booking.customerEmail ? (
                        <p className="text-xs text-muted-foreground">{booking.customerEmail}</p>
                      ) : null}
                    </div>
                  }
                />
                <Row icon={Scissors} label="Service" value={booking.serviceName} />
                <Row icon={UserCog} label="Team member" value={booking.employeeName ?? 'Unassigned'} />
                {booking.locationName ? (
                  <Row
                    icon={MapPin}
                    label="Location"
                    value={
                      <div>
                        <p className="font-medium">{booking.locationName}</p>
                        {booking.locationAddress ? (
                          <p className="text-xs text-muted-foreground">{booking.locationAddress}</p>
                        ) : null}
                        {booking.locationMapUrl ? (
                          <a
                            href={booking.locationMapUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                          >
                            View map
                          </a>
                        ) : null}
                      </div>
                    }
                  />
                ) : null}
                {booking.customerAddress ? (
                  <Row icon={Home} label="Customer address" value={booking.customerAddress} />
                ) : null}
                <Row
                  icon={DollarSign}
                  label="Total"
                  value={booking.priceTotal > 0 ? formatMoney(booking.priceTotal, booking.currency) : 'No charge'}
                />
                {booking.source ? <Row icon={Tag} label="Source" value={booking.source} /> : null}
                {booking.notes ? <Row icon={User} label="Notes" value={booking.notes} /> : null}
                {booking.customFields.map((f, i) => (
                  <Row key={`${f.label}-${i}`} icon={ListChecks} label={f.label} value={f.value} />
                ))}
              </div>

              {rescheduling && booking ? (
                <div className="pb-4 pt-2">
                  <RescheduleForm
                    booking={booking}
                    formData={formData}
                    timeZone={timeZone}
                    onCancel={() => setRescheduling(false)}
                    onDone={() => {
                      setRescheduling(false);
                      onOpenChange(false);
                    }}
                  />
                </div>
              ) : null}
            </div>

            {(actions.length > 0 || showReschedule) && !rescheduling ? (
              <footer className="flex flex-wrap items-center gap-2 border-t border-border p-4">
                {actions.map((a) => (
                  <form key={a.key} action={bookingAction}>
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <input type="hidden" name="action" value={a.key} />
                    <Button type="submit" size="sm" variant={TONE_VARIANT[a.tone]}>
                      {a.label}
                    </Button>
                  </form>
                ))}
                {showReschedule ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setRescheduling(true)}>
                    Reschedule
                  </Button>
                ) : null}
              </footer>
            ) : !canApprove && !canWrite ? (
              <footer className="border-t border-border p-4">
                <p className="text-center text-xs text-muted-foreground">
                  You have read-only access to bookings.
                </p>
              </footer>
            ) : null}
          </div>
        ) : (
          <SheetTitle className="p-5 text-sm text-muted-foreground">No booking selected</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  );
}
