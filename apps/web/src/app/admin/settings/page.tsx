import type { Metadata } from 'next';
import { repositoriesFor } from '@booking/db';
import { resolveWeeklyHours } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { SettingsWorkspace } from '@/components/settings/settings-workspace';

export const metadata: Metadata = { title: 'Settings' };

function supported(kind: 'timeZone' | 'currency'): string[] {
  try {
    // Node 18+/modern browsers expose the CLDR lists via Intl - no dependency.
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(kind);
  } catch {
    return [];
  }
}

export default async function SettingsPage() {
  const session = await requirePermission('settings.manage');
  const repos = repositoriesFor(session.user.businessId);

  const [business, locations, hoursRows, holidays] = await Promise.all([
    repos.settings.getBusiness(),
    repos.settings.listLocations(),
    repos.settings.getBusinessHours(),
    repos.settings.listHolidays(),
  ]);

  const profile = {
    name: business?.name ?? '',
    timezone: business?.timezone ?? 'UTC',
    currency: business?.currency ?? 'USD',
    email: business?.email ?? null,
    phone: business?.phone ?? null,
  };

  const week = resolveWeeklyHours(hoursRows);
  const locationViews = locations.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    timezone: l.timezone,
    isActive: l.isActive,
  }));

  return (
    <SettingsWorkspace
      profile={profile}
      locations={locationViews}
      week={week}
      holidays={holidays}
      timezones={supported('timeZone')}
      currencies={supported('currency')}
    />
  );
}
