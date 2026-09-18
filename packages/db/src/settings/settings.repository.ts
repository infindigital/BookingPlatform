import {
  ValidationError,
  resolveBusinessProfile,
  resolveLocationInput,
  toStorableHours,
  type BusinessProfileInput,
  type BusinessProfile,
  type LocationInput,
  type DayHours,
} from '@booking/core';
import { BaseRepository } from '../repositories/base';
import { dateMidnightInstant, localWallClock } from '../dashboard/timezone';

export interface HolidayInput {
  name: string;
  /** "YYYY-MM-DD" in the business timezone. */
  dayKey: string;
  recurringYearly?: boolean;
}

export interface HolidayRow {
  id: string;
  name: string;
  dayKey: string;
  recurringYearly: boolean;
}

export interface DeleteResult {
  ok: boolean;
  reason?: 'not_found';
}

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Validate & canonicalise a "YYYY-MM-DD" day key (must be a real calendar date). */
function normalizeDayKey(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  const m = DAY_KEY_RE.exec(v);
  if (!m) throw new ValidationError('A valid date is required.');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new ValidationError('That date is not valid.');
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new ValidationError('That date is not valid.');
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Business-scoped settings data access: the tenant profile, its locations, its
 * weekly opening hours, and its holidays/closures. All reads and writes are
 * tenant-scoped; profile/location input is validated through the pure-core
 * resolvers so the same rules apply from any caller.
 */
export class SettingsRepository extends BaseRepository {
  // --- Business profile -----------------------------------------------------

  getBusiness() {
    return this.db.business.findUnique({ where: { id: this.businessId } });
  }

  async getTimezone(): Promise<string> {
    const biz = await this.db.business.findUnique({ where: { id: this.businessId }, select: { timezone: true } });
    return biz?.timezone || 'UTC';
  }

  async updateBusinessProfile(input: BusinessProfileInput): Promise<BusinessProfile> {
    const profile = resolveBusinessProfile(input);
    await this.db.business.update({
      where: { id: this.businessId },
      data: {
        name: profile.name,
        timezone: profile.timezone,
        currency: profile.currency,
        email: profile.email,
        phone: profile.phone,
      },
    });
    return profile;
  }

  // --- Locations ------------------------------------------------------------

  listLocations() {
    return this.db.location.findMany({
      where: this.scope(),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async createLocation(input: LocationInput) {
    const l = resolveLocationInput(input);
    return this.db.location.create({
      data: { businessId: this.businessId, name: l.name, address: l.address, timezone: l.timezone, isActive: l.isActive },
    });
  }

  async updateLocation(id: string, input: LocationInput) {
    const l = resolveLocationInput(input);
    return this.db.location.updateMany({
      where: this.scope({ id }),
      data: { name: l.name, address: l.address, timezone: l.timezone, isActive: l.isActive },
    });
  }

  setLocationActive(id: string, isActive: boolean) {
    return this.db.location.updateMany({ where: this.scope({ id }), data: { isActive } });
  }

  /** Delete a location, but never one that still has bookings (preserve history). */
  async deleteLocation(id: string): Promise<DeleteResult> {
    const owned = await this.db.location.findFirst({ where: this.scope({ id }), select: { id: true } });
    if (!owned) return { ok: false, reason: 'not_found' };
    const bookingCount = await this.db.booking.count({ where: this.scope({ locationId: id }) });
    if (bookingCount > 0) {
      throw new ValidationError('This location has bookings. Deactivate it instead of deleting.');
    }
    await this.db.location.delete({ where: { id } });
    return { ok: true };
  }

  // --- Weekly opening hours (business-wide: locationId = null) --------------

  getBusinessHours(locationId: string | null = null) {
    return this.db.businessHours.findMany({
      where: this.scope({ locationId }),
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  /** Replace the whole week atomically so availability always reflects saved state. */
  async replaceBusinessHours(week: DayHours[], locationId: string | null = null): Promise<DayHours[]> {
    const rows = toStorableHours(week);
    await this.db.$transaction(async (tx) => {
      await tx.businessHours.deleteMany({ where: { businessId: this.businessId, locationId } });
      if (rows.length) {
        await tx.businessHours.createMany({
          data: rows.map((r) => ({
            businessId: this.businessId,
            locationId,
            dayOfWeek: r.dayOfWeek,
            openTime: r.openTime,
            closeTime: r.closeTime,
            isClosed: r.isClosed,
          })),
        });
      }
    });
    return rows;
  }

  // --- Holidays / closures --------------------------------------------------

  async listHolidays(): Promise<HolidayRow[]> {
    const tz = await this.getTimezone();
    const rows = await this.db.holiday.findMany({ where: this.scope(), orderBy: { date: 'asc' } });
    return rows.map((h) => ({
      id: h.id,
      name: h.name,
      dayKey: localWallClock(h.date, tz).dayKey,
      recurringYearly: h.recurringYearly,
    }));
  }

  async createHoliday(input: HolidayInput) {
    const dayKey = normalizeDayKey(input.dayKey);
    const name = (input.name ?? '').trim();
    if (!name) throw new ValidationError('A holiday name is required.');
    const tz = await this.getTimezone();
    return this.db.holiday.create({
      data: {
        businessId: this.businessId,
        name: name.slice(0, 200),
        date: dateMidnightInstant(dayKey, tz),
        recurringYearly: input.recurringYearly === true,
      },
    });
  }

  async updateHoliday(id: string, input: HolidayInput) {
    const dayKey = normalizeDayKey(input.dayKey);
    const name = (input.name ?? '').trim();
    if (!name) throw new ValidationError('A holiday name is required.');
    const tz = await this.getTimezone();
    return this.db.holiday.updateMany({
      where: this.scope({ id }),
      data: {
        name: name.slice(0, 200),
        date: dateMidnightInstant(dayKey, tz),
        recurringYearly: input.recurringYearly === true,
      },
    });
  }

  deleteHoliday(id: string) {
    return this.db.holiday.deleteMany({ where: this.scope({ id }) });
  }
}
