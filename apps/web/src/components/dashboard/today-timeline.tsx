import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/card';
import type { DashboardBooking } from '@booking/db';
import { StatusBadge } from './status-badge';
import { formatDurationMinutes, formatTime } from './format';

export function TodayTimeline({
  bookings,
  timeZone,
}: {
  bookings: DashboardBooking[];
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md ring-1 ring-white/20">
            <CalendarClock className="size-4" aria-hidden />
          </span>
          Today&rsquo;s schedule
        </CardTitle>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {bookings.length} on the books
        </span>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <CalendarClock className="size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Nothing scheduled today</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Confirmed and pending bookings for today appear here.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-1">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-accent/40">
                <div className="w-14 shrink-0 pt-0.5 text-right text-xs font-medium tabular-nums text-muted-foreground">
                  {formatTime(b.startAt, timeZone)}
                </div>
                <span
                  className="mt-1 size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: b.serviceColor ?? 'hsl(var(--primary))' }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{b.customerName}</p>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.serviceName}
                    {b.employeeName ? ` · ${b.employeeName}` : ''} ·{' '}
                    {formatDurationMinutes(b.startAt, b.endAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
