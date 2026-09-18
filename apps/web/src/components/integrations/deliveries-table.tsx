'use client';

import { useState, useTransition } from 'react';
import { Play, RefreshCw, Inbox, RotateCcw } from 'lucide-react';
import type { WebhookDeliveryRow } from '@booking/db';
import type { WebhookDeliveryStatus } from '@booking/db';
import { Badge } from '@booking/ui/badge';
import { Button } from '@booking/ui/button';
import { formatDay, formatTime } from '@/components/dashboard/format';
import { processWebhooksAction, retryWebhookDeliveryAction } from '@/server/integrations/actions';

const STATUS_TONE: Record<WebhookDeliveryStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'warning',
  SUCCESS: 'success',
  FAILED: 'danger',
};
const STATUS_LABEL: Record<WebhookDeliveryStatus, string> = {
  PENDING: 'Pending',
  SUCCESS: 'Delivered',
  FAILED: 'Failed',
};

export function DeliveriesTable({
  deliveries,
  timeZone,
  onChanged,
}: {
  deliveries: WebhookDeliveryRow[];
  timeZone: string;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function process() {
    setNote(null);
    start(async () => {
      const res = await processWebhooksAction();
      if (res.ok && res.summary) {
        const s = res.summary;
        setNote(
          s.claimed === 0 && s.failed === 0
            ? 'Nothing due — the queue is empty.'
            : `Processed ${s.claimed}: ${s.delivered} delivered, ${s.retried} retried, ${s.failed} failed.`,
        );
        onChanged();
      } else {
        setNote(res.error ?? 'Could not process deliveries.');
      }
    });
  }

  function retry(id: string) {
    start(async () => {
      const res = await retryWebhookDeliveryAction({ id });
      if (res.ok) onChanged();
      else setNote(res.error ?? 'Could not retry.');
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Recent delivery attempts. A scheduled worker retries failures with backoff.</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onChanged} disabled={pending}>
            <RefreshCw /> Refresh
          </Button>
          <Button size="sm" onClick={process} disabled={pending} aria-busy={pending}>
            <Play /> {pending ? 'Processing…' : 'Process deliveries'}
          </Button>
        </div>
      </div>

      {note ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{note}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Event</th>
              <th className="hidden px-4 py-2.5 sm:table-cell">Sent</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {deliveries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-2 size-6 opacity-50" />
                  No deliveries yet. They appear here as booking events fire.
                </td>
              </tr>
            ) : (
              deliveries.map((d) => {
                const when = new Date(d.createdAt);
                return (
                  <tr key={d.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-medium">{d.event}</p>
                      {d.statusCode != null ? <p className="text-xs text-muted-foreground">HTTP {d.statusCode}</p> : null}
                      {d.status === 'FAILED' && d.responseBody ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-destructive">{d.responseBody}</p>
                      ) : null}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {formatDay(when, timeZone)} · {formatTime(when, timeZone)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {d.status === 'FAILED' ? (
                        <Button variant="ghost" size="sm" onClick={() => retry(d.id)} disabled={pending}>
                          <RotateCcw /> Retry
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{d.attempts}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
