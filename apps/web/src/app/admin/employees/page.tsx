import type { Metadata } from 'next';
import { hasPermission } from '@booking/core';
import { businessRepository, getEmployeesList } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { EmployeesWorkspace } from '@/components/employees/employees-workspace';

export const metadata: Metadata = { title: 'Employees' };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; inactive?: string }>;
}) {
  const session = await requirePermission('employee.manage');
  const businessId = session.user.businessId;
  const canWrite = hasPermission(session.user.permissions, 'employee.manage');

  const sp = await searchParams;
  const search = sp.search?.trim() || '';
  const includeInactive = sp.inactive === '1';

  const [business, list] = await Promise.all([
    businessRepository.getById(businessId),
    getEmployeesList(businessId, { search: search || null, includeInactive }),
  ]);

  return (
    <EmployeesWorkspace
      rows={list.rows}
      total={list.total}
      search={search}
      includeInactive={includeInactive}
      timeZone={business?.timezone || 'UTC'}
      canWrite={canWrite}
    />
  );
}
