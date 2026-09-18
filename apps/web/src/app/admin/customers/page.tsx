import type { Metadata } from 'next';
import { hasPermission } from '@booking/core';
import { businessRepository, getCustomersList } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { CustomersWorkspace } from '@/components/customers/customers-workspace';

export const metadata: Metadata = { title: 'Customers' };

const PAGE_SIZE = 20;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const session = await requirePermission('customer.manage');
  const businessId = session.user.businessId;
  const canWrite = hasPermission(session.user.permissions, 'customer.manage');

  const sp = await searchParams;
  const search = sp.search?.trim() || '';
  const page = Math.max(1, Number(sp.page ?? '1') || 1);

  const [business, list] = await Promise.all([
    businessRepository.getById(businessId),
    getCustomersList(businessId, { search: search || null, page, pageSize: PAGE_SIZE }),
  ]);

  return (
    <CustomersWorkspace
      rows={list.rows}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      search={search}
      timeZone={business?.timezone || 'UTC'}
      canWrite={canWrite}
    />
  );
}
