'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, User, CalendarCheck } from 'lucide-react';
import type { PublicBookingData } from '@booking/db';
import { Button } from '@booking/ui/button';
import { submitPublicBooking, type PublicBookingResult } from '@/server/public/actions';
import { DateTimePicker, type SelectedSlot } from './datetime-picker';
import { DetailsForm, type CustomerDetails } from './details-form';
import { formatMoney, formatDuration, confirmationWhen } from './format';

const STEPS = ['Service', 'Team', 'Time', 'Details', 'Review'] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function todayInTz(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

export function BookingWizard({ data, slug }: { data: PublicBookingData; slug: string }) {
  const { business, categories, services, employees } = data;
  const timeZone = business.timezone;
  const todayKey = useMemo(() => todayInTz(timeZone), [timeZone]);

  const [step, setStep] = useState<StepIndex>(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null); // null = any available
  const [slot, setSlot] = useState<SelectedSlot | null>(null);
  const [details, setDetails] = useState<CustomerDetails>({ firstName: '', lastName: '', email: '', phone: '', notes: '' });

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PublicBookingResult | null>(null);

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

  const canContinue: Record<StepIndex, boolean> = {
    0: !!serviceId,
    1: true, // "Any available" is a valid default
    2: !!slot,
    3: details.firstName.trim().length > 0 && EMAIL_RE.test(details.email.trim()),
    4: true,
  };

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
    if (step < 4) setStep((s) => (s + 1) as StepIndex);
  }
  function back() {
    setError(null);
    if (step > 0) setStep((s) => (s - 1) as StepIndex);
  }

  function confirm() {
    if (!service || !slot) return;
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
        // A conflict means our slot went stale — send them back to pick again.
        if (/no longer available/i.test(result.error)) {
          setSlot(null);
          setStep(2);
        }
      }
    });
  }

  function reset() {
    setConfirmation(null);
    setServiceId(null);
    setEmployeeId(null);
    setSlot(null);
    setDetails({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
    setError(null);
    setStep(0);
  }

  // ---- Confirmation screen ----
  if (confirmation?.ok) {
    const c = confirmation.confirmation;
    return (
      <div className="rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CalendarCheck className="size-7" />
        </div>
        <h1 className="mt-4 text-center text-xl font-semibold">Request received</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Thanks, {details.firstName || 'there'}. Your appointment is <span className="font-medium text-foreground">pending confirmation</span> — {business.name} will review it shortly.
        </p>

        <dl className="mt-6 space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
          <Row label="Reference" value={c.reference} mono />
          <Row label="Service" value={c.serviceName} />
          {c.employeeName ? <Row label="With" value={c.employeeName} /> : null}
          <Row label="When" value={confirmationWhen(c.startISO, c.timezone)} />
          <Row label="Price" value={formatMoney(c.price, c.currency)} />
        </dl>

        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={reset}>
            Book another appointment
          </Button>
        </div>
      </div>
    );
  }

  // ---- Wizard ----
  return (
    <div className="rounded-2xl border border-border bg-background shadow-sm">
      {/* Header */}
      <div className="border-b border-border p-5 sm:p-6">
        <h1 className="text-lg font-semibold tracking-tight">{business.name}</h1>
        <p className="text-sm text-muted-foreground">Book an appointment</p>
        <Stepper current={step} />
      </div>

      {/* Body */}
      <div className="min-h-[19rem] p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {step === 0 && 'Choose a service'}
          {step === 1 && 'Choose your team member'}
          {step === 2 && 'Pick a date & time'}
          {step === 3 && 'Your details'}
          {step === 4 && 'Review & confirm'}
        </h2>

        {/* Step 0 — Service */}
        {step === 0 && (
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
                        <span className="mt-0.5 size-2.5 shrink-0 rounded-full" style={{ background: s.color ?? 'var(--primary)' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{s.name}</span>
                          {s.description ? (
                            <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{s.description}</span>
                          ) : null}
                          <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="size-3.5" /> {formatDuration(s.durationMinutes)}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold">{formatMoney(s.price, business.currency)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 1 — Team member */}
        {step === 1 && (
          <div className="space-y-2">
            <StaffOption active={employeeId === null} onClick={() => pickStaff(null)} name="Any available" subtitle="Fastest availability" icon />
            {eligibleStaff.map((e) => (
              <StaffOption
                key={e.id}
                active={employeeId === e.id}
                onClick={() => pickStaff(e.id)}
                name={e.name}
                subtitle={e.title ?? undefined}
              />
            ))}
            {eligibleStaff.length === 0 ? (
              <p className="pt-1 text-sm text-muted-foreground">We&apos;ll assign the best available team member for you.</p>
            ) : null}
          </div>
        )}

        {/* Step 2 — Date & time */}
        {step === 2 && service && (
          <DateTimePicker
            slug={slug}
            serviceId={service.id}
            employeeId={employeeId}
            timeZone={timeZone}
            todayKey={todayKey}
            selected={slot}
            onSelect={setSlot}
          />
        )}

        {/* Step 3 — Details */}
        {step === 3 && <DetailsForm value={details} onChange={setDetails} />}

        {/* Step 4 — Review */}
        {step === 4 && service && slot && (
          <dl className="space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
            <Row label="Service" value={service.name} />
            <Row label="With" value={chosenStaff ? chosenStaff.name : 'Any available team member'} />
            <Row label="When" value={confirmationWhen(slot.startISO, timeZone)} />
            <Row label="Duration" value={formatDuration(service.durationMinutes)} />
            <Row label="Name" value={`${details.firstName} ${details.lastName}`.trim()} />
            <Row label="Email" value={details.email} />
            {details.phone ? <Row label="Phone" value={details.phone} /> : null}
            <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
              <span>Total</span>
              <span>{formatMoney(service.price, business.currency)}</span>
            </div>
          </dl>
        )}

        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-3 border-t border-border p-4 sm:px-6">
        {step > 0 ? (
          <Button variant="ghost" onClick={back} disabled={pending}>
            <ArrowLeft /> Back
          </Button>
        ) : (
          <span />
        )}
        {step < 4 ? (
          <Button onClick={next} disabled={!canContinue[step]}>
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

function Stepper({ current }: { current: number }) {
  return (
    <div className="mt-4 flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${STEPS.length}`}>
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 flex-col gap-1.5">
          <div className={`h-1 rounded-full ${i <= current ? 'bg-primary' : 'bg-border'}`} />
          <span className={`hidden text-[11px] sm:block ${i === current ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
            {label}
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
