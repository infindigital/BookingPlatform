'use server';

import { getAnalytics, businessRepository, type AnalyticsResult } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';

export interface AnalyticsRange {
  fromDayKey: string;
  toDayKey: string;
}

/**
 * Load the analytics read model for a date range. Gated on `analytics.read` and
 * tenant-scoped; the timezone is resolved from the business so buckets align to
 * the business's local days.
 */
export async function loadAnalytics(range: AnalyticsRange): Promise<AnalyticsResult> {
  const session = await requirePermission('analytics.read');
  const business = await businessRepository.getById(session.user.businessId);
  return getAnalytics(session.user.businessId, {
    fromDayKey: range.fromDayKey,
    toDayKey: range.toDayKey,
    timeZone: business?.timezone || 'UTC',
  });
}
