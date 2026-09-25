import {
  ValidationError,
  resolveBusinessProfile,
  resolveLocationInput,
  toStorableHours,
  NOTIFICATION_EVENTS,
  defaultTemplate,
  type BusinessProfileInput,
  type BusinessProfile,
  type LocationInput,
  type DayHours,
} from '@booking/core';
import type { NotificationChannel, NotificationEvent } from '@prisma/client';
import { BaseRepository } from '../repositories/base';
import { dateMidnightInstant, localWallClock } from '../dashboard/timezone';
import { encryptSecret, decryptSecret, encryptionAvailable } from '../security/crypto';

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

export interface SpecialDayInput {
  /** "YYYY-MM-DD" in the business timezone. */
  dayKey: string;
  name?: string | null;
  /** When true, the business (or location) is closed that date. */
  isClosed?: boolean;
  /** "HH:mm" open/close, required when not closed. */
  openTime?: string | null;
  closeTime?: string | null;
  /** Null -> business-wide; otherwise scoped to one location. */
  locationId?: string | null;
}

export interface SpecialDayRow {
  id: string;
  dayKey: string;
  name: string | null;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  locationId: string | null;
  locationName: string | null;
}

/** Masked SMS provider status for the admin UI (never includes the token). */
export interface SmsSettingsStatus {
  /** True once an account SID + from-number + saved token are all present. */
  configured: boolean;
  isEnabled: boolean;
  provider: string;
  accountSid: string | null;
  fromNumber: string | null;
  /** Whether an auth token is stored (so the form can show "unchanged"). */
  hasToken: boolean;
}

/** Decrypted SMS credentials, for the provider at send time. */
export interface SmsCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface SmsSettingsInput {
  accountSid: string | null;
  /** Plaintext; when null/blank the stored token is kept unchanged. */
  authToken: string | null;
  fromNumber: string | null;
  isEnabled: boolean;
}

export interface RecipientInput {
  name: string | null;
  email: string | null;
  phone: string | null;
  channels: NotificationChannel[];
  events: NotificationEvent[];
  isActive?: boolean;
}

export interface RecipientRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  channels: NotificationChannel[];
  events: NotificationEvent[];
  isActive: boolean;
}

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

/** Validate & canonicalise a "HH:mm" clock time. */
function normalizeHHMM(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  const m = HHMM_RE.exec(v);
  if (!m) throw new ValidationError('A valid time (HH:mm) is required.');
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new ValidationError('That time is not valid.');
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

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
      // When saving the business-wide week (locationId = null), also drop any
      // location-scoped opening-hours rows. The app has no per-location hours
      // editor, so such rows only exist from older seeds; leaving them behind
      // would keep the customer booking form on hidden hours the admin can never
      // edit (the availability engine prefers a location's own rows over the
      // business-wide set). Clearing them makes this saved week the single source
      // of truth for every location.
      const deleteWhere =
        locationId === null
          ? { businessId: this.businessId }
          : { businessId: this.businessId, locationId };
      await tx.businessHours.deleteMany({ where: deleteWhere });
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

  // --- Special days (date-specific hours / closures) ------------------------

  async listSpecialDays(): Promise<SpecialDayRow[]> {
    const tz = await this.getTimezone();
    const rows = await this.db.specialDay.findMany({
      where: this.scope(),
      orderBy: { date: 'asc' },
      include: { location: { select: { name: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      dayKey: localWallClock(s.date, tz).dayKey,
      name: s.name,
      isClosed: s.isClosed,
      openTime: s.openTime,
      closeTime: s.closeTime,
      locationId: s.locationId,
      locationName: s.location?.name ?? null,
    }));
  }

  /** Resolve the validated fields for a special day, or throw. */
  private async resolveSpecialDay(input: SpecialDayInput) {
    const dayKey = normalizeDayKey(input.dayKey);
    const isClosed = input.isClosed === true;
    let openTime: string | null = null;
    let closeTime: string | null = null;
    if (!isClosed) {
      openTime = normalizeHHMM(input.openTime);
      closeTime = normalizeHHMM(input.closeTime);
      if (closeTime <= openTime) throw new ValidationError('The closing time must be after the opening time.');
    }
    // A location id, when given, must belong to this tenant.
    let locationId: string | null = input.locationId?.trim() || null;
    if (locationId) {
      const owned = await this.db.location.findFirst({ where: this.scope({ id: locationId }), select: { id: true } });
      if (!owned) throw new ValidationError('That location could not be found.');
    }
    const tz = await this.getTimezone();
    return {
      dayKey,
      isClosed,
      openTime,
      closeTime,
      locationId,
      name: (input.name ?? '').trim().slice(0, 200) || null,
      date: dateMidnightInstant(dayKey, tz),
    };
  }

  async createSpecialDay(input: SpecialDayInput) {
    const v = await this.resolveSpecialDay(input);
    return this.db.specialDay.create({
      data: {
        businessId: this.businessId,
        locationId: v.locationId,
        date: v.date,
        name: v.name,
        isClosed: v.isClosed,
        openTime: v.openTime,
        closeTime: v.closeTime,
      },
    });
  }

  async updateSpecialDay(id: string, input: SpecialDayInput) {
    const v = await this.resolveSpecialDay(input);
    return this.db.specialDay.updateMany({
      where: this.scope({ id }),
      data: {
        locationId: v.locationId,
        date: v.date,
        name: v.name,
        isClosed: v.isClosed,
        openTime: v.openTime,
        closeTime: v.closeTime,
      },
    });
  }

  deleteSpecialDay(id: string) {
    return this.db.specialDay.deleteMany({ where: this.scope({ id }) });
  }

  // --- SMS provider (Twilio) settings ---------------------------------------

  /** Masked status for the admin UI. Never exposes the stored auth token. */
  async getSmsSettingsStatus(): Promise<SmsSettingsStatus> {
    const row = await this.db.smsSettings.findUnique({ where: { businessId: this.businessId } });
    const hasToken = !!row?.authTokenCipher;
    return {
      configured: !!(row?.accountSid && row?.fromNumber && hasToken),
      isEnabled: row?.isEnabled ?? false,
      provider: row?.provider ?? 'twilio',
      accountSid: row?.accountSid ?? null,
      fromNumber: row?.fromNumber ?? null,
      hasToken,
    };
  }

  /** Decrypted credentials for the SMS provider, or null when not fully set up. */
  async getSmsCredentials(): Promise<SmsCredentials | null> {
    const row = await this.db.smsSettings.findUnique({ where: { businessId: this.businessId } });
    if (!row || !row.isEnabled || !row.accountSid || !row.fromNumber || !row.authTokenCipher) return null;
    const authToken = decryptSecret(row.authTokenCipher);
    if (!authToken) return null;
    return { accountSid: row.accountSid, authToken, fromNumber: row.fromNumber };
  }

  async saveSmsSettings(input: SmsSettingsInput): Promise<void> {
    const accountSid = input.accountSid?.trim() || null;
    const fromNumber = input.fromNumber?.trim() || null;
    const newToken = input.authToken?.trim() || null;

    // Only touch the ciphertext when a new token was supplied; encrypting needs a key.
    let cipherUpdate: string | undefined;
    if (newToken) {
      if (!encryptionAvailable()) {
        throw new ValidationError('Set ENCRYPTION_KEY (or AUTH_SECRET) before saving an SMS auth token.');
      }
      cipherUpdate = encryptSecret(newToken);
    }

    await this.db.smsSettings.upsert({
      where: { businessId: this.businessId },
      create: {
        businessId: this.businessId,
        provider: 'twilio',
        accountSid,
        fromNumber,
        isEnabled: input.isEnabled,
        authTokenCipher: cipherUpdate ?? null,
      },
      update: {
        accountSid,
        fromNumber,
        isEnabled: input.isEnabled,
        ...(cipherUpdate !== undefined ? { authTokenCipher: cipherUpdate } : {}),
      },
    });

    // Keep the SMS templates in step with the toggle so enabling SMS actually
    // enqueues SMS jobs (a channel only fires when it has an active template).
    await this.syncSmsTemplates(input.isEnabled);
  }

  /** Ensure a default, (de)activated SMS template exists for every event. */
  private async syncSmsTemplates(active: boolean): Promise<void> {
    for (const meta of NOTIFICATION_EVENTS) {
      const def = defaultTemplate(meta.event);
      await this.db.notificationTemplate.upsert({
        where: { businessId_event_channel: { businessId: this.businessId, event: meta.event, channel: 'SMS' } },
        create: { businessId: this.businessId, event: meta.event, channel: 'SMS', subject: null, body: def.body, isActive: active },
        update: { isActive: active },
      });
    }
  }

  // --- Notification recipients (internal) -----------------------------------

  async listRecipients(): Promise<RecipientRow[]> {
    const rows = await this.db.notificationRecipient.findMany({
      where: this.scope(),
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      channels: r.channels,
      events: r.events,
      isActive: r.isActive,
    }));
  }

  private normaliseRecipient(input: RecipientInput) {
    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;
    if (!email && !phone) throw new ValidationError('A recipient needs an email address or a phone number.');
    return {
      name: input.name?.trim().slice(0, 160) || null,
      email: email?.slice(0, 200) ?? null,
      phone: phone?.slice(0, 40) ?? null,
      channels: input.channels,
      events: input.events,
      isActive: input.isActive ?? true,
    };
  }

  createRecipient(input: RecipientInput) {
    const v = this.normaliseRecipient(input);
    return this.db.notificationRecipient.create({ data: { businessId: this.businessId, ...v } });
  }

  updateRecipient(id: string, input: RecipientInput) {
    const v = this.normaliseRecipient(input);
    return this.db.notificationRecipient.updateMany({ where: this.scope({ id }), data: v });
  }

  deleteRecipient(id: string) {
    return this.db.notificationRecipient.deleteMany({ where: this.scope({ id }) });
  }
}
