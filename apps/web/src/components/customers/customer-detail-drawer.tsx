'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { X, Mail, Phone, Pencil, StickyNote, CalendarClock, History } from 'lucide-react';
import type { CustomerDetail } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { formatMoney, formatDay, formatTime, formatRelative, initials } from '@/components/dashboard/format';
import { loadCustomerDetail, addCustomerNoteAction } from '@/server/customers/actions';

export interface CustomerEditSeed {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export function CustomerDetailDrawer({
  customerId,
  open,
  onOpenChange,
  timeZone,
  canWrite,
  onEdit,
}: {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeZone: string;
  canWrite: boolean;
  onEdit: (seed: CustomerEditSeed) => void;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savingNote, startSaveNote] = useTransition();

  const reload = useCallback(() => {
    if (!customerId) return;
    setLoading(true);
    loadCustomerDetail(customerId)
      .then((d) => setDetail(d))
      .finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => {
    if (open && customerId) {
      setDetail(null);
      setNoteBody('');
      setNoteError(null);
      reload();
    }
  }, [open, customerId, reload]);

  function submitNote() {
    if (!customerId || !noteBody.trim()) return;
    setNoteError(null);
    const fd = new FormData();
    fd.set('customerId', customerId);
    fd.set('body', noteBody.trim());
    startSaveNote(async () => {
      const res = await addCustomerNoteAction({ ok: false }, fd);
      if (res.ok) {
        setNoteBody('');
        reload();
      } else {
        setNoteError(res.error ?? 'Could not add the note.');
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[32rem] max-w-[95vw] p-0">
        {loading && !detail ? (
          <div className="space-y-3 p-6">
            <div className="h-8 w-40 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded bg-muted" />
            <div className="h-40 animate-pulse rounded bg-muted" />
          </div>
        ) : !detail ? (
          <div className="p-6">
            <SheetTitle className="text-base font-semibold">Customer</SheetTitle>
            <p className="mt-2 text-sm text-muted-foreground">This customer could not be loaded.</p>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Header */}
            <header className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {initials(detail.name)}
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base font-semibold">{detail.name}</SheetTitle>
                  <p className="truncate text-xs text-muted-foreground">
                    Customer since {formatDay(new Date(detail.createdISO), timeZone)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canWrite ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onEdit({ id: detail.id, firstName: detail.firstName, lastName: detail.lastName, email: detail.email, phone: detail.phone ?? '' })
                    }
                  >
                    <Pencil /> Edit
                  </Button>
                ) : null}
                <SheetClose asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Close">
                    <X />
                  </Button>
                </SheetClose>
              </div>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Contact */}
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                <a href={`mailto:${detail.email}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                  <Mail className="size-4 text-muted-foreground" /> {detail.email}
                </a>
                {detail.phone ? (
                  <a href={`tel:${detail.phone}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                    <Phone className="size-4 text-muted-foreground" /> {detail.phone}
                  </a>
                ) : null}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Bookings" value={String(detail.stats.bookingsCount)} />
                <Stat label="Completed" value={String(detail.stats.completedCount)} />
                <Stat label="Upcoming" value={String(detail.stats.upcomingCount)} />
                <Stat label="Lifetime" value={formatMoney(detail.stats.totalSpent, detail.stats.currency)} />
              </div>

              {/* Upcoming */}
              <Section icon={<CalendarClock className="size-4" />} title={`Upcoming (${detail.upcoming.length})`}>
                {detail.upcoming.length === 0 ? (
                  <Empty>No upcoming appointments.</Empty>
                ) : (
                  <ul className="space-y-2">
                    {detail.upcoming.map((b) => (
                      <BookingItem key={b.id} b={b} timeZone={timeZone} />
                    ))}
                  </ul>
                )}
              </Section>

              {/* History */}
              <Section icon={<History className="size-4" />} title={`History (${detail.past.length})`}>
                {detail.past.length === 0 ? (
                  <Empty>No past appointments yet.</Empty>
                ) : (
                  <ul className="space-y-2">
                    {detail.past.map((b) => (
                      <BookingItem key={b.id} b={b} timeZone={timeZone} />
                    ))}
                  </ul>
                )}
              </Section>

              {/* Notes */}
              <Section icon={<StickyNote className="size-4" />} title={`Notes (${detail.notes.length})`}>
                {canWrite ? (
                  <div className="mb-3 space-y-2">
                    <textarea
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      rows={2}
                      placeholder="Add an internal note…"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {noteError ? <p className="text-xs text-destructive">{noteError}</p> : null}
                    <div className="flex justify-end">
                      <Button size="sm" onClick={submitNote} disabled={savingNote || !noteBody.trim()} aria-busy={savingNote}>
                        {savingNote ? 'Saving…' : 'Add note'}
                      </Button>
                    </div>
                  </div>
                ) : null}
                {detail.notes.length === 0 ? (
                  <Empty>No notes yet.</Empty>
                ) : (
                  <ul className="space-y-2">
                    {detail.notes.map((n) => (
                      <li key={n.id} className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                        <p className="whitespace-pre-wrap">{n.body}</p>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {n.authorName ? `${n.authorName} · ` : ''}
                          {formatRelative(new Date(n.createdISO))}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-lg font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

function BookingItem({ b, timeZone }: { b: CustomerDetail['past'][number]; timeZone: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: b.serviceColor ?? 'hsl(var(--primary))' }} />
        <div className="min-w-0">
          <p className="truncate font-medium">{b.serviceName}</p>
          <p className="text-xs text-muted-foreground">
            {formatDay(new Date(b.startISO), timeZone)} · {formatTime(new Date(b.startISO), timeZone)}
            {b.employeeName ? ` · ${b.employeeName}` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={b.status} />
        <span className="text-xs text-muted-foreground">{formatMoney(b.priceTotal, b.currency)}</span>
      </div>
    </li>
  );
}
