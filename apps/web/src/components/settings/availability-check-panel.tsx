'use client';

import { useState, useTransition } from 'react';
import { Activity, Clock, CalendarSearch, Users, AlertCircle } from 'lucide-react';
import { Button } from '@booking/ui/button';
import {
  runAvailabilityDiagnostic,
  type AvailabilityDiagnostic,
} from '@/server/settings/availability-diagnostic';

function ruleLabel(minutes: number): string {
  if (minutes <= 0) return 'none';
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export function AvailabilityCheckPanel() {
  const [data, setData] = useState<AvailabilityDiagnostic | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      setData(await runAvailabilityDiagnostic());
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md">
            <CalendarSearch className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Availability check</h3>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              See exactly what the customer booking form calculates: the current time, office hours, each service&apos;s
              rules, every team member&apos;s working hours, and how many slots open on each of the next 14 days. Nothing
              here changes your data.
            </p>
          </div>
        </div>
        <Button onClick={run} disabled={pending} className="shrink-0 gap-2">
          <Activity className="size-4" /> {pending ? 'Checking…' : 'Run check'}
        </Button>
      </div>

      {data && !data.ok ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4" /> {data.error}
        </p>
      ) : null}

      {data?.ok ? (
        <div className="space-y-5">
          {/* Context strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="App time now" value={data.now ?? '-'} hint={data.timeZone ?? ''} tone="from-sky-400 to-cyan-500" />
            <Tile label="Minimum lead time" value={ruleLabel(data.minLeadMinutes ?? 0)} hint="before an appointment" tone="from-amber-400 to-orange-500" />
            <Tile label="Timezone" value={data.timeZone ?? '-'} hint="all times shown in this zone" tone="from-violet-500 to-fuchsia-500" />
          </div>

          {/* Office hours */}
          <Section icon={<Clock className="size-4" />} title="Office (opening) hours">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {(data.office ?? []).map((d) => (
                <div key={d.day} className={`rounded-lg border p-2.5 text-center ${d.isClosed ? 'border-dashed border-border bg-muted/30 text-muted-foreground' : 'border-border bg-background'}`}>
                  <p className="text-xs font-semibold">{d.day.slice(0, 3)}</p>
                  <p className="mt-1 text-xs tabular-nums">{d.isClosed ? 'Closed' : `${d.open}-${d.close}`}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Employees */}
          <Section icon={<Users className="size-4" />} title="Team members & working hours">
            <ul className="space-y-3">
              {(data.employees ?? []).map((e) => (
                <li key={e.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{e.name}</span>
                    {!e.isActive ? <Badge tone="muted">Inactive</Badge> : null}
                    <span className="text-xs text-muted-foreground">
                      · offers: {e.serviceNames.length ? e.serviceNames.join(', ') : 'no services assigned'}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    {e.week.map((w) => (
                      <div key={w.day} className={`rounded-lg border p-2 text-center ${w.blocks.length ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30 text-muted-foreground'}`}>
                        <p className="text-xs font-semibold">{w.day}</p>
                        {w.blocks.length ? (
                          w.blocks.map((b, i) => <p key={i} className="mt-0.5 text-[11px] tabular-nums">{b}</p>)
                        ) : (
                          <p className="mt-0.5 text-[11px]">off</p>
                        )}
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          {/* Services + 14-day availability */}
          <Section icon={<CalendarSearch className="size-4" />} title="Services & the next 14 days">
            <ul className="space-y-3">
              {(data.services ?? []).map((s) => (
                <li key={s.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{s.name}</span>
                    {!s.isActive ? <Badge tone="muted">Inactive</Badge> : null}
                    <Badge tone={s.totalSlots > 0 ? 'ok' : 'warn'}>{s.totalSlots} slots / 14 days</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.durationMinutes}m duration · buffers {ruleLabel(s.bufferBeforeMinutes)}/{ruleLabel(s.bufferAfterMinutes)} ·
                    min notice {ruleLabel(s.minAdvanceMinutes)} · step {s.slotIntervalMinutes ? `${s.slotIntervalMinutes}m` : 'default'} ·
                    {' '}{s.employeeCount} staff{s.maxAdvanceDays ? ` · books up to ${s.maxAdvanceDays}d ahead` : ''}
                  </p>
                  {s.employeeCount === 0 ? (
                    <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                      No team member offers this service, so it can never show slots. Assign staff on the employee page.
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.days.map((d) => (
                      <div
                        key={d.dayKey}
                        title={d.count ? `${d.weekday} ${d.dayKey}: ${d.count} slots (${d.first}-${d.last})` : `${d.weekday} ${d.dayKey}: no slots`}
                        className={`flex min-w-[3.1rem] flex-col items-center rounded-md border px-1.5 py-1 text-center ${
                          d.count > 0 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border bg-muted/30 text-muted-foreground'
                        }`}
                      >
                        <span className="text-[10px] font-medium uppercase opacity-80">{d.weekday}</span>
                        <span className="text-xs font-semibold tabular-nums">{d.dayKey.slice(8)}</span>
                        <span className="text-[10px] tabular-nums">{d.count ? `${d.count}` : '-'}</span>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      ) : null}
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className={`mb-2 h-1 w-8 rounded-full bg-gradient-to-r ${tone}`} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-bold tracking-tight">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2.5 text-sm font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'warn' | 'muted' }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'bg-muted text-muted-foreground';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
