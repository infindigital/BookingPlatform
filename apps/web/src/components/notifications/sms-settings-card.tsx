'use client';

import { useState, useTransition } from 'react';
import { MessageSquare, CheckCircle2 } from 'lucide-react';
import type { SmsSettingsStatus } from '@booking/db';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import { saveSmsSettingsAction } from '@/server/notifications/actions';

const CONTROL =
  'h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function SmsSettingsCard({ status }: { status: SmsSettingsStatus }) {
  const [accountSid, setAccountSid] = useState(status.accountSid ?? '');
  const [authToken, setAuthToken] = useState('');
  const [fromNumber, setFromNumber] = useState(status.fromNumber ?? '');
  const [isEnabled, setIsEnabled] = useState(status.isEnabled);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveSmsSettingsAction({ accountSid, authToken, fromNumber, isEnabled });
      if (res.ok) {
        setAuthToken('');
        setMsg({ ok: true, text: 'SMS settings saved.' });
      } else {
        setMsg({ ok: false, text: res.error ?? 'Could not save.' });
      }
    });
  }

  return (
    <section className="rounded-none border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="size-4" />
          </span>
          <div>
            <p className="flex items-center gap-2 font-medium">
              Text messages (SMS)
              {status.configured && status.isEnabled ? (
                <Badge tone="success">
                  <CheckCircle2 className="mr-1 size-3" /> Live
                </Badge>
              ) : status.configured ? (
                <Badge tone="neutral">Configured, off</Badge>
              ) : (
                <Badge tone="neutral">Not set up</Badge>
              )}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Send booking texts through Twilio. Credentials are stored encrypted and never shown again.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Account SID</span>
          <input value={accountSid} onChange={(e) => setAccountSid(e.target.value)} className={CONTROL} placeholder="AC…" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">From number</span>
          <input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} className={CONTROL} placeholder="+18164420295" />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Auth token</span>
          <input
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            className={CONTROL}
            placeholder={status.hasToken ? 'Stored — leave blank to keep' : 'Twilio auth token'}
            autoComplete="off"
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2.5 border border-border bg-muted/30 p-3">
        <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="size-4 rounded border-border accent-primary" />
        <span>
          <span className="block text-sm font-medium">Send SMS notifications</span>
          <span className="block text-xs text-muted-foreground">
            When on, booking events also text the customer (and any SMS recipients) using the default SMS copy.
          </span>
        </span>
      </label>

      {msg ? (
        <p role="alert" className={`mt-3 rounded-none border px-3 py-2 text-sm ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
          {msg.text}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={pending} aria-busy={pending}>
          {pending ? 'Saving…' : 'Save SMS settings'}
        </Button>
      </div>
    </section>
  );
}
