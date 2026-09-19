'use server';

import {
  getPublicAvailability,
  createPublicBooking,
  type PublicBookingConfirmation,
} from '@booking/db';
import { DomainError } from '@booking/core';
import { logger } from '@/lib/logger';

/**
 * Public (unauthenticated) booking server actions. These back the customer
 * booking page at /book/[slug]. They are intentionally NOT permission-gated -
 * anyone can view availability and request a booking - but they never trust the
 * client: the data layer re-resolves the business by slug and re-validates every
 * request. No internal ids or records are returned beyond the public shape.
 */

export interface PublicSlot {
  /** Instant of the slot start (ISO). The client formats it in the business tz. */
  startISO: string;
  employeeIds: string[];
}
export interface PublicDaySlots {
  dayKey: string;
  slots: PublicSlot[];
}

export async function fetchPublicAvailability(input: {
  slug: string;
  serviceId: string;
  employeeId: string | null;
  locationId?: string | null;
  fromDayKey: string;
  toDayKey: string;
}): Promise<{ days: PublicDaySlots[] }> {
  if (!input.slug || !input.serviceId) return { days: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fromDayKey) || !/^\d{4}-\d{2}-\d{2}$/.test(input.toDayKey)) {
    return { days: [] };
  }

  const result = await getPublicAvailability({
    slug: input.slug,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    locationId: input.locationId ?? null,
    fromDayKey: input.fromDayKey,
    toDayKey: input.toDayKey,
    now: new Date(),
    // min-lead comes from the business's Form Designer settings (server-side).
  });
  if (!result) return { days: [] };

  return {
    days: result.days.map((d) => ({
      dayKey: d.dayKey,
      slots: d.slots.map((s) => ({ startISO: s.startISO, employeeIds: s.employeeIds })),
    })),
  };
}

export type PublicBookingResult =
  | { ok: true; confirmation: PublicBookingConfirmation }
  | { ok: false; error: string };

export async function submitPublicBooking(input: {
  slug: string;
  serviceId: string;
  employeeId: string | null;
  locationId?: string | null;
  dayKey: string;
  time: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  customerAddress?: string | null;
  customFields?: Record<string, string> | null;
}): Promise<PublicBookingResult> {
  try {
    const confirmation = await createPublicBooking({
      slug: input.slug,
      serviceId: input.serviceId,
      employeeId: input.employeeId,
      locationId: input.locationId ?? null,
      dayKey: input.dayKey,
      time: input.time,
      customer: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
      },
      notes: input.notes,
      customerAddress: input.customerAddress ?? null,
      customFields: input.customFields ?? null,
    });
    return { ok: true, confirmation };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    logger.error('public.booking.failed', { slug: input.slug, message: (error as Error)?.message });
    return { ok: false, error: 'Something went wrong creating your booking. Please try again.' };
  }
}
