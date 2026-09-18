import type { Metadata } from 'next';
import { getAnalytics, businessRepository } from '@booking/db';
import { addDays } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { AnalyticsWorkspace } from '@/components/analytics/analytics-workspace';

export const metadata: Metadata = { title: 'Analytics' };

/** Today's civil day key in a timezone, via built-in Intl (no date library). */
function todayDayKey(timeZone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function AnalyticsPage() {
  const session = await requirePermission('analytics.read');
  const business = await businessRepository.getById(session.user.businessId);
  const timeZone = business?.timezone || 'UTC';
  const currency = business?.currency || 'USD';

  const today = todayDayKey(timeZone);
  const from = addDays(today, -29); // last 30 days inclusive

  const initial = await getAnalytics(session.user.businessId, { fromDayKey: from, toDayKey: today, timeZone });

  return <AnalyticsWorkspace initial={initial} currency={currency} today={today} />;
}
