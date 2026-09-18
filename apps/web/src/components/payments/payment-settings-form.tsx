'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { PAYMENT_METHODS, type PaymentSettings, type PaymentMode, type DepositType } from '@booking/core';
import { Button } from '@booking/ui/button';
import { savePaymentSettingsAction } from '@/server/payments/actions';

const CONTROL =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const MODE_COPY: Record<PaymentMode, { title: string; desc: string }> = {
  NONE: { title: 'No payment', desc: 'Bookings are made without collecting anything up front.' },
  DEPOSIT: { title: 'Deposit', desc: 'Collect part of the price to secure the booking.' },
  FULL: { title: 'Full payment', desc: 'Collect the full service price at booking time.' },
};

export function PaymentSettingsForm({
  settings,
  currency,
  onSaved,
}: {
  settings: PaymentSettings;
  currency: string;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<PaymentMode>(settings.mode);
  const [depositType, setDepositType] = useState<DepositType>(settings.depositType);
  const [depositValue, setDepositValue] = useState<string>(String(settings.depositValue ?? 0));
  const [methods, setMethods] = useState<string[]>(settings.methods);
  const [instructions, setInstructions] = useState(settings.instructions ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function toggleMethod(key: string) {
    setMethods((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));
  }

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await savePaymentSettingsAction({
        mode,
        depositType,
        depositValue: Number(depositValue) || 0,
        currency,
        instructions: instructions.trim() || null,
        methods,
      });
      if (res.ok) {
        setSaved(true);
        onSaved();
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(res.error ?? 'Could not save.');
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Payment policy</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(MODE_COPY) as PaymentMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-none border p-3 text-left transition-colors ${
                mode === m ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:bg-muted/40'
              }`}
            >
              <span className="block text-sm font-medium">{MODE_COPY[m].title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{MODE_COPY[m].desc}</span>
            </button>
          ))}
        </div>
      </section>

      {mode === 'DEPOSIT' ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Deposit amount</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Type</span>
              <select value={depositType} onChange={(e) => setDepositType(e.target.value as DepositType)} className={CONTROL}>
                <option value="PERCENT">Percentage of price</option>
                <option value="FIXED">Fixed amount</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {depositType === 'PERCENT' ? 'Percent (0-100)' : `Amount (${currency})`}
              </span>
              <input
                value={depositValue}
                onChange={(e) => setDepositValue(e.target.value)}
                inputMode="decimal"
                className={`${CONTROL} w-40`}
                placeholder={depositType === 'PERCENT' ? '25' : '20.00'}
              />
            </label>
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Accepted methods</h2>
        <p className="text-xs text-muted-foreground">Which offline methods staff can record against a booking.</p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => {
            const on = methods.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleMethod(m.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {on ? <Check className="size-3.5" /> : null}
                {m.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Payment instructions</h2>
        <p className="text-xs text-muted-foreground">Shown to customers who owe a balance (e.g. how to pay a deposit).</p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          className={CONTROL}
          placeholder="e.g. Pay your deposit by bank transfer to… or in person at your appointment."
        />
      </section>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending} aria-busy={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </Button>
        {saved ? (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <Check className="size-4" /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
