/**
 * Form Designer - booking-flow settings and step configuration.
 *
 * These control policy and presentation of the customer booking flow: how far
 * ahead visitors can book, the minimum lead time, which optional details are
 * required, and which steps appear. Resolvers tolerate arbitrary JSON from the
 * database and always return a safe, clamped value.
 */

/** Visual layout design for the public booking flow. */
export const FORM_LAYOUTS = [
  'classic',
  'minimal',
  'bold',
  'split',
  'elegant',
  'portrait',
  'sidebar',
  'spotlight',
  'glass',
  'boutique',
] as const;
export type FormLayout = (typeof FORM_LAYOUTS)[number];

export interface FormSettings {
  /** Availability window shown to visitors, in days (1-60). */
  daysAhead: number;
  /** Minimum lead time before a slot can be booked, in minutes (0-43200). */
  minLeadMinutes: number;
  /** Show service prices in the flow. */
  showPrices: boolean;
  /** Require a phone number in the details step. */
  requirePhone: boolean;
  /** Offer an "Any available" option in the team step. */
  allowAnyEmployee: boolean;
  /** Optional custom line shown on the confirmation screen. */
  confirmationMessage: string;
  /** Visual layout design of the booking flow. */
  layout: FormLayout;
}

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  daysAhead: 14,
  minLeadMinutes: 60,
  showPrices: true,
  requirePhone: false,
  allowAnyEmployee: true,
  confirmationMessage: '',
  layout: 'classic',
};

export const FORM_STEP_KEYS = ['service', 'employee', 'datetime', 'details', 'confirm'] as const;
export type FormStepKey = (typeof FORM_STEP_KEYS)[number];

/** Steps that must always be present regardless of stored config. */
const REQUIRED_STEPS: FormStepKey[] = ['service', 'datetime', 'details', 'confirm'];
export const DEFAULT_STEPS: FormStepKey[] = ['service', 'employee', 'datetime', 'details', 'confirm'];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function resolveFormSettings(raw: unknown): FormSettings {
  const s = (raw ?? {}) as Partial<FormSettings>;
  return {
    daysAhead: clampInt(s.daysAhead, 1, 60, DEFAULT_FORM_SETTINGS.daysAhead),
    minLeadMinutes: clampInt(s.minLeadMinutes, 0, 43_200, DEFAULT_FORM_SETTINGS.minLeadMinutes),
    showPrices: asBool(s.showPrices, DEFAULT_FORM_SETTINGS.showPrices),
    requirePhone: asBool(s.requirePhone, DEFAULT_FORM_SETTINGS.requirePhone),
    allowAnyEmployee: asBool(s.allowAnyEmployee, DEFAULT_FORM_SETTINGS.allowAnyEmployee),
    confirmationMessage:
      typeof s.confirmationMessage === 'string' ? s.confirmationMessage.slice(0, 280) : DEFAULT_FORM_SETTINGS.confirmationMessage,
    layout: (FORM_LAYOUTS as readonly string[]).includes(s.layout as string)
      ? (s.layout as FormLayout)
      : DEFAULT_FORM_SETTINGS.layout,
  };
}

/**
 * Resolve the ordered, de-duplicated list of steps from stored config, keeping
 * only known keys and guaranteeing the required steps are present (appended in
 * canonical position if missing). 'employee' is the only truly optional step.
 */
export function resolveSteps(raw: unknown): FormStepKey[] {
  const input = Array.isArray(raw) ? raw : DEFAULT_STEPS;
  const seen = new Set<FormStepKey>();
  const out: FormStepKey[] = [];
  for (const k of input) {
    if ((FORM_STEP_KEYS as readonly string[]).includes(k as string) && !seen.has(k as FormStepKey)) {
      seen.add(k as FormStepKey);
      out.push(k as FormStepKey);
    }
  }
  // Ensure required steps exist, in canonical order relative to the rest.
  for (const req of REQUIRED_STEPS) {
    if (!seen.has(req)) {
      const idx = DEFAULT_STEPS.indexOf(req);
      // Insert at the canonical index (clamped to current length).
      out.splice(Math.min(idx, out.length), 0, req);
      seen.add(req);
    }
  }
  return out;
}

/** Whether the team-selection step is enabled. */
export function hasTeamStep(steps: FormStepKey[]): boolean {
  return steps.includes('employee');
}
