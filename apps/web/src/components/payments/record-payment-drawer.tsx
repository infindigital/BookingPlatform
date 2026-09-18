'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { PAYMENT_METHODS, formatMoney } from '@booking/core';
import type { PaymentListRow } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { recordPaymentAction, refundPaymentAction } from '@/server/payments/actions';

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export type PaymentDrawerMode = 'charge' | 'refund';

export function RecordPaymentDrawer({
  mode,
  row,
  methods,
  open,
  onOpenChange,
  onDone,
}: {
  mode: PaymentDrawerMode;
  row: PaymentListRow | null;
  methods: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const isRefund = mode === 'refund';
  // Default a charge to the outstanding balance; a refund to the net collected.
  const suggested = row ? (isRefund ? row.amountPaid : row.balance) : 0;
  const max = row ? (isRefund ? row.amountPaid : Number.POSITIVE_INFINITY) : 0;

  const [amount, setAmount] = useState<string>(suggested > 0 ? String(suggested) : '');
  const [method, setMethod] = useState<string>(methods[0] ?? 'cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const methodOptions = PAYMENT_METHODS.filter((m) => methods.length === 0 || methods.includes(m.key));

  function submit() {
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (isRefund && value > max + 0.0001) {
      setError(`You can refund at most ${formatMoney(max, row!.currency)}.`);
      return;
    }
    start(async () => {
      const input = {
        paymentId: row!.id,
        amount: value,
        method: method || null,
        reference: reference.trim() || null,
        note: note.trim() || null,
      };
      const res = isRefund ? await refundPaymentAction(input) : await recordPaymentAction(input);
      if (res.ok) onDone();
      else setError(res.error ?? 'Could not save.');
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[30rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <div>
            <SheetTitle className="text-base font-semibold">{isRefund ? 'Record a refund' : 'Record a payment'}</SheetTitle>
            {row ? (
              <p className="text-xs text-muted-foreground">
                {row.customerName} · {row.serviceName} · <span className="font-mono">{row.reference}</span>
              </p>
            ) : null}
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        {row ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-center">
              <Figure label="Required" value={formatMoney(row.amount, row.currency)} />
              <Figure label="Paid" value={formatMoney(row.amountPaid, row.currency)} />
              <Figure label="Balance" value={formatMoney(row.balance, row.currency)} />
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Amount ({row.currency})</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={CONTROL}
                autoFocus
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Method</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={CONTROL}>
                {methodOptions.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Reference (optional)</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Receipt no., transfer id…"
                className={CONTROL}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Note (optional)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={CONTROL} />
            </label>

            {error ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
          <SheetClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </SheetClose>
          <Button type="button" variant={isRefund ? 'destructive' : 'primary'} onClick={submit} disabled={pending} aria-busy={pending}>
            {pending ? 'Saving…' : isRefund ? 'Record refund' : 'Record payment'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
