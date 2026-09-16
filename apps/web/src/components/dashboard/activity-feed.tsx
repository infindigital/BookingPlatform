import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/card';
import type { DashboardBooking } from '@booking/db';
import { StatusBadge } from './status-badge';
import { formatDay, formatRelative, initials, formatTime } from './format';

export function ActivityFeed({
  bookings,
  timeZone,
  now,
}: {
  bookings: DashboardBooking[];
  timeZone: string;
  now: Date;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Recent activity</CardTitle>
        <Activity className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No bookings yet.</p>
        ) : (
          <ul className="space-y-4">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {initials(b.customerName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{b.customerName}</p>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.serviceName} · {formatDay(b.startAt, timeZone)} at{' '}
                    {formatTime(b.startAt, timeZone)}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={b.createdAt.toISOString()}>
                  {formatRelative(b.createdAt, now)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
