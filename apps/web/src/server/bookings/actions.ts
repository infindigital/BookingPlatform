'use server';

import { revalidatePath } from 'next/cache';
import type { BookingStatus } from '@booking/db';
import { setBookingStatus, writeAudit } from '@booking/db';
import { DomainError } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

/**
 * Pending-approval actions for the dashboard queue.
 *
 * Real, permission-gated, tenant-scoped and audited. Domain errors (booking
 * already decided by another admin, or gone) are treated as benign: we simply
 * refresh the view so the queue reflects the current truth, instead of throwing
 * an error page. Unexpected errors still propagate.
 */
async function transition(
  bookingId: string,
  next: BookingStatus,
  allowedFrom: BookingStatus[],
  auditAction: string,
): Promise<void> {
  const session = await requirePermission('booking.approve');
  const businessId = session.user.businessId;

  try {
    const result = await setBookingStatus(businessId, bookingId, next, allowedFrom);
    await writeAudit({
      businessId,
      actorUserId: session.user.id,
      action: auditAction,
      entity: 'Booking',
      entityId: result.id,
      metadata: { from: result.from, to: result.to },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      logger.info('booking.transition.skipped', { bookingId, code: error.code });
    } else {
      throw error;
    }
  }

  revalidatePath('/admin');
}

export async function approveBooking(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  await transition(bookingId, 'ACCEPTED', ['PENDING'], 'booking.approve');
}

export async function rejectBooking(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  await transition(bookingId, 'REJECTED', ['PENDING'], 'booking.reject');
}
