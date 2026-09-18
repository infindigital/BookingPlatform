import type { Metadata } from 'next';
import { getPaymentsList, loadPaymentSettings, businessRepository } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { PaymentsWorkspace } from '@/components/payments/payments-workspace';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage() {
  const session = await requirePermission('payment.manage');
  const businessId = session.user.businessId;

  const [business, list, settings] = await Promise.all([
    businessRepository.getById(businessId),
    getPaymentsList(businessId, { pageSize: 25 }),
    loadPaymentSettings(businessId),
  ]);

  return (
    <PaymentsWorkspace
      initial={list}
      settings={settings}
      currency={business?.currency || settings.currency || 'USD'}
      timeZone={business?.timezone || 'UTC'}
    />
  );
}
