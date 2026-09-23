import type { Metadata } from 'next';
import {
  businessRepository,
  getCalendarData,
  localWallClock,
  dateMidnightInstant,
} from '@booking/db';
import { addDays, rangeDays, weekDays } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { CalendarView, type CalendarViewMode } from '@/components/calendar/calendar-view';

export const metadata: Metadata = { title: 'Calendar' };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const AGENDA_DAYS = 14;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; employee?: string }>;
}) {
  const session = await requirePermission('booking.read');
  const business = await businessRepository.getById(session.user.businessId);
  const timeZone = business?.timezone || 'UTC';

  const now = new Date();
  const { dayKey: todayKey, minutes: nowMinutes } = localWallClock(now, timeZone);

  const sp = await searchParams;
  const view: CalendarViewMode = sp.view === 'day' || sp.view === 'agenda' ? sp.view : 'week';
  const date = sp.date && DAY_KEY.test(sp.date) ? sp.date : todayKey;
  const employeeId = sp.employee && sp.employee !== 'all' ? sp.employee : 'all';

  const days =
    view === 'day' ? [date] : view === 'agenda' ? rangeDays(date, AGENDA_DAYS) : weekDays(date);

  const start = dateMidnightInstant(days[0]!, timeZone);
  const end = dateMidnightInstant(addDays(days[days.length - 1]!, 1), timeZone);

  const data = await getCalendarData(session.user.businessId, {
    start,
    end,
    timeZone,
    employeeId: employeeId === 'all' ? null : employeeId,
    days,
  });

  return (
    <CalendarView
      view={view}
      date={date}
      days={days}
      bookings={data.bookings}
      employees={data.employees}
      services={data.services}
      off={data.off}
      employeeId={employeeId}
      timeZone={timeZone}
      todayKey={todayKey}
      nowMinutes={nowMinutes}
    />
  );
}
