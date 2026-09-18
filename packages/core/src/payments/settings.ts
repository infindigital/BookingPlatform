import { clampMoney, normalizeCurrency } from './money';

/**
 * Payment policy - pure domain.
 *
 * A business decides, per its own rules, how much a customer owes when a booking
 * is made: nothing (NONE), a deposit (DEPOSIT - a percentage of the price or a
 * fixed amount), or the full price (FULL). This is intentionally
 * provider-agnostic: the amount owed is a domain fact; *how* it is collected
 * (an offline/manual record, or a real gateway) is a separate concern layered on
 * top. No payment provider is mandatory.
 */

export type PaymentMode = 'NONE' | 'DEPOSIT' | 'FULL';
export type DepositType = 'PERCENT' | 'FIXED';

export const PAYMENT_MODES: readonly PaymentMode[] = ['NONE', 'DEPOSIT', 'FULL'];
export const DEPOSIT_TYPES: readonly DepositType[] = ['PERCENT', 'FIXED'];

export interface PaymentMethodOption {
  key: string;
  label: string;
}

/** The catalogue of manual/offline collection methods staff can record. */
export const PAYMENT_METHODS: readonly PaymentMethodOption[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'card', label: 'Card (in person)' },
  { key: 'bank_transfer', label: 'Bank transfer' },
  { key: 'online', label: 'Online / gateway' },
  { key: 'other', label: 'Other' },
];

const METHOD_KEYS = new Set(PAYMENT_METHODS.map((m) => m.key));

export function isPaymentMethod(key: string): boolean {
  return METHOD_KEYS.has(key);
}

export interface PaymentSettings {
  mode: PaymentMode;
  depositType: DepositType;
  /** For PERCENT: 0..100. For FIXED: a currency amount (>= 0). */
  depositValue: number;
  currency: string;
  /** Free-text instructions shown to the customer for offline payment. */
  instructions: string | null;
  /** Enabled manual methods (subset of PAYMENT_METHODS keys). */
  methods: string[];
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  mode: 'NONE',
  depositType: 'PERCENT',
  depositValue: 0,
  currency: 'USD',
  instructions: null,
  methods: ['cash', 'card'],
};

/** Keep only known method keys, de-duplicated, in catalogue order. */
export function sanitizeMethods(input: unknown): string[] {
  const requested = new Set<string>();
  if (Array.isArray(input)) {
    for (const raw of input) {
      if (typeof raw === 'string') {
        const k = raw.trim().toLowerCase();
        if (METHOD_KEYS.has(k)) requested.add(k);
      }
    }
  }
  return PAYMENT_METHODS.filter((m) => requested.has(m.key)).map((m) => m.key);
}

function asMode(v: unknown): PaymentMode {
  return typeof v === 'string' && (PAYMENT_MODES as string[]).includes(v) ? (v as PaymentMode) : 'NONE';
}
function asDepositType(v: unknown): DepositType {
  return v === 'FIXED' ? 'FIXED' : 'PERCENT';
}

/**
 * Coerce arbitrary stored/submitted data into safe, clamped settings.
 * A PERCENT deposit is clamped to 0..100; a FIXED deposit to >= 0.
 */
export function resolvePaymentSettings(raw: unknown): PaymentSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const depositType = asDepositType(r.depositType);
  const rawValue = typeof r.depositValue === 'number' ? r.depositValue : Number(r.depositValue);
  const depositValue =
    depositType === 'PERCENT'
      ? clampMoney(Number.isFinite(rawValue) ? rawValue : 0, 0, 100)
      : clampMoney(Number.isFinite(rawValue) ? rawValue : 0, 0);
  const instructionsRaw = typeof r.instructions === 'string' ? r.instructions.trim() : '';
  const methods = r.methods === undefined ? DEFAULT_PAYMENT_SETTINGS.methods : sanitizeMethods(r.methods);
  return {
    mode: asMode(r.mode),
    depositType,
    depositValue,
    currency: normalizeCurrency(typeof r.currency === 'string' ? r.currency : undefined),
    instructions: instructionsRaw ? instructionsRaw.slice(0, 2000) : null,
    methods,
  };
}
