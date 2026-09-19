'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, User, CalendarCheck, MapPin, Info, AlertTriangle, AlertOctagon } from 'lucide-react';
import type { PublicBookingData, PublicNotice } from '@booking/db';
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

type FlowStep = 'service' | 'team' | 'location' | 'time' | 'details' | 'review';
const STEP_LABEL: Record<FlowStep, string> = {
  service: 'Service',
  team: 'Team',
  location: 'Location',
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

/** Compact one-line address for a location card: "123 Main St · Kansas City, MO 64134". */
function locationSummary(loc: PublicBookingData['locations'][number]): string {
  const cityState = [loc.city, loc.state].filter(Boolean).join(', ');
  const locality = [cityState, loc.postalCode].filter(Boolean).join(' ').trim();
  return [loc.address, locality].filter(Boolean).join(' · ');
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
  const { business, categories, services, employees, locations, notices = [] } = data;
  const timeZone = business.timezone;
  const todayKey = useMemo(() => todayInTz(timeZone), [timeZone]);

  const settings = settingsProp ?? data.form?.settings ?? DEFAULT_FORM_SETTINGS;
  const configuredSteps = stepsProp ?? data.form?.steps ?? DEFAULT_STEPS;
  const showTeamStep = hasTeamStep(configuredSteps);

  // A lone fixed (non-mobile) location is auto-selected and never shown as a
  // step; anything else (multiple locations, or a mobile one that needs an
  // address) gets an explicit Location step. No locations at all = unchanged.
  const onlyLocation = locations.length === 1 ? locations[0] : undefined;
  const singleAutoLocation = onlyLocation && onlyLocation.mode !== 'MOBILE' ? onlyLocation : null;
  const showLocationStep = locations.length > 0 && !singleAutoLocation;

  const flow = useMemo<FlowStep[]>(() => {
    const s: FlowStep[] = ['service'];
    if (showTeamStep) s.push('team');
    if (showLocationStep) s.push('location');
    s.push('time', 'details', 'review');
    return s;
  }, [showTeamStep, showLocationStep]);

  const [stepIdx, setStepIdx] = useState(0);
  const stepKey = flow[Math.min(stepIdx, flow.length - 1)] ?? 'service';

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null); // null = any available
  const [locationId, setLocationId] = useState<string | null>(singleAutoLocation?.id ?? null);
  const [customerAddress, setCustomerAddress] = useState('');
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
  const chosenLocation = useMemo(() => locations.find((l) => l.id === locationId) ?? null, [locations, locationId]);

  // Business-wide notices (locationId null) always show; location-scoped notices
  // show once their location is the chosen one.
  const applicableNotices = useMemo(
    () => notices.filter((n) => n.locationId === null || n.locationId === locationId),
    [notices, locationId],
  );

  // Locations valid for the current service (and chosen team member), honouring
  // the "no assignment rows = available everywhere" default.
  const selectableLocations = useMemo(() => {
    return locations.filter((loc) => {
      const serviceOk = !service || service.locationIds.length === 0 || service.locationIds.includes(loc.id);
      const staffOk = !chosenStaff || chosenStaff.locationIds.length === 0 || chosenStaff.locationIds.includes(loc.id);
      return serviceOk && staffOk;
    });
  }, [locations, service, chosenStaff]);

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
      case 'location':
        if (!locationId) return false;
        return chosenLocation?.mode !== 'MOBILE' || customerAddress.trim().length > 0;
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
    setLocationId(singleAutoLocation?.id ?? null);
    setSlot(null);
  }
  function pickStaff(id: string | null) {
    setEmployeeId(id);
    setLocationId(singleAutoLocation?.id ?? null);
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
        locationId,
        dayKey: slot.startISO.slice(0, 10),
        time: slot.time,
        firstName: details.firstName,
        lastName: details.lastName,
        email: details.email,
        phone: details.phone,
        notes: details.notes,
        customerAddress: chosenLocation?.mode === 'MOBILE' ? customerAddress : null,
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
    setLocationId(singleAutoLocation?.id ?? null);
    setCustomerAddress('');
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

        {applicableNotices.length > 0 ? (
          <div className="mt-6 space-y-2">
            {applicableNotices.map((n) => (
              <NoticeBanner key={n.id} notice={n} />
            ))}
          </div>
        ) : null}

        <dl className="mt-6 space-y-3 rounded-none border border-border bg-muted/30 p-4 text-sm">
          {c ? <Row label="Reference" value={c.reference} mono /> : null}
          <Row label="Service" value={c?.serviceName ?? service?.name ?? ''} />
          {(c?.employeeName ?? chosenStaff?.name) ? <Row label="With" value={c?.employeeName ?? chosenStaff!.name} /> : null}
          {(c?.locationName ?? chosenLocation?.name) ? (
            <Row label="Location" value={c?.locationName ?? chosenLocation!.name} />
          ) : null}
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
  const STEP_TITLE: Record<FlowStep, string> = {
    service: 'Choose a service',
    team: 'Choose your team member',
    location: 'Choose a location',
    time: 'Pick a date & time',
    details: 'Your details',
    review: 'Review & confirm',
  };
  const stepTitle = STEP_TITLE[stepKey];

  const bodyCore = (
    <>
        {applicableNotices.length > 0 ? (
          <div className="mb-5 space-y-2">
            {applicableNotices.map((n) => (
              <NoticeBanner key={n.id} notice={n} />
            ))}
          </div>
        ) : null}

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
                        className={`group relative flex w-full items-stretch gap-4 overflow-hidden rounded-none border p-4 pl-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-premium ${
                          active
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/40'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <span
                          className="w-1.5 shrink-0 self-stretch"
                          style={{ background: s.color ?? 'hsl(var(--primary))' }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 py-0.5">
                          <span className="flex items-center gap-2">
                            <span className="block text-base font-semibold tracking-tight">{s.name}</span>
                            {active ? <Check className="size-4 shrink-0 text-primary" /> : null}
                          </span>
                          {s.description ? (
                            <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{s.description}</span>
                          ) : null}
                          <span className="mt-2 inline-flex items-center gap-1.5 bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <Clock className="size-3.5" /> {formatDuration(s.durationMinutes)}
                          </span>
                        </span>
                        {settings.showPrices ? (
                          <span className="flex shrink-0 flex-col items-end justify-center">
                            <span className="text-lg font-bold tracking-tight">{formatMoney(s.price, business.currency)}</span>
                          </span>
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

        {stepKey === 'location' && (
          <div className="space-y-2">
            {selectableLocations.length === 0 ? (
              <p className="pt-1 text-sm text-muted-foreground">
                No locations are available for this selection. Please choose a different service or team member.
              </p>
            ) : (
              selectableLocations.map((loc) => {
                const active = loc.id === locationId;
                const summary = locationSummary(loc);
                return (
                  <button
                    key={loc.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLocationId(active ? null : loc.id)}
                    className={`flex w-full items-start gap-3 rounded-none border p-3.5 text-left transition-colors ${
                      active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <MapPin className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{loc.name}</span>
                      {summary ? <span className="block text-xs text-muted-foreground">{summary}</span> : null}
                      {loc.mode === 'MOBILE' ? (
                        <span className="mt-0.5 block text-xs font-medium text-primary">We come to you</span>
                      ) : null}
                    </span>
                    {active ? <Check className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })
            )}

            {chosenLocation?.mode === 'MOBILE' ? (
              <label className="mt-3 block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Your address *</span>
                <textarea
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  rows={2}
                  maxLength={300}
                  className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Street address we should come to"
                />
              </label>
            ) : null}
          </div>
        )}

        {stepKey === 'time' && service && (
          <DateTimePicker
            slug={slug}
            serviceId={service.id}
            employeeId={employeeId}
            locationId={locationId}
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
            {chosenLocation ? <Row label="Location" value={chosenLocation.name} /> : null}
            {chosenLocation?.mode === 'MOBILE' && customerAddress.trim() ? (
              <Row label="Address" value={customerAddress.trim()} />
            ) : null}
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
        {showLocationStep ? <SummaryRow label="Location" value={chosenLocation?.name} /> : null}
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
          <div className="bg-gradient-to-br from-[hsl(var(--brand-1))] to-[hsl(var(--brand-2))] p-6 text-primary-foreground sm:p-9">
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
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-[hsl(var(--brand-1))] to-[hsl(var(--brand-2))] p-7 text-primary-foreground lg:flex">
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
          <div className="h-1 w-full bg-gradient-to-r from-[hsl(var(--brand-1))] to-[hsl(var(--brand-2))]" />
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
          <div className="relative flex min-h-[11rem] flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[hsl(var(--brand-1))] to-[hsl(var(--brand-2))] p-8 text-center text-primary-foreground">
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

  // ---- GLASS: frosted card floating over a brand gradient ----
  if (layout === 'glass') {
    return (
      <div className="relative overflow-hidden p-4 sm:p-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--brand-1))] to-[hsl(var(--brand-2))]" aria-hidden />
        <span className="pointer-events-none absolute -left-10 top-6 size-52 rounded-full bg-white/20 blur-3xl" aria-hidden />
        <span className="pointer-events-none absolute -right-8 bottom-0 size-52 rounded-full bg-black/10 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-2xl border border-white/25 bg-card/80 p-6 shadow-premium backdrop-blur-2xl sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Book an appointment</p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight sm:text-4xl">{business.name}</h1>
          <Stepper flow={flow} current={stepIdx} />
          <div className="mt-7 min-h-[20rem]">{body}</div>
          <div className="mt-7 flex items-center justify-between gap-3 border-t border-border/60 pt-5">{footer}</div>
        </div>
      </div>
    );
  }

  // ---- BOUTIQUE: centered luxury with a brand monogram ----
  if (layout === 'boutique') {
    const initial = business.name.trim().charAt(0).toUpperCase() || 'B';
    return (
      <div className={preview ? '' : 'mx-auto max-w-2xl'}>
        <div className="border border-border bg-card shadow-premium">
          <div className="flex flex-col items-center px-6 py-9 text-center sm:px-12">
            <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-1))] to-[hsl(var(--brand-2))] text-2xl font-bold text-primary-foreground shadow-glow">
              {initial}
            </span>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">Book an appointment</p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight sm:text-4xl">{business.name}</h1>
            <div className="mx-auto mt-5 h-px w-14 bg-border" />
            <div className="mt-6 w-full text-left">
              <Stepper flow={flow} current={stepIdx} />
            </div>
          </div>
          <div className="min-h-[22rem] px-6 pb-9 sm:px-12">{body}</div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-5 sm:px-12">{footer}</div>
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
    <div className="mt-4 flex items-center gap-2" aria-label={`Step ${current + 1} of ${flow.length}`}>
      {flow.map((key, i) => (
        <div key={key} className="flex flex-1 flex-col gap-1.5">
          <div
            className={`h-1.5 ${
              i < current
                ? 'bg-primary'
                : i === current
                  ? 'bg-gradient-to-r from-primary to-[hsl(var(--brand-2))]'
                  : 'bg-border'
            }`}
          />
          <span
            className={`hidden text-[11px] font-medium uppercase tracking-wide sm:block ${
              i === current ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
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

const NOTICE_STYLES: Record<string, { border: string; Icon: typeof Info }> = {
  info: { border: 'border-primary/40 bg-primary/5 text-foreground', Icon: Info },
  warning: { border: 'border-amber-500/50 bg-amber-500/10 text-foreground', Icon: AlertTriangle },
  critical: { border: 'border-destructive/50 bg-destructive/5 text-foreground', Icon: AlertOctagon },
};

function NoticeBanner({ notice }: { notice: PublicNotice }) {
  const style = NOTICE_STYLES[notice.level ?? 'info'] ?? NOTICE_STYLES.info!;
  const Icon = style.Icon;
  return (
    <div className={`flex items-start gap-3 rounded-none border p-3.5 text-sm ${style.border}`} role="note">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {notice.title ? <p className="font-semibold">{notice.title}</p> : null}
        <p className="whitespace-pre-line text-muted-foreground">{notice.message}</p>
      </div>
    </div>
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
