'use server';

import {
  lookupCustomerBookings,
  cancelOwnBooking,
  rescheduleOwnBooking,
  type ManageLookupResult,
} from '@booking/db';
import { DomainError } from '@booking/core';
import { logger } from '@/lib/logger';

/**
 * Public self-service actions for /book/[slug]/manage. Unauthenticated, but every
 * call re-verifies ownership via (email + reference) inside the data layer - the
 * client is never trusted with a customerId.
 */

export type ManageLookupState =
  | { ok: true; result: ManageLookupResult; email: string; reference: string }
  | { ok: false; error: string };

export async function lookupBookingsAction(input: {
  slug: string;
  email: string;
  reference: string;
}): Promise<ManageLookupState> {
  const result = await lookupCustomerBookings(input.slug, input.email, input.reference);
  if (!result) {
    return { ok: false, error: 'We couldn’t find a booking for that email and reference. Please check and try again.' };
  }
  return { ok: true, result, email: input.email.trim().toLowerCase(), reference: input.reference.trim().toUpperCase() };
}

export type ManageActionState = { ok: boolean; error?: string; result?: ManageLookupResult };

export async function cancelBookingAction(input: {
  slug: string;
  email: string;
  reference: string;
  bookingId: string;
}): Promise<ManageActionState> {
  try {
    await cancelOwnBooking(input.slug, input.email, input.reference, input.bookingId);
    const result = await lookupCustomerBookings(input.slug, input.email, input.reference);
    return { ok: true, result: result ?? undefined };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    logger.error('public.cancel.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Something went wrong cancelling your booking. Please try again.' };
  }
}

export async function rescheduleBookingAction(input: {
  slug: string;
  email: string;
  reference: string;
  bookingId: string;
  dayKey: string;
  time: string;
}): Promise<ManageActionState> {
  try {
    await rescheduleOwnBooking(input.slug, input.email, input.reference, input.bookingId, input.dayKey, input.time);
    const result = await lookupCustomerBookings(input.slug, input.email, input.reference);
    return { ok: true, result: result ?? undefined };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    logger.error('public.reschedule.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Something went wrong rescheduling. Please try again.' };
  }
}
