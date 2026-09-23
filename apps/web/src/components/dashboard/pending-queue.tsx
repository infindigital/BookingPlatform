import { Check, Inbox, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/card';
import { Badge } from '@booking/ui/badge';
import type { DashboardBooking } from '@booking/db';
import { approveBooking, rejectBooking } from '@/server/bookings/actions';
import { SubmitButton } from './submit-button';
import { formatDay, formatMoney, formatTime } from './format';

/**
 * Pending-approval queue. When the viewer holds `booking.approve`, each row
 * carries real approve/reject controls wired to server actions; otherwise it is
 * a read-only view of what is awaiting a decision.
 */
export function PendingQueue({
  bookings,
  timeZone,
  canApprove,
}: {
  bookings: DashboardBooking[];
  timeZone: string;
  canApprove: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md ring-1 ring-white/20">
            <Inbox className="size-4" aria-hidden />
          </span>
          Pending approvals
        </CardTitle>
        {bookings.length > 0 ? <Badge tone="warning">{bookings.length}</Badge> : null}
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <Inbox className="size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">You&rsquo;re all caught up</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              New booking requests waiting for a decision show up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.serviceName} · {formatDay(b.startAt, timeZone)} at{' '}
                    {formatTime(b.startAt, timeZone)}
                    {b.priceTotal > 0 ? ` · ${formatMoney(b.priceTotal, b.currency)}` : ''}
                  </p>
                </div>
                {canApprove ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <form action={rejectBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <SubmitButton
                        variant="outline"
                        size="sm"
                        aria-label={`Reject booking for ${b.customerName}`}
                      >
                        <X aria-hidden />
                        Reject
                      </SubmitButton>
                    </form>
                    <form action={approveBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <SubmitButton
                        size="sm"
                        aria-label={`Approve booking for ${b.customerName}`}
                      >
                        <Check aria-hidden />
                        Approve
                      </SubmitButton>
                    </form>
                  </div>
                ) : (
                  <Badge tone="warning">Awaiting decision</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
