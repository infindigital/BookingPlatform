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

  const [business, hoursRows, holidays, specialDays, locationRows] = await Promise.all([
    repos.settings.getBusiness(),
    repos.settings.getBusinessHours(),
    repos.settings.listHolidays(),
    repos.settings.listSpecialDays(),
    repos.settings.listLocations(),
  ]);
  const locations = locationRows.map((l) => ({ id: l.id, name: l.name }));

  const profile = {
    name: business?.name ?? '',
    timezone: business?.timezone ?? 'UTC',
    currency: business?.currency ?? 'USD',
    email: business?.email ?? null,
    phone: business?.phone ?? null,
  };

  const week = resolveWeeklyHours(hoursRows);

  return (
    <SettingsWorkspace
      profile={profile}
      week={week}
      holidays={holidays}
      specialDays={specialDays}
      locations={locations}
      timezones={supported('timeZone')}
      currencies={supported('currency')}
    />
  );
}
