'use client';

import { useState, useTransition, useCallback } from 'react';
import { CreditCard, Settings2, Search, Plus, RotateCcw, Wallet, TrendingUp, Undo2 } from 'lucide-react';
import {
  formatMoney,
  PAYMENT_STATUS_LABELS,
  type PaymentSettings,
  type PaymentStatus,
} from '@booking/core';
import type { PaymentListRow, PaymentsListResult } from '@booking/db';
import { Badge } from '@booking/ui/badge';
import { Button } from '@booking/ui/button';
import { RecordPaymentDrawer, type PaymentDrawerMode } from './record-payment-drawer';
import { PaymentSettingsForm } from './payment-settings-form';
import { loadPayments } from '@/server/payments/actions';

type Tab = 'payments' | 'settings';

const STATUS_TONE: Record<PaymentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  UNPAID: 'neutral',
  PENDING: 'info',
  REFUNDED: 'info',
  FAILED: 'danger',
};

const STATUS_FILTERS: (PaymentStatus | 'all')[] = ['all', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'];

export function PaymentsWorkspace({
  initial,
  settings,
  currency,
  timeZone,
}: {
  initial: PaymentsListResult;
  settings: PaymentSettings;
  currency: string;
  timeZone: string;
}) {
  const [tab, setTab] = useState<Tab>('payments');
  const [data, setData] = useState<PaymentsListResult>(initial);
  const [status, setStatus] = useState<PaymentStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<{ mode: PaymentDrawerMode; row: PaymentListRow } | null>(null);
  const [pending, start] = useTransition();

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });

  const reload = useCallback(
    (next?: { status?: PaymentStatus | 'all'; search?: string }) => {
      const s = next?.status ?? status;
      const q = next?.search ?? search;
      start(async () => {
        const res = await loadPayments({ status: s, search: q, pageSize: 25 });
        setData(res);
      });
    },
    [status, search],
  );

  function pickStatus(s: PaymentStatus | 'all') {
    setStatus(s);
    reload({ status: s });
  }

  const { summary, rows, statusCounts } = data;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track deposits and balances, record offline payments, and set your payment policy.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'payments'} onClick={() => setTab('payments')} icon={<CreditCard className="size-4" />}>
          Payments
        </TabButton>
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={<Settings2 className="size-4" />}>
          Settings
        </TabButton>
      </div>

      {tab === 'settings' ? (
        <PaymentSettingsForm settings={settings} currency={currency} onSaved={() => reload()} />
      ) : (
        <>
          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard icon={<Wallet className="size-4" />} label="Collected" value={formatMoney(summary.collected, currency)} tone="success" />
            <SummaryCard icon={<TrendingUp className="size-4" />} label="Outstanding" value={formatMoney(summary.outstanding, currency)} tone="warning" />
            <SummaryCard icon={<Undo2 className="size-4" />} label="Refunded" value={formatMoney(summary.refunded, currency)} tone="muted" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => pickStatus(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    status === s ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  {s === 'all' ? 'All' : PAYMENT_STATUS_LABELS[s]}
                  <span className="ml-1.5 tabular-nums opacity-70">{statusCounts[s] ?? 0}</span>
                </button>
              ))}
            </div>
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                reload();
              }}
            >
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer or service…"
                className="h-9 w-64 max-w-[70vw] rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </form>
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
              <CreditCard className="mx-auto mb-3 size-8 text-muted-foreground opacity-60" />
              <p className="font-medium">No payments yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                When a booking requires a deposit or payment, it appears here. Set your policy in the Settings tab.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <Th>Customer</Th>
                    <Th>Service</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Required</Th>
                    <Th className="text-right">Paid</Th>
                    <Th className="text-right">Balance</Th>
                    <Th>Booked</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{r.customerName}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{r.reference}</div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.serviceName}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={STATUS_TONE[r.status]}>{PAYMENT_STATUS_LABELS[r.status]}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.amount, r.currency)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(r.amountPaid, r.currency)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatMoney(r.balance, r.currency)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.startISO ? dateFmt.format(new Date(r.startISO)) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDrawer({ mode: 'charge', row: r })} disabled={r.balance <= 0}>
                            <Plus /> Record
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDrawer({ mode: 'refund', row: r })} disabled={r.amountPaid <= 0}>
                            <RotateCcw /> Refund
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pending ? <p className="text-xs text-muted-foreground">Updating…</p> : null}
        </>
      )}

      <RecordPaymentDrawer
        key={drawer ? `${drawer.mode}:${drawer.row.id}` : 'none'}
        mode={drawer?.mode ?? 'charge'}
        row={drawer?.row ?? null}
        methods={settings.methods}
        open={!!drawer}
        onOpenChange={(o) => {
          if (!o) setDrawer(null);
        }}
        onDone={() => {
          setDrawer(null);
          reload();
        }}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'muted';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
        : 'text-muted-foreground bg-muted';
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className={`flex size-8 items-center justify-center rounded-lg ${toneClass}`}>{icon}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
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

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}
