/**
 * Business profile domain — pure and dependency-free.
 *
 * Validates and normalises the tenant-level settings (name, timezone, currency,
 * contact details) that the rest of the platform reads: currency drives payment
 * display, timezone drives availability + the dashboard, and the contact details
 * appear on customer-facing notifications.
 */

import { ValidationError } from '../errors';
import { normalizeCurrency } from '../payments/money';

export interface BusinessProfileInput {
  name?: string | null;
  timezone?: string | null;
  currency?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface BusinessProfile {
  name: string;
  timezone: string;
  currency: string;
  email: string | null;
  phone: string | null;
}

/** Whether `tz` is an IANA timezone the runtime accepts (via built-in Intl). */
export function isValidTimeZone(tz: string | null | undefined): boolean {
  const value = (tz ?? '').trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanOptional(value: string | null | undefined, max: number): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return v.slice(0, max);
}

/**
 * Resolve a raw profile into a validated, normalised one. Throws
 * ValidationError on a missing name, an unknown timezone, or a malformed email.
 * Currency is normalised (3-letter, default USD) rather than rejected.
 */
export function resolveBusinessProfile(input: BusinessProfileInput): BusinessProfile {
  const name = (input.name ?? '').trim();
  if (!name) throw new ValidationError('A business name is required.');
  if (name.length > 200) throw new ValidationError('The business name is too long.');

  const timezone = (input.timezone ?? '').trim() || 'UTC';
  if (!isValidTimeZone(timezone)) throw new ValidationError('That timezone is not recognised.');

  const email = cleanOptional(input.email, 200);
  if (email && !EMAIL_RE.test(email)) throw new ValidationError('That email address is not valid.');

  return {
    name: name.slice(0, 200),
    timezone,
    currency: normalizeCurrency(input.currency),
    email,
    phone: cleanOptional(input.phone, 50),
  };
}
