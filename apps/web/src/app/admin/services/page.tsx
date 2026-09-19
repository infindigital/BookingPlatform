import type { Metadata } from 'next';
import { hasPermission } from '@booking/core';
import { getServicesOverview } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { ServicesWorkspace } from '@/components/services/services-workspace';

export const metadata: Metadata = { title: 'Services' };

export default async function ServicesPage() {
  const session = await requirePermission('service.manage');
  const businessId = session.user.businessId;
  const canReset = hasPermission(session.user.permissions, 'settings.manage');

  const overview = await getServicesOverview(businessId);

  return (
    <ServicesWorkspace
      services={overview.services}
      categories={overview.categories}
      currency={overview.currency}
      canReset={canReset}
    />
  );
}
