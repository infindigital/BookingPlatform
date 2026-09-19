import type { Metadata } from 'next';
import { getLocationsOverview } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { LocationsWorkspace } from '@/components/locations/locations-workspace';

export const metadata: Metadata = { title: 'Locations' };

function supportedTimezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

export default async function LocationsPage() {
  const session = await requirePermission('settings.manage');
  const overview = await getLocationsOverview(session.user.businessId);

  return <LocationsWorkspace locations={overview.locations} timezones={supportedTimezones()} />;
}
