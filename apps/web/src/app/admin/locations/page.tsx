import type { Metadata } from 'next';
import { getLocationsOverview } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { LocationsWorkspace } from '@/components/locations/locations-workspace';
import { LocationNotices } from '@/components/locations/location-notices';

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

  return (
    <div className="space-y-10">
      <LocationsWorkspace
        locations={overview.locations}
        timezones={supportedTimezones()}
        services={overview.services}
        employees={overview.employees}
      />
      <LocationNotices
        notices={overview.notices}
        locations={overview.locations.map((l) => ({ id: l.id, name: l.name }))}
      />
    </div>
  );
}
