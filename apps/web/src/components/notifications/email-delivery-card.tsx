'use client';

import { useState, useTransition } from 'react';
import { Mail, ShieldCheck, ServerCog, SendHorizonal, CircleAlert, CircleCheck } from 'lucide-react';
import type { EmailConfigStatus } from '@booking/db';
import { Badge } from '@booking/ui/badge';
import { Button } from '@booking/ui/button';
import { sendTestEmailAction } from '@/server/notifications/actions';

const CONTROL =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function EmailDeliveryCard({ status, defaultTo }: { status: EmailConfigStatus; defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  function sendTest() {
    setNote(null);
    start(async () => {
      const res = await sendTestEmailAction({ to });
      if (res.ok) {
        setNote(
          res.simulated
            ? { tone: 'warn', text: `Accepted by the no-op transport (nothing was actually sent). Configure SMTP to deliver real email.` }
            : { tone: 'ok', text: `Test email sent to ${to}.` },
        );
      } else {
        setNote({ tone: 'err', text: res.error ?? 'Could not send the test email.' });
      }
    });
  }

  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="size-4" />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              Email delivery
              {status.configured ? (
                <Badge tone="success">SMTP connected</Badge>
              ) : (
                <Badge tone="warning">Not configured</Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {status.configured
                ? 'Emails are delivered through your SMTP server.'
                : 'Using the built-in no-op transport - messages queue and log but are not delivered.'}
            </p>
          </div>
        </div>
      </div>

      {status.configured ? (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <Row icon={<ServerCog className="size-3.5" />} label="Host">
            {status.host}:{status.port} {status.secure ? '(TLS)' : '(STARTTLS)'}
          </Row>
          <Row icon={<Mail className="size-3.5" />} label="From">
            {status.fromName ? `${status.fromName} · ` : ''}
            {status.from}
          </Row>
          <Row icon={<ShieldCheck className="size-3.5" />} label="Auth">
            {status.authenticated ? 'Authenticated' : 'Anonymous relay'}
          </Row>
        </dl>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Set <code className="font-mono">SMTP_HOST</code>, <code className="font-mono">EMAIL_FROM</code> (and{' '}
          <code className="font-mono">SMTP_USER</code> / <code className="font-mono">SMTP_PASS</code> for authenticated
          servers) in the server environment to enable real email. Any SMTP mailbox works - no paid service required.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="you@example.com"
          className={`${CONTROL} sm:max-w-xs`}
          aria-label="Send test email to"
        />
        <Button size="sm" onClick={sendTest} disabled={pending || !to} aria-busy={pending}>
          <SendHorizonal /> {pending ? 'Sending…' : 'Send test email'}
        </Button>
      </div>

      {note ? (
        <p
          className={`mt-2 flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs ${
            note.tone === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
              : note.tone === 'warn'
                ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
                : 'border-destructive/30 bg-destructive/5 text-destructive'
          }`}
        >
          {note.tone === 'err' ? <CircleAlert className="size-3.5 shrink-0" /> : <CircleCheck className="size-3.5 shrink-0" />}
          {note.text}
        </p>
      ) : null}
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate font-medium">{children}</span>
    </div>
  );
}
