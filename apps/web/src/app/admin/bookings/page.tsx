import type { Metadata } from 'next';
import type { BookingStatus } from '@booking/db';
import { hasPermission } from '@booking/core';
import { businessRepository, getBookingsList, getBookingFormData } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { BookingsWorkspace } from '@/components/bookings/bookings-workspace';

export const metadata: Metadata = { title: 'Bookings' };

const STATUSES: BookingStatus[] = [
  'PENDING',
  'ACCEPTED',
  'RESCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'NO_SHOW',
];

const PAGE_SIZE = 20;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    employee?: string;
    when?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const session = await requirePermission('booking.read');
  const businessId = session.user.businessId;
  const canApprove = hasPermission(session.user.permissions, 'booking.approve');
  const canWrite = hasPermission(session.user.permissions, 'booking.write');

  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as BookingStatus) ? (sp.status as BookingStatus) : 'all';
  const employeeId = sp.employee && sp.employee !== 'all' ? sp.employee : 'all';
  const when = sp.when === 'upcoming' || sp.when === 'past' ? sp.when : 'all';
  const search = sp.search?.trim() || '';
  const page = Math.max(1, Number(sp.page ?? '1') || 1);

  const now = new Date();
  const from = when === 'upcoming' ? now : null;
  const to = when === 'past' ? now : null;

  const [business, list, formData] = await Promise.all([
    businessRepository.getById(businessId),
    getBookingsList(businessId, {
      status,
      employeeId: employeeId === 'all' ? null : employeeId,
      from,
      to,
      search: search || null,
      page,
      pageSize: PAGE_SIZE,
    }),
    getBookingFormData(businessId),
  ]);

  const timeZone = business?.timezone || 'UTC';

  return (
    <BookingsWorkspace
      rows={list.rows}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      statusCounts={list.statusCounts}
      filters={{ status, employeeId, when, search }}
      formData={formData}
      timeZone={timeZone}
      canApprove={canApprove}
      canWrite={canWrite}
    />
  );
}
