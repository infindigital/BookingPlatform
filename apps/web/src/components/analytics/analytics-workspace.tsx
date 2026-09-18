'use client';

import { useState, useTransition } from 'react';
import { CalendarCheck, Wallet, Banknote, CheckCircle2, UserPlus } from 'lucide-react';
import { formatMoney, formatPercent, addDays, type AnalyticsGranularity } from '@booking/core';
import type { AnalyticsResult, AnalyticsBreakdownItem } from '@booking/db';
import { TimeSeriesChart, BarList, StatusBar, type StatusSegment } from './charts';
import { loadAnalytics } from '@/server/analytics/actions';

type Metric = 'bookings' | 'bookedRevenue' | 'collectedRevenue';

const PRESETS: { key: string; label: string; days: number }[] = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: '12m', label: '12 months', days: 365 },
];

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-500',
  ACCEPTED: 'bg-sky-500',
  PENDING: 'bg-amber-500',
  RESCHEDULED: 'bg-violet-500',
  NO_SHOW: 'bg-orange-500',
  CANCELLED: 'bg-rose-500',
  REJECTED: 'bg-zinc-400',
};

const GRANULARITY_NOTE: Record<AnalyticsGranularity, string> = {
  day: 'by day',
  week: 'by week',
  month: 'by month',
};

export function AnalyticsWorkspace({
  initial,
  currency,
  today,
}: {
  initial: AnalyticsResult;
  currency: string;
  today: string;
}) {
  const [data, setData] = useState<AnalyticsResult>(initial);
  const [preset, setPreset] = useState<string>('30d');
  const [from, setFrom] = useState(initial.fromDayKey);
  const [to, setTo] = useState(initial.toDayKey);
  const [metric, setMetric] = useState<Metric>('bookings');
  const [pending, start] = useTransition();

  function apply(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    start(async () => {
      setData(await loadAnalytics({ fromDayKey: nextFrom, toDayKey: nextTo }));
    });
  }

  function pickPreset(p: { key: string; days: number }) {
    setPreset(p.key);
    apply(addDays(today, -(p.days - 1)), today);
  }

  const money = (v: number) => formatMoney(v, currency);
  const { summary, series, byStatus, topServices, topEmployees, bySource } = data;

  const metricValues = series.map((p) => p[metric]);
  const metricFormat = metric === 'bookings' ? (v: number) => String(Math.round(v)) : money;

  const statusSegments: StatusSegment[] = byStatus
    .filter((s) => s.count > 0)
    .map((s) => ({ key: s.status, label: s.label, count: s.count, className: STATUS_COLORS[s.status] ?? 'bg-zinc-400' }));

  const toBar = (items: AnalyticsBreakdownItem[]) =>
    items.map((i) => ({ key: i.key, label: i.label, value: i.count, sub: i.revenue > 0 ? money(i.revenue) : undefined }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bookings, revenue and mix over time - {data.fromDayKey} → {data.toDayKey} ({GRANULARITY_NOTE[data.granularity]}).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => pickPreset(p)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  preset === p.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => { setPreset('custom'); apply(e.target.value, to); }}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">-</span>
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => { setPreset('custom'); apply(from, e.target.value); }}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="To date"
            />
          </div>
        </div>
      </header>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard icon={<CalendarCheck className="size-4" />} label="Bookings" value={String(summary.bookings)} sub={`${summary.uniqueCustomers} customers`} />
        <SummaryCard icon={<Wallet className="size-4" />} label="Booked revenue" value={money(summary.bookedRevenue)} sub="confirmed + completed" />
        <SummaryCard icon={<Banknote className="size-4" />} label="Collected" value={money(summary.collectedRevenue)} sub="net payments" />
        <SummaryCard icon={<CheckCircle2 className="size-4" />} label="Completion" value={formatPercent(summary.completionRate)} sub={`${summary.completed} done · ${summary.noShow} no-show`} />
        <SummaryCard icon={<UserPlus className="size-4" />} label="New customers" value={String(summary.newCustomers)} sub="first seen in range" />
      </div>

      {/* Time series */}
      <section className="rounded-none border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Over time</h2>
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            {(
              [
                ['bookings', 'Bookings'],
                ['bookedRevenue', 'Booked'],
                ['collectedRevenue', 'Collected'],
              ] as [Metric, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  metric === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className={pending ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          <TimeSeriesChart labels={series.map((p) => p.label)} values={metricValues} format={metricFormat} />
        </div>
      </section>

      {/* Status mix */}
      <section className="rounded-none border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Booking status mix</h2>
        <StatusBar segments={statusSegments} />
      </section>

      {/* Breakdowns */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Top services">
          <BarList items={toBar(topServices)} />
        </Panel>
        <Panel title="Top staff">
          <BarList items={toBar(topEmployees)} />
        </Panel>
        <Panel title="Booking sources">
          <BarList items={toBar(bySource)} />
        </Panel>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-foreground">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-none border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
