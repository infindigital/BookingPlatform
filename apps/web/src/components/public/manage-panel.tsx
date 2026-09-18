'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { CalendarClock, Clock, ArrowLeft, CalendarX2 } from 'lucide-react';
import type { ManageLookupResult, ManageBookingRow } from '@booking/db';
import { Button } from '@booking/ui/button';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { DateTimePicker, type SelectedSlot } from './datetime-picker';
import { confirmationWhen, formatMoney, formatDuration } from './format';
import {
  lookupBookingsAction,
  cancelBookingAction,
  rescheduleBookingAction,
} from '@/server/public/manage-actions';

const CONTROL =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function todayInTz(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function ManagePanel({
  slug,
  businessName,
  initialEmail = '',
  initialReference = '',
}: {
  slug: string;
  businessName: string;
  initialEmail?: string;
  initialReference?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [reference, setReference] = useState(initialReference.toUpperCase());
  const [creds, setCreds] = useState<{ email: string; reference: string } | null>(null);
  const [result, setResult] = useState<ManageLookupResult | null>(null);

  const [looking, startLookup] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runLookup(lookupEmail: string, lookupReference: string) {
    setError(null);
    startLookup(async () => {
      const res = await lookupBookingsAction({ slug, email: lookupEmail, reference: lookupReference });
      if (res.ok) {
        setCreds({ email: res.email, reference: res.reference });
        setResult(res.result);
      } else {
        setError(res.error);
      }
    });
  }

  // Auto-verify when arriving via a magic link that pre-fills both fields.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    if (initialEmail && initialReference) {
      autoRan.current = true;
      runLookup(initialEmail, initialReference.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitLookup(e: React.FormEvent) {
    e.preventDefault();
    runLookup(email, reference);
  }

  function signOut() {
    setCreds(null);
    setResult(null);
    setReference('');
    setError(null);
  }

  if (!creds || !result) {
    return (
      <div className="rounded-none border border-border bg-background p-6 shadow-sm sm:p-8">
        <h1 className="text-lg font-semibold tracking-tight">{businessName}</h1>
        <p className="text-sm text-muted-foreground">Manage your appointment</p>

        <form onSubmit={submitLookup} className="mt-6 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={CONTROL}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Booking reference</span>
            <input
              required
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              className={`${CONTROL} font-mono tracking-wider`}
              placeholder="e.g. D4AP38GE"
              maxLength={8}
            />
          </label>
          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={looking} aria-busy={looking}>
            {looking ? 'Looking up…' : 'Find my booking'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your reference is on your booking confirmation.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Hi, {result.customerName.split(' ')[0] || 'there'}</h1>
          <p className="text-sm text-muted-foreground">Your appointments with {businessName}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <ArrowLeft /> Exit
        </Button>
      </div>

      {result.bookings.length === 0 ? (
        <p className="rounded-none border border-dashed border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
          You have no bookings on file.
        </p>
      ) : (
        <ul className="space-y-3">
          {result.bookings.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              slug={slug}
              creds={creds}
              timeZone={result.timeZone}
              onResult={(r) => setResult(r)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingCard({
  b,
  slug,
  creds,
  timeZone,
  onResult,
}: {
  b: ManageBookingRow;
  slug: string;
  creds: { email: string; reference: string };
  timeZone: string;
  onResult: (r: ManageLookupResult) => void;
}) {
  const [mode, setMode] = useState<'view' | 'cancel' | 'reschedule'>('view');
  const [slot, setSlot] = useState<SelectedSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startAction] = useTransition();
  const todayKey = useMemo(() => todayInTz(timeZone), [timeZone]);

  function doCancel() {
    setError(null);
    startAction(async () => {
      const res = await cancelBookingAction({ slug, email: creds.email, reference: creds.reference, bookingId: b.id });
      if (res.ok && res.result) {
        setMode('view');
        onResult(res.result);
      } else {
        setError(res.error ?? 'Could not cancel.');
      }
    });
  }

  function doReschedule() {
    if (!slot) return;
    setError(null);
    startAction(async () => {
      const res = await rescheduleBookingAction({
        slug,
        email: creds.email,
        reference: creds.reference,
        bookingId: b.id,
        dayKey: slot.startISO.slice(0, 10),
        time: slot.time,
      });
      if (res.ok && res.result) {
        setMode('view');
        setSlot(null);
        onResult(res.result);
      } else {
        setError(res.error ?? 'Could not reschedule.');
      }
    });
  }

  return (
    <li className="rounded-none border border-border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: b.serviceColor ?? 'hsl(var(--primary))' }} />
          <div className="min-w-0">
            <p className="font-medium">{b.serviceName}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <CalendarClock className="size-3.5" />
              {confirmationWhen(b.startISO, timeZone)}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> {formatDuration(b.durationMinutes)}
              {b.employeeName ? ` · ${b.employeeName}` : ''} · {formatMoney(b.priceTotal, b.currency)}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Ref {b.reference}</p>
          </div>
        </div>
        <StatusBadge status={b.status} />
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* Actions */}
      {mode === 'view' && (b.canCancel || b.canReschedule) ? (
        <div className="mt-3 flex gap-2">
          {b.canReschedule ? (
            <Button variant="outline" size="sm" onClick={() => setMode('reschedule')}>
              Reschedule
            </Button>
          ) : null}
          {b.canCancel ? (
            <Button variant="ghost" size="sm" onClick={() => setMode('cancel')}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode === 'cancel' ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarX2 className="size-4" /> Cancel this appointment?
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="destructive" size="sm" onClick={doCancel} disabled={pending} aria-busy={pending}>
              {pending ? 'Cancelling…' : 'Yes, cancel'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={pending}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'reschedule' ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-medium">Pick a new time</p>
          <DateTimePicker
            slug={slug}
            serviceId={b.serviceId}
            employeeId={b.employeeId}
            timeZone={timeZone}
            todayKey={todayKey}
            selected={slot}
            onSelect={setSlot}
          />
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={doReschedule} disabled={!slot || pending} aria-busy={pending}>
              {pending ? 'Saving…' : 'Confirm new time'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode('view');
                setSlot(null);
              }}
              disabled={pending}
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
