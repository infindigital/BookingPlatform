'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Mail, Phone, Pencil, Scissors, CalendarClock, CalendarOff,
  Trash2, Plus, Copy, CheckCircle2, Briefcase,
} from 'lucide-react';
import { WEEKDAYS } from '@booking/core';
import type { EmployeeDetail, EmployeeServiceOption } from '@booking/db';
import { Button } from '@booking/ui/button';
import { formatMoney, formatDay, initials } from '@/components/dashboard/format';
import {
  setEmployeeServicesAction,
  saveEmployeeHoursAction,
  addEmployeeDayOffAction,
  removeEmployeeTimeOffAction,
} from '@/server/employees/actions';
import { EmployeeFormDrawer } from './employee-form-drawer';
import type { EmployeeEditSeed } from './employee-detail-drawer';

const CONTROL =
  'h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function EmployeeDetailPage({
  detail: initial,
  timeZone,
  canWrite,
}: {
  detail: EmployeeDetail;
  timeZone: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => setDetail(initial), [initial]);
  const reload = useCallback(() => router.refresh(), [router]);

  const seed: EmployeeEditSeed = {
    id: detail.id,
    firstName: detail.firstName,
    lastName: detail.lastName,
    email: detail.email ?? '',
    phone: detail.phone ?? '',
    title: detail.title ?? '',
    isActive: detail.isActive,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/admin/employees"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All team members
      </Link>

      {/* Hero header */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-7">
        <span className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xl font-bold text-white shadow-lg ring-1 ring-white/20">
              {initials(detail.name)}
            </span>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
                {detail.name}
                {detail.isActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" /> Active
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Inactive</span>
                )}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{detail.title ?? 'Team member'}</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {detail.email ? (
                  <a href={`mailto:${detail.email}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <Mail className="size-4" /> {detail.email}
                  </a>
                ) : null}
                {detail.phone ? (
                  <a href={`tel:${detail.phone}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                    <Phone className="size-4" /> {detail.phone}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          {canWrite ? (
            <Button variant="outline" onClick={() => setEditOpen(true)} className="shrink-0 gap-2 rounded-full">
              <Pencil className="size-4" /> Edit profile
            </Button>
          ) : null}
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-3">
          <Stat label="Upcoming" value={detail.stats.upcomingCount} tone="from-indigo-500 to-violet-500" />
          <Stat label="Completed" value={detail.stats.completedCount} tone="from-emerald-400 to-teal-500" />
          <Stat label="Total bookings" value={detail.stats.totalBookings} tone="from-sky-400 to-cyan-500" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HoursEditor detail={detail} canWrite={canWrite} onSaved={reload} />
        <div className="space-y-6">
          <ServicesEditor detail={detail} canWrite={canWrite} onSaved={reload} />
          <DaysOffEditor detail={detail} canWrite={canWrite} timeZone={timeZone} onSaved={reload} />
        </div>
      </div>

      <EmployeeFormDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        seed={seed}
        onSaved={() => {
          setEditOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3.5">
      <div className={`mb-2 h-1 w-8 rounded-full bg-gradient-to-r ${tone}`} />
      <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Card({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md ring-1 ring-white/20">
            {icon}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

/* --------------------------------- Services -------------------------------- */

interface ServiceDraft {
  assigned: boolean;
  priceOverride: string;
}

function ServicesEditor({ detail, canWrite, onSaved }: { detail: EmployeeDetail; canWrite: boolean; onSaved: () => void }) {
  const build = () => {
    const map: Record<string, ServiceDraft> = {};
    for (const s of detail.services) map[s.serviceId] = { assigned: s.assigned, priceOverride: s.priceOverride === null ? '' : String(s.priceOverride) };
    return map;
  };
  const [draft, setDraft] = useState<Record<string, ServiceDraft>>(build);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setDraft(build());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const dirty = detail.services.some((s) => {
    const d = draft[s.serviceId];
    if (!d) return false;
    if (d.assigned !== s.assigned) return true;
    const base = s.priceOverride === null ? '' : String(s.priceOverride);
    return d.assigned && d.priceOverride.trim() !== base;
  });
  const assignedCount = detail.services.filter((s) => draft[s.serviceId]?.assigned).length;

  function save() {
    setError(null);
    const services = detail.services
      .filter((s) => draft[s.serviceId]?.assigned)
      .map((s) => {
        const raw = draft[s.serviceId]!.priceOverride.trim();
        return { serviceId: s.serviceId, priceOverride: raw === '' ? null : Number(raw) };
      });
    start(async () => {
      const res = await setEmployeeServicesAction({ employeeId: detail.id, services });
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save services.');
    });
  }

  return (
    <Card
      icon={<Scissors className="size-4" />}
      title={`Services (${assignedCount})`}
      action={canWrite && dirty ? <Button size="sm" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button> : null}
    >
      {detail.services.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No services in the catalog yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {detail.services.map((s) => (
            <ServiceRow
              key={s.serviceId}
              s={s}
              draft={draft[s.serviceId]!}
              canWrite={canWrite}
              onToggle={(v) => setDraft((p) => ({ ...p, [s.serviceId]: { ...p[s.serviceId]!, assigned: v } }))}
              onPrice={(v) => setDraft((p) => ({ ...p, [s.serviceId]: { ...p[s.serviceId]!, priceOverride: v } }))}
            />
          ))}
        </ul>
      )}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Card>
  );
}

function ServiceRow({
  s, draft, canWrite, onToggle, onPrice,
}: {
  s: EmployeeServiceOption;
  draft: ServiceDraft;
  canWrite: boolean;
  onToggle: (v: boolean) => void;
  onPrice: (v: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5">
      <input
        type="checkbox"
        checked={draft.assigned}
        disabled={!canWrite}
        onChange={(e) => onToggle(e.target.checked)}
        className="size-4 shrink-0 rounded border-border accent-primary"
        aria-label={`Offer ${s.name}`}
      />
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color ?? 'hsl(var(--primary))' }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{s.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {s.categoryName ? `${s.categoryName} · ` : ''}
          {formatMoney(s.basePrice, s.currency)} · {s.durationMinutes}m
        </p>
      </div>
      {draft.assigned ? (
        <input
          type="number"
          min={0}
          step="0.01"
          disabled={!canWrite}
          value={draft.priceOverride}
          onChange={(e) => onPrice(e.target.value)}
          placeholder={String(s.basePrice)}
          className={`${CONTROL} w-24`}
          aria-label={`Price override for ${s.name}`}
        />
      ) : null}
    </li>
  );
}

/* ------------------------------- Working hours ----------------------------- */

interface PeriodDraft { startTime: string; endTime: string }
interface DayDraft { enabled: boolean; periods: PeriodDraft[] }

const NEW_PERIOD: PeriodDraft = { startTime: '09:00', endTime: '17:00' };

function HoursEditor({ detail, canWrite, onSaved }: { detail: EmployeeDetail; canWrite: boolean; onSaved: () => void }) {
  const build = (): DayDraft[] =>
    WEEKDAYS.map((d) => {
      const rows = detail.schedule.filter((s) => s.dayOfWeek === d.value);
      return rows.length
        ? { enabled: true, periods: rows.map((r) => ({ startTime: r.startTime, endTime: r.endTime })) }
        : { enabled: false, periods: [{ ...NEW_PERIOD }] };
    });
  const [days, setDays] = useState<DayDraft[]>(build);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setDays(build());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const patchDay = (i: number, next: Partial<DayDraft>) => setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...next } : d)));
  const patchPeriod = (i: number, p: number, next: Partial<PeriodDraft>) =>
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, periods: d.periods.map((pp, pi) => (pi === p ? { ...pp, ...next } : pp)) } : d)));
  const addPeriod = (i: number) => setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, periods: [...d.periods, { ...NEW_PERIOD }] } : d)));
  const removePeriod = (i: number, p: number) => setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, periods: d.periods.filter((_, pi) => pi !== p) } : d)));
  const applyToAll = (i: number) =>
    setDays((prev) => {
      const src = prev[i]!;
      const clone = (): PeriodDraft[] => src.periods.map((pp) => ({ startTime: pp.startTime, endTime: pp.endTime }));
      return prev.map((d) => ({ enabled: src.enabled, periods: clone() }));
    });

  function save() {
    setError(null);
    const windows = days.flatMap((d, i) =>
      d.enabled
        ? d.periods.map((p) => ({ dayOfWeek: WEEKDAYS[i]!.value, startTime: p.startTime, endTime: p.endTime, breaks: [] }))
        : [],
    );
    start(async () => {
      const res = await saveEmployeeHoursAction({ employeeId: detail.id, windows });
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save working hours.');
    });
  }

  return (
    <Card
      icon={<CalendarClock className="size-4" />}
      title="Working hours"
      action={canWrite ? <Button size="sm" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save hours'}</Button> : null}
    >
      <p className="mb-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Add one or more time blocks per day. Any gap between blocks is treated as a break automatically, so
        customers can only book inside the hours you list here.
      </p>
      <ul className="space-y-2">
        {days.map((d, i) => (
          <li key={WEEKDAYS[i]!.value} className={`rounded-xl border p-3 transition-colors ${d.enabled ? 'border-border bg-background' : 'border-dashed border-border bg-muted/20'}`}>
            <div className="flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  disabled={!canWrite}
                  onChange={(e) => patchDay(i, { enabled: e.target.checked })}
                  className="size-4 rounded border-border accent-primary"
                />
                <span className="text-sm font-semibold">{WEEKDAYS[i]!.label}</span>
              </label>
              {d.enabled && canWrite ? (
                <button type="button" onClick={() => applyToAll(i)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground" title="Copy this day to every day">
                  <Copy className="size-3.5" /> Apply to all
                </button>
              ) : (
                !d.enabled ? <span className="text-xs text-muted-foreground">Day off</span> : null
              )}
            </div>

            {d.enabled ? (
              <div className="mt-2.5 space-y-2">
                {d.periods.map((p, pi) => (
                  <div key={pi} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-card p-2.5 text-sm">
                    <input type="time" disabled={!canWrite} value={p.startTime} onChange={(e) => patchPeriod(i, pi, { startTime: e.target.value })} className={`${CONTROL} w-28`} />
                    <span className="text-muted-foreground">-</span>
                    <input type="time" disabled={!canWrite} value={p.endTime} onChange={(e) => patchPeriod(i, pi, { endTime: e.target.value })} className={`${CONTROL} w-28`} />
                    {canWrite && d.periods.length > 1 ? (
                      <button type="button" onClick={() => removePeriod(i, pi)} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Remove period">
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
                {canWrite ? (
                  <button type="button" onClick={() => addPeriod(i)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground">
                    <Plus className="size-3.5" /> Add another block
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Card>
  );
}

/* --------------------------------- Days off -------------------------------- */

function DaysOffEditor({
  detail, canWrite, timeZone, onSaved,
}: {
  detail: EmployeeDetail;
  canWrite: boolean;
  timeZone: string;
  onSaved: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openAdd() {
    const today = new Date().toISOString().slice(0, 10);
    setStartDate(today);
    setEndDate(today);
    setName('');
    setError(null);
    setAdding(true);
  }

  function submit() {
    setError(null);
    if (!startDate || !endDate) {
      setError('Pick a start and end date.');
      return;
    }
    start(async () => {
      const res = await addEmployeeDayOffAction({ employeeId: detail.id, startDate, endDate, name: name || null });
      if (res.ok) {
        setAdding(false);
        onSaved();
      } else {
        setError(res.error ?? 'Could not add the day off.');
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await removeEmployeeTimeOffAction({ employeeId: detail.id, timeOffId: id });
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not remove the day off.');
    });
  }

  const rangeLabel = (startISO: string, endISO: string): string => {
    const startDay = formatDay(new Date(startISO), timeZone);
    // endISO is the exclusive next-midnight; the last off day is one day earlier.
    const inclusiveEnd = new Date(new Date(endISO).getTime() - 12 * 60 * 60 * 1000);
    const endDay = formatDay(inclusiveEnd, timeZone);
    return startDay === endDay ? startDay : `${startDay} - ${endDay}`;
  };

  return (
    <Card
      icon={<CalendarOff className="size-4" />}
      title={`Days off (${detail.timeOff.length})`}
      action={canWrite && !adding ? <Button size="sm" variant="outline" onClick={openAdd}><Plus className="size-4" /> Add</Button> : null}
    >
      {adding ? (
        <div className="mb-3 space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Start date</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${CONTROL} w-full`} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">End date</span>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={`${CONTROL} w-full`} />
            </label>
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Vacation, Holiday) - optional" className={`${CONTROL} w-full`} />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={pending}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={pending}>{pending ? 'Adding…' : 'Add day off'}</Button>
          </div>
        </div>
      ) : null}

      {detail.timeOff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No days off scheduled.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {detail.timeOff.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-2.5 text-sm">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Briefcase className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.reason ?? 'Day off'}</p>
                  <p className="truncate text-xs text-muted-foreground">{rangeLabel(t.startISO, t.endISO)}</p>
                </div>
              </div>
              {canWrite ? (
                <button type="button" onClick={() => remove(t.id)} disabled={pending} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove day off">
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error && !adding ? <ErrorNote>{error}</ErrorNote> : null}
    </Card>
  );
}
