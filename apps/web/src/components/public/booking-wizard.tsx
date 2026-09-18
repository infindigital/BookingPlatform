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
      <div className="rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CalendarCheck className="size-7" />
        </div>
        <h1 className="mt-4 text-center text-xl font-semibold">Request received</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Thanks, {details.firstName || 'there'}. Your appointment is{' '}
          <span className="font-medium text-foreground">pending confirmation</span> — {business.name} will review it shortly.
        </p>
        {settings.confirmationMessage ? (
          <p className="mt-2 text-center text-sm text-muted-foreground">{settings.confirmationMessage}</p>
        ) : null}

        <dl className="mt-6 space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
          {c ? <Row label="Reference" value={c.reference} mono /> : null}
          <Row label="Service" value={c?.serviceName ?? service?.name ?? ''} />
          {(c?.employeeName ?? chosenStaff?.name) ? <Row label="With" value={c?.employeeName ?? chosenStaff!.name} /> : null}
          {slot ? <Row label="When" value={confirmationWhen(c?.startISO ?? slot.startISO, timeZone)} /> : null}
          {settings.showPrices && service ? <Row label="Price" value={formatMoney(service.price, business.currency)} /> : null}
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
  return (
    <div className="rounded-2xl border border-border bg-background shadow-sm">
      <div className="border-b border-border p-5 sm:p-6">
        <h1 className="text-lg font-semibold tracking-tight">{business.name}</h1>
        <p className="text-sm text-muted-foreground">Book an appointment</p>
        <Stepper flow={flow} current={stepIdx} />
      </div>

      <div className="min-h-[19rem] p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {stepKey === 'service' && 'Choose a service'}
          {stepKey === 'team' && 'Choose your team member'}
          {stepKey === 'time' && 'Pick a date & time'}
          {stepKey === 'details' && 'Your details'}
          {stepKey === 'review' && 'Review & confirm'}
        </h2>

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
                        className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
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
          <dl className="space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
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
          <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border p-4 sm:px-6">
        {stepIdx > 0 ? (
          <Button variant="ghost" onClick={back} disabled={pending}>
            <ArrowLeft /> Back
          </Button>
        ) : (
          <span />
        )}
        {stepKey !== 'review' ? (
          <Button onClick={next} disabled={!canContinue()}>
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button onClick={confirm} disabled={pending} aria-busy={pending}>
            {pending ? 'Confirming…' : 'Confirm booking'} <Check />
          </Button>
        )}
      </div>
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
      className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
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
