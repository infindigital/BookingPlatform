'use client';

import { useState, useTransition } from 'react';
import { Play, RefreshCw, Inbox } from 'lucide-react';
import type { NotificationActivity, NotificationActivityRow, NotificationJobStatus } from '@booking/db';
import { Badge } from '@booking/ui/badge';
import { Button } from '@booking/ui/button';
import { formatDay, formatTime } from '@/components/dashboard/format';
import { processNotificationsAction } from '@/server/notifications/actions';

const STATUS_TONE: Record<NotificationJobStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  QUEUED: 'warning',
  PROCESSING: 'info',
  SENT: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};
const STATUS_LABEL: Record<NotificationJobStatus, string> = {
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  SENT: 'Sent',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export function ActivityTable({
  activity,
  timeZone,
  onChanged,
}: {
  activity: NotificationActivity;
  timeZone: string;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function process() {
    setNote(null);
    start(async () => {
      const res = await processNotificationsAction();
      if (res.ok && res.summary) {
        const s = res.summary;
        setNote(
          s.claimed === 0
            ? 'Nothing due — the queue is empty.'
            : `Processed ${s.claimed}: ${s.sent} sent, ${s.retried} retried, ${s.failed} failed.`,
        );
        onChanged();
      } else {
        setNote(res.error ?? 'Could not process the queue.');
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Recent queue activity. Jobs are sent by a scheduled worker; run it now to drain what’s due.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onChanged} disabled={pending}>
            <RefreshCw /> Refresh
          </Button>
          <Button size="sm" onClick={process} disabled={pending} aria-busy={pending}>
            <Play /> {pending ? 'Processing…' : 'Process queue'}
          </Button>
        </div>
      </div>

      {note ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{note}</p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Event</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Recipient</th>
              <th className="hidden px-4 py-2.5 sm:table-cell">Scheduled</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activity.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-2 size-6 opacity-50" />
                  No notifications yet. They appear here as bookings happen.
                </td>
              </tr>
            ) : (
              activity.rows.map((r) => <Row key={r.id} r={r} timeZone={timeZone} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ r, timeZone }: { r: NotificationActivityRow; timeZone: string }) {
  const scheduled = new Date(r.scheduledISO);
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-medium">{r.eventLabel}</p>
        <p className="text-xs text-muted-foreground">
          {r.channel}
          {r.serviceName ? ` · ${r.serviceName}` : ''}
          {r.bookingReference ? ` · ${r.bookingReference}` : ''}
        </p>
        {r.lastError ? <p className="mt-1 line-clamp-2 text-xs text-destructive">{r.lastError}</p> : null}
      </td>
      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
        <p className="truncate">{r.customerName ?? '—'}</p>
        <p className="truncate text-xs">{r.recipient ?? ''}</p>
      </td>
      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
        {formatDay(scheduled, timeZone)} · {formatTime(scheduled, timeZone)}
      </td>
      <td className="px-4 py-3">
        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        {r.attempts > 1 ? <p className="mt-1 text-xs text-muted-foreground">{r.attempts}/{r.maxAttempts} tries</p> : null}
      </td>
    </tr>
  );
}
