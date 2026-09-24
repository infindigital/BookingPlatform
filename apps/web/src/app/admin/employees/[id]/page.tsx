import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasPermission } from '@booking/core';
import { businessRepository, getEmployeeDetail } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { EmployeeDetailPage } from '@/components/employees/employee-detail-page';

export const metadata: Metadata = { title: 'Team member' };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('employee.manage');
  const { id } = await params;
  const canWrite = hasPermission(session.user.permissions, 'employee.manage');

  const [business, detail] = await Promise.all([
    businessRepository.getById(session.user.businessId),
    getEmployeeDetail(session.user.businessId, id),
  ]);
  if (!detail) notFound();

  return <EmployeeDetailPage detail={detail} timeZone={business?.timezone || 'UTC'} canWrite={canWrite} />;
}
