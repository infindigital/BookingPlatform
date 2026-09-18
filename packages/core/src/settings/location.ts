/**
 * Location domain - pure and dependency-free. A business may run several
 * locations; each can override the business timezone. Bookings and working
 * hours reference a location.
 */

import { ValidationError } from '../errors';
import { isValidTimeZone } from './profile';

export interface LocationInput {
  name?: string | null;
  address?: string | null;
  /** Optional IANA timezone override; null/empty = inherit the business zone. */
  timezone?: string | null;
  isActive?: boolean;
}

export interface ResolvedLocation {
  name: string;
  address: string | null;
  timezone: string | null;
  isActive: boolean;
}

export function resolveLocationInput(input: LocationInput): ResolvedLocation {
  const name = (input.name ?? '').trim();
  if (!name) throw new ValidationError('A location name is required.');
  if (name.length > 200) throw new ValidationError('The location name is too long.');

  const tzRaw = (input.timezone ?? '').trim();
  if (tzRaw && !isValidTimeZone(tzRaw)) throw new ValidationError('That timezone is not recognised.');

  const address = (input.address ?? '').trim();
  return {
    name: name.slice(0, 200),
    address: address ? address.slice(0, 500) : null,
    timezone: tzRaw || null,
    isActive: input.isActive !== false,
  };
}
