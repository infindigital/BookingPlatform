'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { History, Filter } from 'lucide-react';
import type { AuditRow, AuditPage, TeamMemberRow } from '@booking/db';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import { loadAuditLogAction } from '@/server/access/actions';

const CONTROL =
  'h-9 rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const PAGE_SIZE = 50;

function summariseMetadata(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export function AuditLogPanel({
  initial,
  actions,
  members,
  timeZone,
}: {
  initial: AuditPage;
  actions: string[];
  members: TeamMemberRow[];
  timeZone: string;
}) {
  const [rows, setRows] = useState<AuditRow[]>(initial.rows);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [action, setAction] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [pending, start] = useTransition();
  const firstRender = useRef(true);

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const reload = useCallback(() => {
    start(async () => {
      const page = await loadAuditLogAction({
        limit: PAGE_SIZE,
        action: action || undefined,
        actorUserId: actorUserId || undefined,
      });
      setRows(page.rows);
      setCursor(page.nextCursor);
    });
  }, [action, actorUserId]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    reload();
  }, [reload]);

  function loadMore() {
    if (!cursor) return;
    start(async () => {
      const page = await loadAuditLogAction({
        limit: PAGE_SIZE,
        cursor,
        action: action || undefined,
        actorUserId: actorUserId || undefined,
      });
      setRows((r) => [...r, ...page.rows]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Filter className="size-4" /> Filter
        </span>
        <select value={action} onChange={(e) => setAction(e.target.value)} className={CONTROL} aria-label="Action">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} className={CONTROL} aria-label="Actor">
          <option value="">All members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {(action || actorUserId) ? (
          <Button variant="ghost" size="sm" onClick={() => { setAction(''); setActorUserId(''); }}>
            Clear
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-none border border-dashed border-border bg-card px-6 py-12 text-center">
          <History className="mx-auto mb-2 size-7 text-muted-foreground opacity-60" />
          <p className="font-medium">No activity</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Sensitive actions (sign-ins, approvals, and configuration changes) show up here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-none border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Entity</th>
                <th className="px-4 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{fmt.format(new Date(r.createdAt))}</td>
                  <td className="px-4 py-2.5">{r.actorName ?? <span className="text-muted-foreground">System</span>}</td>
                  <td className="px-4 py-2.5"><Badge tone="neutral">{r.action}</Badge></td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {r.entity ? (
                      <span>
                        {r.entity}
                        {r.entityId ? <span className="block font-mono text-xs opacity-70">{r.entityId}</span> : null}
                      </span>
                    ) : (
                      <span className="opacity-40">none</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{summariseMetadata(r.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={pending} aria-busy={pending}>
            {pending ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
