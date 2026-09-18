import type { Metadata } from 'next';
import { getNotificationTemplates, getNotificationActivity, businessRepository } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { NotificationsWorkspace } from '@/components/notifications/notifications-workspace';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const session = await requirePermission('settings.manage');
  const businessId = session.user.businessId;

  const [business, templates, activity] = await Promise.all([
    businessRepository.getById(businessId),
    getNotificationTemplates(businessId),
    getNotificationActivity(businessId, { limit: 60 }),
  ]);

  return (
    <NotificationsWorkspace
      templates={templates}
      activity={activity}
      timeZone={business?.timezone || 'UTC'}
    />
  );
}
