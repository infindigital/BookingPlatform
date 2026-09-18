'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, User, CalendarCheck } from 'lucide-react';
import type { PublicBookingData } from '@booking/db';
import {
  hasTeamStep,
  DEFAULT_FORM_SETTINGS,
  DEFAULT_STEPS,
  type FormSettings,
  type FormStepKey,
} from '@booking/core';
import { Button } from '@booking/ui/button';
import { submitPublicBooking, type PublicBookingResult } from '@/server/public/actions';
import { DateTimePicker, type SelectedSlot } from './datetime-picker';
import { DetailsForm, type CustomerDetails } from './details-form';
import { formatMoney, formatDuration, confirmationWhen } from './format';

type FlowStep = 'service' | 'team' | 'time' | 'details' | 'review';
const STEP_LABEL: Record<FlowStep, string> = {
  service: 'Service',
  team: 'Team',
  time: 'Time',
  details: 'Details',
  review: 'Review',
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function todayInTz(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

export function BookingWizard({
  data,
  slug,
  settings: settingsProp,
  steps: stepsProp,
  preview = false,
}: {
  data: PublicBookingData;
  slug: string;
  /** Overrides for live preview; falls back to the saved config on the public page. */
  settings?: FormSettings;
  steps?: FormStepKey[];
  preview?: boolean;
}) {
  const { business, categories, services, employees } = data;
  const timeZone = business.timezone;
  const todayKey = useMemo(() => todayInTz(timeZone), [timeZone]);

  const settings = settingsProp ?? data.form?.settings ?? DEFAULT_FORM_SETTINGS;
  const configuredSteps = stepsProp ?? data.form?.steps ?? DEFAULT_STEPS;
  const showTeamStep = hasTeamStep(configuredSteps);

  const flow = useMemo<FlowStep[]>(() => {
    const s: FlowStep[] = ['service'];
    if (showTeamStep) s.push('team');
    s.push('time', 'details', 'review');
    return s;
  }, [showTeamStep]);

  const [stepIdx, setStepIdx] = useState(0);
  const stepKey = flow[Math.min(stepIdx, flow.length - 1)] ?? 'service';

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null); // null = any available
  const [slot, setSlot] = useState<SelectedSlot | null>(null);
  const [details, setDetails] = useState<CustomerDetails>({ firstName: '', lastName: '', email: '', phone: '', notes: '' });

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PublicBookingResult | null>(null);
  const [previewDone, setPreviewDone] = useState(false);

  const service = useMemo(() => services.find((s) => s.id === serviceId) ?? null, [services, serviceId]);
  const eligibleStaff = useMemo(
    () => (serviceId ? employees.filter((e) => e.serviceIds.includes(serviceId)) : []),
    [employees, serviceId],
  );
  const chosenStaff = employeeId ? employees.find((e) => e.id === employeeId) ?? null : null;

  const servicesByCategory = useMemo(() => {
    const groups: { id: string | null; name: string; services: typeof services }[] = [];
    for (const cat of categories) {
      const list = services.filter((s) => s.categoryId === cat.id);
      if (list.length) groups.push({ id: cat.id, name: cat.name, services: list });
    }
    const uncategorised = services.filter((s) => !s.categoryId || !categories.some((c) => c.id === s.categoryId));
    if (uncategorised.length) groups.push({ id: null, name: 'Services', services: uncategorised });
    return groups;
  }, [categories, services]);

  function canContinue(): boolean {
    switch (stepKey) {
      case 'service':
        return !!serviceId;
      case 'team':
        return settings.allowAnyEmployee || employeeId !== null;
      case 'time':
        return !!slot;
      case 'details':
        return (
          details.firstName.trim().length > 0 &&
          EMAIL_RE.test(details.email.trim()) &&
          (!settings.requirePhone || details.phone.trim().length > 0)
        );
      default:
        return true;
    }
  }

  function pickService(id: string) {
    setServiceId(id);
    setEmployeeId(null);
    setSlot(null);
  }
  function pickStaff(id: string | null) {
    setEmployeeId(id);
    setSlot(null);
  }
  function next() {
    setError(null);
    if (stepIdx < flow.length - 1) setStepIdx((i) => i + 1);
  }
  function back() {
    setError(null);
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }

  function confirm() {
    if (!service || !slot) return;
    if (preview) {
      setPreviewDone(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitPublicBooking({
        slug,
        serviceId: service.id,
        employeeId,
        dayKey: slot.startISO.slice(0, 10),
        time: slot.time,
        firstName: details.firstName,
        lastName: details.lastName,
        email: details.email,
        phone: details.phone,
        notes: details.notes,
      });
      if (result.ok) {
        setConfirmation(result);
      } else {
        setError(result.error);
        if (/no longer available/i.test(result.error)) {
          setSlot(null);
          setStepIdx(flow.indexOf('time'));
        }
      }
    });
  }

  function reset() {
    setConfirmation(null);
    setPreviewDone(false);
    setServiceId(null);
    setEmployeeId(null);
    setSlot(null);
    setDetails({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
    setError(null);
    setStepIdx(0);
  }

  // ---- Confirmation screen (real or previewed) ----
  if (confirmation?.ok || previewDone) {
    const c = confirmation?.ok ? confirmation.confirmation : null;
    return (
      <div className="mx-auto max-w-xl rounded-none border border-border bg-card p-8 shadow-premium sm:p-10">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
          <CalendarCheck className="size-8" />
        </div>
        <h1 className="mt-5 text-center text-2xl font-bold tracking-tight">Request received</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Thanks, {details.firstName || 'there'}. Your appointment is{' '}
          <span className="font-medium text-foreground">pending confirmation</span>. {business.name} will review it shortly.
        </p>
        {settings.confirmationMessage ? (
          <p className="mt-2 text-center text-sm text-muted-foreground">{settings.confirmationMessage}</p>
        ) : null}

        <dl className="mt-6 space-y-3 rounded-none border border-border bg-muted/30 p-4 text-sm">
          {c ? <Row label="Reference" value={c.reference} mono /> : null}
          <Row label="Service" value={c?.serviceName ?? service?.name ?? ''} />
          {(c?.employeeName ?? chosenStaff?.name) ? <Row label="With" value={c?.employeeName ?? chosenStaff!.name} /> : null}
          {slot ? <Row label="When" value={confirmationWhen(c?.startISO ?? slot.startISO, timeZone)} /> : null}
          {settings.showPrices && service ? <Row label="Price" value={formatMoney(service.price, business.currency)} /> : null}
          {c && c.amountDue > 0 ? (
            <Row
              label={c.amountDue < c.price ? 'Deposit due' : 'Amount due'}
              value={formatMoney(c.amountDue, c.currency)}
            />
          ) : null}
        </dl>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" onClick={reset}>
            Book another appointment
          </Button>
          {!preview ? (
            <a
              href={`/book/${slug}/manage`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Manage your booking
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  // ---- Wizard ----
  const layout = settings.layout ?? 'classic';
  const stepTitle =
    stepKey === 'service'
      ? 'Choose a service'
      : stepKey === 'team'
        ? 'Choose your team member'
        : stepKey === 'time'
          ? 'Pick a date & time'
          : stepKey === 'details'
            ? 'Your details'
            : 'Review & confirm';

  const bodyCore = (
    <>
        {stepKey === 'service' && (
          <div className="space-y-5">
            {servicesByCategory.map((group) => (
              <div key={group.id ?? 'uncat'} className="space-y-2">
                {servicesByCategory.length > 1 ? (
                  <p className="text-xs font-semibold text-muted-foreground">{group.name}</p>
                ) : null}
                <div className="space-y-2">
                  {group.services.map((s) => {
                    const active = s.id === serviceId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickService(s.id)}
                        aria-pressed={active}
                        className={`flex w-full items-center gap-3 rounded-none border p-4 text-left transition-colors ${
                          active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <span className="mt-0.5 size-2.5 shrink-0 rounded-full" style={{ background: s.color ?? 'hsl(var(--primary))' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{s.name}</span>
                          {s.description ? (
                            <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{s.description}</span>
                          ) : null}
                          <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="size-3.5" /> {formatDuration(s.durationMinutes)}
                          </span>
                        </span>
                        {settings.showPrices ? (
                          <span className="shrink-0 text-sm font-semibold">{formatMoney(s.price, business.currency)}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {stepKey === 'team' && (
          <div className="space-y-2">
            {settings.allowAnyEmployee ? (
              <StaffOption active={employeeId === null} onClick={() => pickStaff(null)} name="Any available" subtitle="Fastest availability" icon />
            ) : null}
            {eligibleStaff.map((e) => (
              <StaffOption
                key={e.id}
                active={employeeId === e.id}
                onClick={() => pickStaff(e.id)}
                name={e.name}
                subtitle={e.title ?? undefined}
              />
            ))}
            {eligibleStaff.length === 0 && settings.allowAnyEmployee ? (
              <p className="pt-1 text-sm text-muted-foreground">We&apos;ll assign the best available team member for you.</p>
            ) : null}
            {eligibleStaff.length === 0 && !settings.allowAnyEmployee ? (
              <p className="pt-1 text-sm text-muted-foreground">No team members are configured for this service yet.</p>
            ) : null}
          </div>
        )}

        {stepKey === 'time' && service && (
          <DateTimePicker
            slug={slug}
            serviceId={service.id}
            employeeId={employeeId}
            timeZone={timeZone}
            todayKey={todayKey}
            daysAhead={settings.daysAhead}
            selected={slot}
            onSelect={setSlot}
          />
        )}

        {stepKey === 'details' && <DetailsForm value={details} onChange={setDetails} requirePhone={settings.requirePhone} />}

        {stepKey === 'review' && service && slot && (
          <dl className="space-y-3 rounded-none border border-border bg-muted/30 p-4 text-sm">
            <Row label="Service" value={service.name} />
            {showTeamStep ? <Row label="With" value={chosenStaff ? chosenStaff.name : 'Any available team member'} /> : null}
            <Row label="When" value={confirmationWhen(slot.startISO, timeZone)} />
            <Row label="Duration" value={formatDuration(service.durationMinutes)} />
            <Row label="Name" value={`${details.firstName} ${details.lastName}`.trim()} />
            <Row label="Email" value={details.email} />
            {details.phone ? <Row label="Phone" value={details.phone} /> : null}
            {settings.showPrices ? (
              <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
                <span>Total</span>
                <span>{formatMoney(service.price, business.currency)}</span>
              </div>
            ) : null}
          </dl>
        )}

        {error ? (
          <p role="alert" className="mt-4 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
    </>
  );

  const body = (
    <>
      <h2 className="mb-5 text-lg font-semibold tracking-tight">{stepTitle}</h2>
      {bodyCore}
    </>
  );

  const footer = (
    <>
      {stepIdx > 0 ? (
        <Button variant="ghost" size="lg" onClick={back} disabled={pending}>
          <ArrowLeft /> Back
        </Button>
      ) : (
        <span />
      )}
      {stepKey !== 'review' ? (
        <Button size="lg" className="shadow-glow" onClick={next} disabled={!canContinue()}>
          Continue <ArrowRight />
        </Button>
      ) : (
        <Button size="lg" className="shadow-glow" onClick={confirm} disabled={pending} aria-busy={pending}>
          {pending ? 'Confirming…' : 'Confirm booking'} <Check />
        </Button>
      )}
    </>
  );

  const summaryAside = preview ? null : (
    <aside className="hidden h-fit border border-border bg-card/70 p-6 backdrop-blur lg:sticky lg:top-8 lg:block">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your booking</p>
      <div className="mt-4 space-y-3.5 text-sm">
        <SummaryRow label="Service" value={service?.name} />
        {showTeamStep ? (
          <SummaryRow label="Team" value={chosenStaff?.name ?? (serviceId ? 'Any available' : undefined)} />
        ) : null}
        <SummaryRow label="When" value={slot ? confirmationWhen(slot.startISO, timeZone) : undefined} />
        <SummaryRow label="Duration" value={service ? formatDuration(service.durationMinutes) : undefined} />
      </div>
      {settings.showPrices && service ? (
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-lg font-bold">
          <span>Total</span>
          <span>{formatMoney(service.price, business.currency)}</span>
        </div>
      ) : null}
    </aside>
  );

  // ---- MINIMAL: borderless, airy, single column ----
  if (layout === 'minimal') {
    return (
      <div className={preview ? '' : 'mx-auto max-w-2xl'}>
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Book an appointment</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{business.name}</h1>
          <Stepper flow={flow} current={stepIdx} />
        </div>
        <div className="min-h-[22rem]">{body}</div>
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">{footer}</div>
      </div>
    );
  }

  // ---- BOLD: large solid gradient header, strong type ----
  if (layout === 'bold') {
    return (
      <div className={preview ? '' : 'mx-auto max-w-3xl'}>
        <div className="overflow-hidden border border-border shadow-premium">
          <div className="bg-gradient-to-br from-primary via-[hsl(var(--aurora-2))] to-[hsl(var(--aurora-3))] p-6 text-primary-foreground sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Book an appointment</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-5xl">{business.name}</h1>
            <div className="mt-5 flex items-center gap-3">
              <span className="flex size-9 items-center justify-center bg-white/20 text-sm font-extrabold tabular-nums">
                {Math.min(stepIdx + 1, flow.length)}
              </span>
              <span className="text-sm font-bold uppercase tracking-wide">{stepTitle}</span>
              <span className="ml-auto text-xs font-semibold text-white/70">
                Step {Math.min(stepIdx + 1, flow.length)} of {flow.length}
              </span>
            </div>
          </div>
          <div className="min-h-[22rem] bg-card p-6 sm:p-9">{bodyCore}</div>
          <div className="flex items-center justify-between gap-3 border-t border-border bg-card p-5 sm:px-9">{footer}</div>
        </div>
      </div>
    );
  }

  // ---- SPLIT: brand rail on the left, steps on the right ----
  if (layout === 'split') {
    return (
      <div className="grid overflow-hidden border border-border shadow-premium lg:grid-cols-[17rem_1fr]">
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-primary via-[hsl(var(--aurora-2))] to-[hsl(var(--aurora-3))] p-7 text-primary-foreground lg:flex">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Book with</p>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight">{business.name}</h1>
          </div>
          <ol className="space-y-2.5">
            {flow.map((key, i) => (
              <li key={key} className="flex items-center gap-3">
                <span
                  className={`flex size-6 items-center justify-center text-xs font-bold ${
                    i < stepIdx ? 'bg-white text-primary' : i === stepIdx ? 'bg-white/25' : 'bg-white/10 text-white/60'
                  }`}
                >
                  {i < stepIdx ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={i === stepIdx ? 'font-bold' : 'text-white/70'}>{STEP_LABEL[key]}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="bg-card">
          <div className="min-h-[24rem] p-6 sm:p-8">{body}</div>
          <div className="flex items-center justify-between gap-3 border-t border-border p-5 sm:px-8">{footer}</div>
        </div>
      </div>
    );
  }

  // ---- ELEGANT: refined, centered, luxury spacing ----
  if (layout === 'elegant') {
    return (
      <div className={preview ? '' : 'mx-auto max-w-2xl'}>
        <div className="border border-border bg-card shadow-premium">
          <div className="h-1 w-full bg-gradient-to-r from-primary via-[hsl(var(--aurora-2))] to-[hsl(var(--aurora-3))]" />
          <div className="px-6 py-9 text-center sm:px-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">Book an appointment</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{business.name}</h1>
            <div className="mx-auto mt-5 h-px w-14 bg-border" />
            <div className="mt-6 text-left">
              <Stepper flow={flow} current={stepIdx} />
            </div>
          </div>
          <div className="min-h-[22rem] px-6 pb-9 sm:px-12">{body}</div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-5 sm:px-12">{footer}</div>
        </div>
      </div>
    );
  }

  // ---- PORTRAIT: cover-style hero header ----
  if (layout === 'portrait') {
    return (
      <div className={preview ? '' : 'mx-auto max-w-2xl'}>
        <div className="overflow-hidden border border-border shadow-premium">
          <div className="relative flex min-h-[11rem] flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary via-[hsl(var(--aurora-2))] to-[hsl(var(--aurora-3))] p-8 text-center text-primary-foreground">
            <span className="pointer-events-none absolute -top-12 right-4 size-44 rounded-full bg-white/10 blur-3xl" aria-hidden />
            <span className="pointer-events-none absolute -bottom-16 -left-8 size-44 rounded-full bg-black/10 blur-3xl" aria-hidden />
            <p className="relative text-[11px] font-bold uppercase tracking-[0.24em] text-white/70">Book an appointment</p>
            <h1 className="relative mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{business.name}</h1>
          </div>
          <div className="min-h-[22rem] bg-card p-6 sm:p-8">
            <Stepper flow={flow} current={stepIdx} />
            <div className="mt-6">{body}</div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border bg-card p-5 sm:px-8">{footer}</div>
        </div>
      </div>
    );
  }

  // ---- SIDEBAR: neutral stepped side navigation ----
  if (layout === 'sidebar') {
    return (
      <div className="grid overflow-hidden border border-border shadow-premium lg:grid-cols-[16rem_1fr]">
        <aside className="hidden flex-col gap-6 border-r border-border bg-muted/40 p-6 lg:flex">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Book with</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight">{business.name}</h1>
          </div>
          <ol className="space-y-1">
            {flow.map((key, i) => (
              <li
                key={key}
                className={`flex items-center gap-3 px-2 py-2 text-sm ${
                  i === stepIdx ? 'bg-primary/10 font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                <span
                  className={`flex size-6 items-center justify-center text-xs font-bold ${
                    i < stepIdx
                      ? 'bg-primary text-primary-foreground'
                      : i === stepIdx
                        ? 'bg-primary/20 text-primary'
                        : 'bg-border text-muted-foreground'
                  }`}
                >
                  {i < stepIdx ? <Check className="size-3.5" /> : i + 1}
                </span>
                {STEP_LABEL[key]}
              </li>
            ))}
          </ol>
        </aside>
        <div className="bg-card">
          <div className="min-h-[24rem] p-6 sm:p-8">{body}</div>
          <div className="flex items-center justify-between gap-3 border-t border-border p-5 sm:px-8">{footer}</div>
        </div>
      </div>
    );
  }

  // ---- SPOTLIGHT: dark premium header with a glow ----
  if (layout === 'spotlight') {
    return (
      <div className={preview ? '' : 'mx-auto max-w-3xl'}>
        <div className="overflow-hidden border border-border shadow-premium">
          <div className="relative overflow-hidden bg-slate-950 p-6 text-white sm:p-9">
            <span
              className="pointer-events-none absolute left-1/2 top-0 size-72 -translate-x-1/2 -translate-y-1/3 rounded-full bg-[hsl(var(--aurora-1))]/40 blur-3xl"
              aria-hidden
            />
            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">Book an appointment</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">{business.name}</h1>
              <div className="mt-6">
                <div className="flex items-center gap-1.5">
                  {flow.map((key, i) => (
                    <div key={key} className={`h-1 flex-1 ${i <= stepIdx ? 'bg-white' : 'bg-white/25'}`} />
                  ))}
                </div>
                <p className="mt-2 text-xs font-medium text-white/60">
                  Step {Math.min(stepIdx + 1, flow.length)} of {flow.length} · {stepTitle}
                </p>
              </div>
            </div>
          </div>
          <div className="min-h-[22rem] bg-card p-6 sm:p-9">{bodyCore}</div>
          <div className="flex items-center justify-between gap-3 border-t border-border bg-card p-5 sm:px-9">{footer}</div>
        </div>
      </div>
    );
  }

  // ---- CLASSIC (default): card + live summary aside ----
  return (
    <div className={preview ? '' : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]'}>
      <div className="overflow-hidden border border-border bg-card shadow-premium">
        <div className="relative border-b border-border p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" aria-hidden />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Book an appointment</p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">{business.name}</h1>
            <Stepper flow={flow} current={stepIdx} />
          </div>
        </div>
        <div className="min-h-[24rem] p-6 sm:p-8">{body}</div>
        <div className="flex items-center justify-between gap-3 border-t border-border p-5 sm:px-8">{footer}</div>
      </div>
      {summaryAside}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${value ? 'text-foreground' : 'text-muted-foreground/50'}`}>
        {value ?? 'Not selected'}
      </dd>
    </div>
  );
}

function Stepper({ flow, current }: { flow: FlowStep[]; current: number }) {
  return (
    <div className="mt-4 flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${flow.length}`}>
      {flow.map((key, i) => (
        <div key={key} className="flex flex-1 flex-col gap-1.5">
          <div className={`h-1 rounded-full ${i <= current ? 'bg-primary' : 'bg-border'}`} />
          <span className={`hidden text-[11px] sm:block ${i === current ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
            {STEP_LABEL[key]}
          </span>
        </div>
      ))}
    </div>
  );
}

function StaffOption({
  active,
  onClick,
  name,
  subtitle,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  subtitle?: string;
  icon?: boolean;
}) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-none border p-3.5 text-left transition-colors ${
        active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/40'
      }`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {icon ? <User className="size-4" /> : initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{name}</span>
        {subtitle ? <span className="block text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
      {active ? <Check className="size-4 shrink-0 text-primary" /> : null}
    </button>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</dd>
    </div>
  );
}
