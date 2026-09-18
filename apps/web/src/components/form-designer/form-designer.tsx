'use client';

import { useMemo, useState, useTransition, type CSSProperties } from 'react';
import { Check, Eye, RotateCcw } from 'lucide-react';
import type { PublicBookingData, FormConfigForAdmin } from '@booking/db';
import {
  FORM_THEME_PRESETS,
  DEFAULT_FORM_THEME,
  DEFAULT_FORM_SETTINGS,
  themeCssVars,
  normaliseHex,
  DEFAULT_STEPS,
  type FormThemeTokens,
  type FormSettings,
  type FormStepKey,
  type FormFont,
  type FormLayout,
  type FormSurface,
} from '@booking/core';
import { Button } from '@booking/ui/button';
import { BookingWizard } from '@/components/public/booking-wizard';
import { saveFormDesignAction } from '@/server/form/actions';

const RADIUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'Square', value: '0rem' },
  { label: 'Subtle', value: '0.25rem' },
  { label: 'Rounded', value: '0.5rem' },
  { label: 'Soft', value: '0.625rem' },
  { label: 'Pill', value: '1rem' },
];
const FONT_OPTIONS: { label: string; value: FormFont }[] = [
  { label: 'System', value: 'system' },
  { label: 'Inter', value: 'sans' },
  { label: 'Poppins', value: 'poppins' },
  { label: 'Montserrat', value: 'montserrat' },
  { label: 'Sora', value: 'sora' },
  { label: 'Space Grotesk', value: 'grotesk' },
  { label: 'Playfair Display', value: 'playfair' },
  { label: 'Lora', value: 'lora' },
  { label: 'DM Serif Display', value: 'dmserif' },
  { label: 'Serif (system)', value: 'serif' },
];
const SURFACE_OPTIONS: { label: string; value: FormSurface }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];
const LAYOUT_OPTIONS: { value: FormLayout; label: string; hint: string }[] = [
  { value: 'classic', label: 'Classic', hint: 'Card with live summary' },
  { value: 'minimal', label: 'Minimal', hint: 'Borderless and airy' },
  { value: 'bold', label: 'Bold', hint: 'Big colour header' },
  { value: 'split', label: 'Split', hint: 'Brand rail + steps' },
  { value: 'elegant', label: 'Elegant', hint: 'Centered luxury' },
  { value: 'portrait', label: 'Portrait', hint: 'Cover-style hero' },
  { value: 'sidebar', label: 'Sidebar', hint: 'Stepped side nav' },
  { value: 'spotlight', label: 'Spotlight', hint: 'Dark premium header' },
  { value: 'glass', label: 'Glass', hint: 'Frosted over gradient' },
  { value: 'boutique', label: 'Boutique', hint: 'Monogram luxury' },
];

/** Tiny wireframe that previews each layout's structure. */
function LayoutGlyph({ value }: { value: FormLayout }) {
  const base = 'h-full w-full';
  if (value === 'split') {
    return (
      <span className={`flex ${base} gap-1`}>
        <span className="w-1/3 bg-primary" />
        <span className="flex flex-1 flex-col gap-1 p-1">
          <span className="h-1.5 bg-foreground/25" />
          <span className="h-1.5 w-2/3 bg-foreground/15" />
        </span>
      </span>
    );
  }
  if (value === 'bold') {
    return (
      <span className={`flex flex-col ${base} gap-1`}>
        <span className="h-3 bg-primary" />
        <span className="mx-1 h-1.5 bg-foreground/25" />
        <span className="mx-1 h-1.5 w-2/3 bg-foreground/15" />
      </span>
    );
  }
  if (value === 'minimal') {
    return (
      <span className={`flex flex-col ${base} justify-center gap-1 px-1`}>
        <span className="h-1.5 w-1/2 bg-foreground/25" />
        <span className="h-1.5 bg-foreground/15" />
        <span className="h-1.5 w-3/4 bg-foreground/15" />
      </span>
    );
  }
  if (value === 'elegant') {
    return (
      <span className={`flex flex-col ${base} items-center justify-center gap-1 px-1`}>
        <span className="h-0.5 w-6 bg-primary" />
        <span className="h-1.5 w-1/2 bg-foreground/25" />
        <span className="h-1.5 w-3/4 bg-foreground/15" />
      </span>
    );
  }
  if (value === 'portrait') {
    return (
      <span className={`flex flex-col ${base} gap-1`}>
        <span className="h-5 bg-primary" />
        <span className="mx-1 h-1.5 bg-foreground/25" />
        <span className="mx-1 h-1.5 w-2/3 bg-foreground/15" />
      </span>
    );
  }
  if (value === 'sidebar') {
    return (
      <span className={`flex ${base} gap-1`}>
        <span className="w-1/3 bg-foreground/15" />
        <span className="flex flex-1 flex-col gap-1 p-1">
          <span className="h-1.5 bg-foreground/25" />
          <span className="h-1.5 w-2/3 bg-foreground/15" />
        </span>
      </span>
    );
  }
  if (value === 'spotlight') {
    return (
      <span className={`flex flex-col ${base} gap-1`}>
        <span className="h-4 bg-foreground/80" />
        <span className="mx-1 h-1.5 bg-foreground/25" />
        <span className="mx-1 h-1.5 w-2/3 bg-foreground/15" />
      </span>
    );
  }
  if (value === 'glass') {
    return (
      <span className={`relative flex ${base} items-center justify-center bg-primary/30 p-1`}>
        <span className="flex h-full w-3/4 flex-col justify-center gap-1 bg-background/70 p-1 backdrop-blur">
          <span className="h-1.5 bg-foreground/25" />
          <span className="h-1.5 w-2/3 bg-foreground/15" />
        </span>
      </span>
    );
  }
  if (value === 'boutique') {
    return (
      <span className={`flex flex-col ${base} items-center justify-center gap-1 px-1`}>
        <span className="size-3 rounded-full bg-primary" />
        <span className="h-1.5 w-1/2 bg-foreground/25" />
        <span className="h-1.5 w-3/4 bg-foreground/15" />
      </span>
    );
  }
  // classic
  return (
    <span className={`flex ${base} gap-1 p-1`}>
      <span className="flex flex-1 flex-col gap-1">
        <span className="h-1.5 bg-foreground/25" />
        <span className="h-1.5 w-2/3 bg-foreground/15" />
        <span className="h-1.5 w-1/2 bg-foreground/15" />
      </span>
      <span className="w-1/3 border border-foreground/20" />
    </span>
  );
}

const CONTROL =
  'h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function stepsFor(teamStep: boolean): FormStepKey[] {
  return teamStep ? DEFAULT_STEPS : ['service', 'datetime', 'details', 'confirm'];
}

export function FormDesigner({
  slug,
  initial,
  previewData,
}: {
  slug: string;
  initial: FormConfigForAdmin;
  previewData: PublicBookingData;
}) {
  const [tokens, setTokens] = useState<FormThemeTokens>(initial.theme);
  const [settings, setSettings] = useState<FormSettings>(initial.settings);
  const [teamStep, setTeamStep] = useState<boolean>(initial.steps.includes('employee'));

  const [saved, setSaved] = useState(() => JSON.stringify({ t: initial.theme, s: initial.settings, team: initial.steps.includes('employee') }));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = JSON.stringify({ t: tokens, s: settings, team: teamStep });
  const dirty = current !== saved;

  const steps = useMemo(() => stepsFor(teamStep), [teamStep]);
  const previewStyle = themeCssVars(tokens) as CSSProperties;

  const setToken = (patch: Partial<FormThemeTokens>) => setTokens((t) => ({ ...t, ...patch }));
  const setSetting = <K extends keyof FormSettings>(key: K, value: FormSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  function applyPreset(key: string) {
    const preset = FORM_THEME_PRESETS[key];
    if (preset) setTokens(preset);
  }

  const activePresetKey = useMemo(() => {
    const match = initial.presets.find(
      (p) =>
        p.tokens.primary.toLowerCase() === tokens.primary.toLowerCase() &&
        p.tokens.radius === tokens.radius &&
        p.tokens.font === tokens.font &&
        p.tokens.surface === tokens.surface,
    );
    return match?.key ?? null;
  }, [initial.presets, tokens]);

  function resetToDefault() {
    setTokens(DEFAULT_FORM_THEME);
    setSettings(DEFAULT_FORM_SETTINGS);
    setTeamStep(DEFAULT_STEPS.includes('employee'));
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveFormDesignAction({ tokens, settings, steps });
      if (result.ok) {
        setSaved(JSON.stringify({ t: tokens, s: settings, team: teamStep }));
      } else {
        setError(result.error ?? 'Could not save.');
      }
    });
  }

  function revert() {
    const snap = JSON.parse(saved) as { t: FormThemeTokens; s: FormSettings; team: boolean };
    setTokens(snap.t);
    setSettings(snap.s);
    setTeamStep(snap.team);
    setError(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      {/* Controls */}
      <div className="space-y-6">
        <section className="border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Layout design</h2>
          <p className="mb-3 text-xs text-muted-foreground">Choose how the booking flow is arranged.</p>
          <div className="grid grid-cols-2 gap-2">
            {LAYOUT_OPTIONS.map((opt) => {
              const active = settings.layout === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSetting('layout', opt.value)}
                  aria-pressed={active}
                  className={`flex flex-col gap-2 border p-2.5 text-left transition-all hover:-translate-y-0.5 ${
                    active ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="flex h-12 w-full items-stretch border border-border bg-muted/40">
                    <LayoutGlyph value={opt.value} />
                  </span>
                  <span className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{opt.label}</span>
                    {active ? <Check className="size-3.5 text-primary" /> : null}
                  </span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{opt.hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Style presets</h2>
          <p className="mb-3 text-xs text-muted-foreground">Pick a style, then fine-tune the colour, corners and font.</p>

          <div className="grid grid-cols-3 gap-2">
            {initial.presets.map((p) => {
              const active = activePresetKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  aria-pressed={active}
                  title={p.name}
                  className={`group rounded-none border p-2 text-left transition-all hover:-translate-y-0.5 ${
                    active ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span
                    className="block h-10 w-full"
                    style={{
                      borderRadius: p.tokens.radius,
                      background: `linear-gradient(135deg, ${p.tokens.primary}, ${p.tokens.primary}b3)`,
                    }}
                  />
                  <span className="mt-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium">{p.name}</span>
                    {active ? <Check className="size-3.5 text-primary" /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Brand colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Brand colour"
                  value={/^#[0-9a-fA-F]{6}$/.test(tokens.primary) ? tokens.primary : '#4f46e5'}
                  onChange={(e) => setToken({ primary: e.target.value })}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-none border border-border bg-background p-1"
                />
                <input
                  aria-label="Brand colour hex"
                  value={tokens.primary}
                  onChange={(e) => setToken({ primary: e.target.value })}
                  onBlur={(e) => setToken({ primary: normaliseHex(e.target.value) })}
                  className={`${CONTROL} font-mono`}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Recolours the whole form: headers, gradients and accents.</p>
            </Field>

            <Field label="Surface">
              <div className="grid grid-cols-2 gap-2">
                {SURFACE_OPTIONS.map((s) => {
                  const active = tokens.surface === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setToken({ surface: s.value })}
                      aria-pressed={active}
                      className={`flex items-center gap-2 border px-3 py-2 text-sm transition-colors ${
                        active ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <span
                        className={`size-4 border ${s.value === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-border bg-white'}`}
                      />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Corners">
                <select className={CONTROL} value={tokens.radius} onChange={(e) => setToken({ radius: e.target.value })}>
                  {RADIUS_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Font">
                <select className={CONTROL} value={tokens.font} onChange={(e) => setToken({ font: e.target.value as FormFont })}>
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-none border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Booking flow</h2>
          <div className="mt-3 space-y-1">
            <Toggle label="Let customers choose a team member" checked={teamStep} onChange={setTeamStep} />
            <Toggle
              label='Offer an "Any available" option'
              checked={settings.allowAnyEmployee}
              onChange={(v) => setSetting('allowAnyEmployee', v)}
              disabled={!teamStep}
            />
            <Toggle label="Show prices" checked={settings.showPrices} onChange={(v) => setSetting('showPrices', v)} />
            <Toggle label="Require phone number" checked={settings.requirePhone} onChange={(v) => setSetting('requirePhone', v)} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Bookable ahead (days)">
              <input
                type="number"
                min={1}
                max={60}
                className={CONTROL}
                value={settings.daysAhead}
                onChange={(e) => setSetting('daysAhead', Number(e.target.value))}
              />
            </Field>
            <Field label="Min. notice (mins)">
              <input
                type="number"
                min={0}
                max={43200}
                className={CONTROL}
                value={settings.minLeadMinutes}
                onChange={(e) => setSetting('minLeadMinutes', Number(e.target.value))}
              />
            </Field>
          </div>

          <Field label="Confirmation message" className="mt-3">
            <input
              className={CONTROL}
              placeholder="e.g. We'll email you once confirmed."
              value={settings.confirmationMessage}
              onChange={(e) => setSetting('confirmationMessage', e.target.value)}
              maxLength={280}
            />
          </Field>
        </section>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={!dirty || pending} aria-busy={pending}>
            <Check /> {pending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </Button>
          {dirty ? (
            <Button variant="ghost" onClick={revert} disabled={pending}>
              <RotateCcw /> Revert
            </Button>
          ) : null}
          <Button variant="outline" onClick={resetToDefault} disabled={pending}>
            Reset to default
          </Button>
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Eye className="size-3.5" /> Live preview
        </div>
        <div className="rounded-none border border-dashed border-border bg-background font-sans text-foreground p-3 sm:p-5" style={previewStyle}>
          <div className="mx-auto max-w-2xl">
            <BookingWizard data={previewData} slug={slug} settings={settings} steps={steps} preview />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className ?? ''}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md py-1.5 text-left text-sm disabled:opacity-50"
    >
      <span>{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-background transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}
