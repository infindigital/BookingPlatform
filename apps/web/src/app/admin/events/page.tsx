import type { Metadata } from 'next';
import { getEventsList, repositoriesFor, businessRepository } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { EventsWorkspace } from '@/components/events/events-workspace';

export const metadata: Metadata = { title: 'Events' };

function todayDayKey(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function EventsPage() {
  const session = await requirePermission('event.manage');
  const businessId = session.user.businessId;
  const repos = repositoriesFor(businessId);

  const [events, locations, employees, business] = await Promise.all([
    getEventsList(businessId, { includeCancelled: true }),
    repos.settings.listLocations(),
    repos.employees.list({ includeInactive: false }),
    businessRepository.getById(businessId),
  ]);

  const timeZone = business?.timezone || 'UTC';

  return (
    <EventsWorkspace
      initial={events}
      locations={locations.filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name }))}
      employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))}
      currency={business?.currency || 'USD'}
      timeZone={timeZone}
      today={todayDayKey(timeZone)}
    />
  );
}
