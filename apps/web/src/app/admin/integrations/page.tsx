import type { Metadata } from 'next';
import { getWebhookList, getWebhookDeliveries, businessRepository } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { IntegrationsWorkspace } from '@/components/integrations/integrations-workspace';

export const metadata: Metadata = { title: 'Integrations' };

export default async function IntegrationsPage() {
  const session = await requirePermission('settings.manage');
  const businessId = session.user.businessId;

  const [business, webhooks, deliveries] = await Promise.all([
    businessRepository.getById(businessId),
    getWebhookList(businessId),
    getWebhookDeliveries(businessId, { limit: 60 }),
  ]);

  return <IntegrationsWorkspace webhooks={webhooks} deliveries={deliveries} timeZone={business?.timezone || 'UTC'} />;
}
