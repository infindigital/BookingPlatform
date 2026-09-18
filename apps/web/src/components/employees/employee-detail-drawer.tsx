'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { X, Mail, Phone, Pencil, Scissors, CalendarClock, CalendarOff, Trash2, Plus } from 'lucide-react';
import { WEEKDAYS } from '@booking/core';
import type { EmployeeDetail, EmployeeServiceOption } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { formatMoney, formatDay, formatTime, initials } from '@/components/dashboard/format';
import {
  loadEmployeeDetail,
  setEmployeeServicesAction,
  saveEmployeeHoursAction,
  addEmployeeTimeOffAction,
  removeEmployeeTimeOffAction,
} from '@/server/employees/actions';

export interface EmployeeEditSeed {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  isActive: boolean;
}

const CONTROL =
  'h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function EmployeeDetailDrawer({
  employeeId,
  open,
  onOpenChange,
  timeZone,
  canWrite,
  onEdit,
}: {
  employeeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeZone: string;
  canWrite: boolean;
  onEdit: (seed: EmployeeEditSeed) => void;
}) {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!employeeId) return;
    setLoading(true);
    loadEmployeeDetail(employeeId)
      .then((d) => setDetail(d))
      .finally(() => setLoading(false));
  }, [employeeId]);

  useEffect(() => {
    if (open && employeeId) {
      setDetail(null);
      reload();
    }
  }, [open, employeeId, reload]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[34rem] max-w-[96vw] p-0">
        {loading && !detail ? (
          <div className="space-y-3 p-6">
            <div className="h-8 w-40 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded bg-muted" />
            <div className="h-40 animate-pulse rounded bg-muted" />
          </div>
        ) : !detail ? (
          <div className="p-6">
            <SheetTitle className="text-base font-semibold">Team member</SheetTitle>
            <p className="mt-2 text-sm text-muted-foreground">This team member could not be loaded.</p>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    detail.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {initials(detail.name)}
                </span>
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-2 truncate text-base font-semibold">
                    {detail.name}
                    {!detail.isActive ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Inactive</span>
                    ) : null}
                  </SheetTitle>
                  <p className="truncate text-xs text-muted-foreground">
                    {detail.title ?? 'Team member'}
                    {detail.hasLogin ? ' · has login' : ''}
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
                      onEdit({
                        id: detail.id,
                        firstName: detail.firstName,
                        lastName: detail.lastName,
                        email: detail.email ?? '',
                        phone: detail.phone ?? '',
                        title: detail.title ?? '',
                        isActive: detail.isActive,
                      })
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

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {/* Contact */}
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                {detail.email ? (
                  <a href={`mailto:${detail.email}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                    <Mail className="size-4 text-muted-foreground" /> {detail.email}
                  </a>
                ) : null}
                {detail.phone ? (
                  <a href={`tel:${detail.phone}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                    <Phone className="size-4 text-muted-foreground" /> {detail.phone}
                  </a>
                ) : null}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Upcoming" value={String(detail.stats.upcomingCount)} />
                <Stat label="Completed" value={String(detail.stats.completedCount)} />
                <Stat label="Total bookings" value={String(detail.stats.totalBookings)} />
              </div>

              <ServicesEditor detail={detail} canWrite={canWrite} onSaved={reload} />
              <HoursEditor detail={detail} canWrite={canWrite} onSaved={reload} />
              <TimeOffEditor detail={detail} canWrite={canWrite} timeZone={timeZone} onSaved={reload} />
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

function Section({
  icon,
  title,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {icon} {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

/* --------------------------------- Services -------------------------------- */

interface ServiceDraft {
  assigned: boolean;
  priceOverride: string; // empty string = use base price
}

function ServicesEditor({ detail, canWrite, onSaved }: { detail: EmployeeDetail; canWrite: boolean; onSaved: () => void }) {
  const initial = () => {
    const map: Record<string, ServiceDraft> = {};
    for (const s of detail.services) {
      map[s.serviceId] = { assigned: s.assigned, priceOverride: s.priceOverride === null ? '' : String(s.priceOverride) };
    }
    return map;
  };
  const [draft, setDraft] = useState<Record<string, ServiceDraft>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Re-sync when a reload brings fresh data.
  useEffect(() => {
    setDraft(initial());
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

  function toggle(serviceId: string, assigned: boolean) {
    setDraft((prev) => ({ ...prev, [serviceId]: { ...prev[serviceId]!, assigned } }));
  }
  function setPrice(serviceId: string, priceOverride: string) {
    setDraft((prev) => ({ ...prev, [serviceId]: { ...prev[serviceId]!, priceOverride } }));
  }

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
    <Section
      icon={<Scissors className="size-4" />}
      title={`Services (${detail.services.filter((s) => draft[s.serviceId]?.assigned).length})`}
      action={
        canWrite && dirty ? (
          <Button size="sm" onClick={save} disabled={pending} aria-busy={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        ) : null
      }
    >
      {detail.services.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
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
              onToggle={(v) => toggle(s.serviceId, v)}
              onPrice={(v) => setPrice(s.serviceId, v)}
            />
          ))}
        </ul>
      )}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Section>
  );
}

function ServiceRow({
  s,
  draft,
  canWrite,
  onToggle,
  onPrice,
}: {
  s: EmployeeServiceOption;
  draft: ServiceDraft;
  canWrite: boolean;
  onToggle: (v: boolean) => void;
  onPrice: (v: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
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
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Price</span>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={!canWrite}
            value={draft.priceOverride}
            onChange={(e) => onPrice(e.target.value)}
            placeholder={String(s.basePrice)}
            className={`${CONTROL} w-24`}
          />
        </label>
      ) : null}
    </li>
  );
}

/* ------------------------------- Working hours ----------------------------- */

interface BreakDraft {
  startTime: string;
  endTime: string;
}
interface DayDraft {
  enabled: boolean;
  startTime: string;
  endTime: string;
  breaks: BreakDraft[];
}

function HoursEditor({ detail, canWrite, onSaved }: { detail: EmployeeDetail; canWrite: boolean; onSaved: () => void }) {
  const build = (): DayDraft[] =>
    WEEKDAYS.map((d) => {
      const row = detail.schedule.find((s) => s.dayOfWeek === d.value);
      return row
        ? { enabled: true, startTime: row.startTime, endTime: row.endTime, breaks: row.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })) }
        : { enabled: false, startTime: '09:00', endTime: '17:00', breaks: [] };
    });
  const [days, setDays] = useState<DayDraft[]>(build);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setDays(build());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  function patch(idx: number, next: Partial<DayDraft>) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...next } : d)));
  }
  function patchBreak(idx: number, bIdx: number, next: Partial<BreakDraft>) {
    setDays((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, breaks: d.breaks.map((b, j) => (j === bIdx ? { ...b, ...next } : b)) } : d)),
    );
  }
  function addBreak(idx: number) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, breaks: [...d.breaks, { startTime: '12:00', endTime: '13:00' }] } : d)));
  }
  function removeBreak(idx: number, bIdx: number) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, breaks: d.breaks.filter((_, j) => j !== bIdx) } : d)));
  }

  function save() {
    setError(null);
    const windows = days
      .map((d, i) => ({ day: d, dayOfWeek: WEEKDAYS[i]!.value }))
      .filter(({ day }) => day.enabled)
      .map(({ day, dayOfWeek }) => ({
        dayOfWeek,
        startTime: day.startTime,
        endTime: day.endTime,
        breaks: day.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime, label: null })),
      }));
    start(async () => {
      const res = await saveEmployeeHoursAction({ employeeId: detail.id, windows });
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save working hours.');
    });
  }

  return (
    <Section
      icon={<CalendarClock className="size-4" />}
      title="Working hours"
      action={
        canWrite ? (
          <Button size="sm" onClick={save} disabled={pending} aria-busy={pending}>
            {pending ? 'Saving…' : 'Save hours'}
          </Button>
        ) : null
      }
    >
      <ul className="space-y-1.5">
        {days.map((d, i) => (
          <li key={WEEKDAYS[i]!.value} className="rounded-lg border border-border bg-card p-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="flex w-24 shrink-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  disabled={!canWrite}
                  onChange={(e) => patch(i, { enabled: e.target.checked })}
                  className="size-4 rounded border-border accent-primary"
                />
                <span className="text-sm font-medium">{WEEKDAYS[i]!.short}</span>
              </label>
              {d.enabled ? (
                <div className="flex items-center gap-1.5 text-sm">
                  <input type="time" disabled={!canWrite} value={d.startTime} onChange={(e) => patch(i, { startTime: e.target.value })} className={`${CONTROL} w-28`} />
                  <span className="text-muted-foreground">-</span>
                  <input type="time" disabled={!canWrite} value={d.endTime} onChange={(e) => patch(i, { endTime: e.target.value })} className={`${CONTROL} w-28`} />
                  {canWrite ? (
                    <button type="button" onClick={() => addBreak(i)} className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground" title="Add a break">
                      <Plus className="size-3.5" /> Break
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Off</span>
              )}
            </div>
            {d.enabled && d.breaks.length > 0 ? (
              <ul className="mt-2 space-y-1.5 border-t border-border/60 pl-2 pt-2 sm:pl-24">
                {d.breaks.map((b, bIdx) => (
                  <li key={bIdx} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">Break</span>
                    <input type="time" disabled={!canWrite} value={b.startTime} onChange={(e) => patchBreak(i, bIdx, { startTime: e.target.value })} className={`${CONTROL} w-28`} />
                    <span className="text-muted-foreground">-</span>
                    <input type="time" disabled={!canWrite} value={b.endTime} onChange={(e) => patchBreak(i, bIdx, { endTime: e.target.value })} className={`${CONTROL} w-28`} />
                    {canWrite ? (
                      <button type="button" onClick={() => removeBreak(i, bIdx)} className="text-muted-foreground hover:text-destructive" aria-label="Remove break">
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Section>
  );
}

/* --------------------------------- Time off -------------------------------- */

function toLocalInput(iso: string): string {
  // Render an ISO instant as a value for <input type="datetime-local"> (local tz).
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TimeOffEditor({
  detail,
  canWrite,
  timeZone,
  onSaved,
}: {
  detail: EmployeeDetail;
  canWrite: boolean;
  timeZone: string;
  onSaved: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openAdd() {
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    setStartAt(toLocalInput(now.toISOString()));
    setEndAt(toLocalInput(later.toISOString()));
    setReason('');
    setError(null);
    setAdding(true);
  }

  function submit() {
    setError(null);
    if (!startAt || !endAt) {
      setError('Pick a start and end.');
      return;
    }
    const startISO = new Date(startAt).toISOString();
    const endISO = new Date(endAt).toISOString();
    start(async () => {
      const res = await addEmployeeTimeOffAction({ employeeId: detail.id, startAt: startISO, endAt: endISO, reason: reason || null });
      if (res.ok) {
        setAdding(false);
        onSaved();
      } else {
        setError(res.error ?? 'Could not add time off.');
      }
    });
  }

  function remove(timeOffId: string) {
    start(async () => {
      const res = await removeEmployeeTimeOffAction({ employeeId: detail.id, timeOffId });
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not remove time off.');
    });
  }

  return (
    <Section
      icon={<CalendarOff className="size-4" />}
      title={`Time off (${detail.timeOff.length})`}
      action={
        canWrite && !adding ? (
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus /> Add
          </Button>
        ) : null
      }
    >
      {adding ? (
        <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">From</span>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`${CONTROL} w-full`} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">To</span>
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={`${CONTROL} w-full`} />
            </label>
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className={`${CONTROL} w-full`} />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={pending} aria-busy={pending}>
              {pending ? 'Adding…' : 'Add time off'}
            </Button>
          </div>
        </div>
      ) : null}

      {detail.timeOff.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          No time off scheduled.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {detail.timeOff.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {formatDay(new Date(t.startISO), timeZone)} {formatTime(new Date(t.startISO), timeZone)} → {formatDay(new Date(t.endISO), timeZone)}{' '}
                  {formatTime(new Date(t.endISO), timeZone)}
                </p>
                {t.reason ? <p className="truncate text-xs text-muted-foreground">{t.reason}</p> : null}
              </div>
              {canWrite ? (
                <button type="button" onClick={() => remove(t.id)} disabled={pending} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remove time off">
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error && !adding ? <ErrorNote>{error}</ErrorNote> : null}
    </Section>
  );
}
