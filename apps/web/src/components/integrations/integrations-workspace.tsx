'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Webhook, Plus, Clock, Send, KeyRound, Pencil, Trash2, Power, Copy, Check, ShieldCheck } from 'lucide-react';
import type { WebhookListItem, WebhookDeliveryRow } from '@booking/db';
import type { WebhookDeliveryStatus } from '@booking/db';
import { Badge } from '@booking/ui/badge';
import { Button } from '@booking/ui/button';
import { WebhookFormDrawer } from './webhook-form-drawer';
import { DeliveriesTable } from './deliveries-table';
import {
  toggleWebhookAction,
  deleteWebhookAction,
  sendWebhookPingAction,
  rotateWebhookSecretAction,
} from '@/server/integrations/actions';

type Tab = 'endpoints' | 'deliveries';

const LAST_TONE: Record<WebhookDeliveryStatus, 'success' | 'danger' | 'warning'> = {
  SUCCESS: 'success',
  FAILED: 'danger',
  PENDING: 'warning',
};

export function IntegrationsWorkspace({
  webhooks,
  deliveries,
  timeZone,
}: {
  webhooks: WebhookListItem[];
  deliveries: WebhookDeliveryRow[];
  timeZone: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('endpoints');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookListItem | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openCreate() {
    setEditing(null);
    setDrawerKey((k) => k + 1);
    setDrawerOpen(true);
  }
  function openEdit(w: WebhookListItem) {
    setEditing(w);
    setDrawerKey((k) => k + 1);
    setDrawerOpen(true);
  }
  function onSaved(secret?: string) {
    setDrawerOpen(false);
    if (secret) setRevealedSecret(secret);
    router.refresh();
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string; secret?: string; statusCode?: number | null }>, okMsg?: string) {
    setNote(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (res.secret) setRevealedSecret(res.secret);
        if (okMsg) setNote(okMsg);
        router.refresh();
      } else {
        setNote(res.error ?? 'Something went wrong.');
      }
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a signed webhook to your own systems (Zapier, Make, n8n, a custom endpoint) on every booking event.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> Add endpoint
        </Button>
      </header>

      {revealedSecret ? <SecretBanner secret={revealedSecret} onDismiss={() => setRevealedSecret(null)} /> : null}
      {note ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{note}</p> : null}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'endpoints'} onClick={() => setTab('endpoints')} icon={<Webhook className="size-4" />}>
          Endpoints
        </TabButton>
        <TabButton active={tab === 'deliveries'} onClick={() => setTab('deliveries')} icon={<Clock className="size-4" />}>
          Deliveries
        </TabButton>
      </div>

      {tab === 'endpoints' ? (
        webhooks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <Webhook className="mx-auto mb-3 size-8 text-muted-foreground opacity-60" />
            <p className="font-medium">No endpoints yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Add an https endpoint to receive a signed POST whenever a booking is created, confirmed, cancelled, and more.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus /> Add endpoint
            </Button>
          </div>
        ) : (
          <div className="grid gap-2.5">
            {webhooks.map((w) => (
              <div key={w.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Webhook className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-mono text-sm font-medium">
                        <span className="truncate">{w.url}</span>
                        {w.isActive ? null : <Badge tone="neutral">Off</Badge>}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {w.events.map((e) => (
                          <span key={e} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {e}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{w.deliveries.success} delivered · {w.deliveries.failed} failed · {w.deliveries.pending} pending</span>
                        {w.lastStatus ? <Badge tone={LAST_TONE[w.lastStatus]}>last: {w.lastStatus.toLowerCase()}</Badge> : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => act(() => sendWebhookPingAction({ id: w.id }), 'Test event sent — check the Deliveries tab.')} disabled={pending}>
                      <Send /> Test
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(w)} disabled={pending}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={w.isActive ? 'Disable' : 'Enable'} onClick={() => act(() => toggleWebhookAction({ id: w.id, isActive: !w.isActive }))} disabled={pending}>
                      <Power className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Rotate secret" onClick={() => act(() => rotateWebhookSecretAction({ id: w.id }))} disabled={pending}>
                      <KeyRound className="size-4" />
                    </Button>
                    <ConfirmDelete onConfirm={() => act(() => deleteWebhookAction({ id: w.id }), 'Endpoint deleted.')} disabled={pending} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <DeliveriesTable deliveries={deliveries} timeZone={timeZone} onChanged={() => router.refresh()} />
      )}

      <WebhookFormDrawer key={drawerKey} webhook={editing} open={drawerOpen} onOpenChange={setDrawerOpen} onSaved={onSaved} />
    </div>
  );
}

function SecretBanner({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="size-4" /> Signing secret — copy it now, it won’t be shown again
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Verify deliveries by computing <code className="font-mono">HMAC-SHA256</code> of{' '}
        <code className="font-mono">{'{timestamp}.{body}'}</code> and comparing to the <code className="font-mono">X-Booking-Signature</code> header.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">{secret}</code>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

function ConfirmDelete({ onConfirm, disabled }: { onConfirm: () => void; disabled: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setArmed(true)} disabled={disabled}>
        <Trash2 className="size-4" />
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Button variant="destructive" size="sm" onClick={onConfirm} disabled={disabled}>
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)} disabled={disabled}>
        Cancel
      </Button>
    </span>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
