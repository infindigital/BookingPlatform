'use server';

import {
  businessRepository,
  getServicesOverview,
  getEmployeesList,
  getEmployeeDetail,
  getAvailability,
  loadResolvedForm,
} from '@booking/db';
import { WEEKDAYS, addDays, resolveWeeklyHours } from '@booking/core';
import { repositoriesFor } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

/**
 * Read-only availability diagnostic for the admin. It answers "why does the
 * booking form show these dates/times?" by laying the real inputs side by side:
 * the business timezone and current time, office hours, each service's booking
 * rules, each employee's weekly working hours and service assignments, and the
 * computed slot count per day for the next two weeks - exactly what the customer
 * booking page calculates. Nothing here writes to the database.
 */

export interface DiagDaySlots {
  dayKey: string;
  weekday: string;
  count: number;
  first: string | null;
  last: string | null;
}

export interface DiagService {
  id: string;
  name: string;
  isActive: boolean;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number | null;
  slotIntervalMinutes: number | null;
  employeeCount: number;
  days: DiagDaySlots[];
  totalSlots: number;
}

export interface DiagEmployee {
  id: string;
  name: string;
  isActive: boolean;
  serviceNames: string[];
  week: { day: string; blocks: string[] }[];
}

export interface DiagOfficeDay {
  day: string;
  isClosed: boolean;
  open: string | null;
  close: string | null;
}

export interface AvailabilityDiagnostic {
  ok: boolean;
  error?: string;
  now?: string; // formatted in business tz
  timeZone?: string;
  minLeadMinutes?: number;
  office?: DiagOfficeDay[];
  services?: DiagService[];
  employees?: DiagEmployee[];
}

const HORIZON_DAYS = 14;

function fmtTime(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(11, 16);
  }
}

function fmtNow(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(now);
  } catch {
    return now.toISOString();
  }
}

/** Today's YYYY-MM-DD in the given timezone. */
function todayKeyInTz(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

const WEEKDAY_LABEL = (dayKey: string): string => {
  const [y, m, d] = dayKey.split('-').map(Number);
  const idx = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return WEEKDAYS.find((w) => w.value === idx)?.short ?? '';
};

export async function runAvailabilityDiagnostic(): Promise<AvailabilityDiagnostic> {
  const session = await requirePermission('settings.manage');
  const businessId = session.user.businessId;

  try {
    const business = await businessRepository.getById(businessId);
    const timeZone = business?.timezone || 'UTC';
    const now = new Date();
    const repos = repositoriesFor(businessId);

    const [overview, hoursRows, resolvedForm, empList] = await Promise.all([
      getServicesOverview(businessId),
      repos.settings.getBusinessHours(),
      loadResolvedForm(businessId),
      getEmployeesList(businessId, { search: null, includeInactive: true }),
    ]);
    const minLeadMinutes = resolvedForm.settings.minLeadMinutes;

    // Office hours, one row per weekday.
    const week = resolveWeeklyHours(hoursRows);
    const office: DiagOfficeDay[] = WEEKDAYS.map((w) => {
      const row = week.find((r) => r.dayOfWeek === w.value);
      return {
        day: w.label,
        isClosed: !row || row.isClosed,
        open: row && !row.isClosed ? row.openTime : null,
        close: row && !row.isClosed ? row.closeTime : null,
      };
    });

    // Employee weekly hours + service assignments.
    const employees: DiagEmployee[] = [];
    for (const e of empList.rows) {
      const detail = await getEmployeeDetail(businessId, e.id);
      const byDay = WEEKDAYS.map((w) => {
        const rows = (detail?.schedule ?? []).filter((s) => s.dayOfWeek === w.value);
        return {
          day: w.short,
          blocks: rows.map((r) => `${r.startTime}-${r.endTime}`),
        };
      });
      employees.push({
        id: e.id,
        name: e.name,
        isActive: e.isActive,
        serviceNames: (detail?.services ?? []).filter((s) => s.assigned).map((s) => s.name),
        week: byDay,
      });
    }

    // Availability per service for the next two weeks (any employee, with the
    // same min-lead the customer page uses).
    const fromDayKey = todayKeyInTz(timeZone);
    const toDayKey = addDays(fromDayKey, HORIZON_DAYS - 1);
    const services: DiagService[] = [];
    for (const s of overview.services) {
      const result = await getAvailability(businessId, {
        serviceId: s.id,
        employeeId: null,
        fromDayKey,
        toDayKey,
        timeZone,
        now,
        minLeadMinutes,
      });
      const days: DiagDaySlots[] = result.days.map((d) => ({
        dayKey: d.dayKey,
        weekday: WEEKDAY_LABEL(d.dayKey),
        count: d.slots.length,
        first: d.slots.length ? fmtTime(d.slots[0]!.startISO, timeZone) : null,
        last: d.slots.length ? fmtTime(d.slots[d.slots.length - 1]!.startISO, timeZone) : null,
      }));
      services.push({
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        durationMinutes: s.durationMinutes,
        bufferBeforeMinutes: s.bufferBeforeMinutes,
        bufferAfterMinutes: s.bufferAfterMinutes,
        minAdvanceMinutes: s.minAdvanceMinutes,
        maxAdvanceDays: s.maxAdvanceDays,
        slotIntervalMinutes: s.slotIntervalMinutes,
        employeeCount: s.employeeCount,
        days,
        totalSlots: days.reduce((n, d) => n + d.count, 0),
      });
    }

    return {
      ok: true,
      now: fmtNow(now, timeZone),
      timeZone,
      minLeadMinutes,
      office,
      services,
      employees,
    };
  } catch (error) {
    logger.error('settings.availabilityDiagnostic.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not run the availability check. Please try again.' };
  }
}
