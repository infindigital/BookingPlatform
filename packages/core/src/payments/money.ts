/**
 * Money helpers — pure and dependency-free.
 *
 * All amounts are plain decimal numbers (e.g. 49.5 = $49.50) rounded to two
 * places. We deliberately avoid a money/currency library: the platform ships no
 * unnecessary dependency, and `Intl.NumberFormat` (built in to Node and every
 * browser) handles locale-aware currency display.
 */

/** Round to 2 decimal places, half away from zero, tolerant of float artefacts. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100;
}

/** Round then clamp into [min, max]. */
export function clampMoney(value: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  const v = roundMoney(value);
  if (v < min) return roundMoney(min);
  if (v > max) return roundMoney(max);
  return v;
}

/** A safe 3-letter uppercase currency code, defaulting to USD. */
export function normalizeCurrency(currency: string | null | undefined): string {
  const c = (currency ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : 'USD';
}

/** Locale-aware currency string via built-in Intl (no date/money library). */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const code = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(safe);
  } catch {
    return `${code} ${safe.toFixed(2)}`;
  }
}
