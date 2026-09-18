/** Timezone-aware formatting helpers for the public booking flow. */

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** "HH:MM" (24h) wall-clock in the business timezone - the value we submit. */
export function slotTime24(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );
}

/** "9:00 AM" wall-clock in the business timezone - what we show. */
export function slotLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/**
 * e.g. "Wed, Jun 4". The dayKey already IS the local calendar day in the
 * business timezone, so we anchor at noon UTC and format in UTC to avoid
 * re-shifting the date.
 */
export function dayLabel(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

/** Split a dayKey into { weekday, day, month } parts for a compact date pill. */
export function dayParts(dayKey: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${dayKey}T12:00:00.000Z`);
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(d),
    day: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric' }).format(d),
    month: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(d),
  };
}

/** Long confirmation date+time, e.g. "Wednesday, June 4, 2031 at 10:00 AM". */
export function confirmationWhen(iso: string, timeZone: string): string {
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
  return `${date} at ${slotLabel(iso, timeZone)}`;
}
