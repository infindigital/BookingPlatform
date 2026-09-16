'use client';

import type { ReactNode } from 'react';
import { CalendarClock, DollarSign, MapPin, Scissors, User, UserCog, X, type LucideIcon } from 'lucide-react';
import type { CalendarBooking } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle, SheetDescription } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { formatDay, formatMoney, formatTime } from '@/components/dashboard/format';

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
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

export function BookingDrawer({
  booking,
  open,
  onOpenChange,
  timeZone,
}: {
  booking: CalendarBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeZone: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 p-0">
        {booking ? (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div className="min-w-0">
                <SheetTitle className="truncate text-base font-semibold">
                  {booking.serviceName}
                </SheetTitle>
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
                      {formatTime(new Date(booking.startISO), timeZone)} –{' '}
                      {formatTime(new Date(booking.endISO), timeZone)}
                    </span>
                  }
                />
                <Row icon={User} label="Customer" value={
                  <div>
                    <p className="font-medium">{booking.customerName}</p>
                    {booking.customerEmail ? (
                      <p className="text-xs text-muted-foreground">{booking.customerEmail}</p>
                    ) : null}
                  </div>
                } />
                <Row icon={Scissors} label="Service" value={booking.serviceName} />
                <Row icon={UserCog} label="Team member" value={booking.employeeName ?? 'Unassigned'} />
                {booking.locationName ? (
                  <Row icon={MapPin} label="Location" value={booking.locationName} />
                ) : null}
                <Row
                  icon={DollarSign}
                  label="Total"
                  value={booking.priceTotal > 0 ? formatMoney(booking.priceTotal, booking.currency) : 'No charge'}
                />
                {booking.notes ? <Row icon={User} label="Notes" value={booking.notes} /> : null}
              </div>
            </div>

            <footer className="border-t border-border p-4">
              <p className="text-center text-xs text-muted-foreground">
                Editing &amp; rescheduling arrive with the booking engine (Phase 7).
              </p>
            </footer>
          </>
        ) : (
          <SheetTitle className="p-5 text-sm text-muted-foreground">No booking selected</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  );
}
