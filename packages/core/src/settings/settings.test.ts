import { describe, it, expect } from 'vitest';
import {
  parseHHMM,
  minutesToHHMM,
  isValidHHMM,
  resolveWeeklyHours,
  toStorableHours,
  buildBusinessHoursConstraint,
  isValidTimeZone,
  resolveBusinessProfile,
  resolveLocationInput,
} from './index';
import { intersectSpans } from '../availability/index';
import { ValidationError } from '../errors';

describe('HH:mm helpers', () => {
  it('parses valid times and rejects malformed ones', () => {
    expect(parseHHMM('09:00')).toBe(540);
    expect(parseHHMM('24:00')).toBe(1440);
    expect(parseHHMM('9:30')).toBe(570);
    expect(parseHHMM('24:30')).toBeNull();
    expect(parseHHMM('25:00')).toBeNull();
    expect(parseHHMM('09:60')).toBeNull();
    expect(parseHHMM('noon')).toBeNull();
    expect(parseHHMM(null)).toBeNull();
  });

  it('formats minutes back to HH:mm and clamps', () => {
    expect(minutesToHHMM(540)).toBe('09:00');
    expect(minutesToHHMM(570)).toBe('09:30');
    expect(minutesToHHMM(-10)).toBe('00:00');
    expect(minutesToHHMM(99999)).toBe('24:00');
    expect(isValidHHMM('17:00')).toBe(true);
    expect(isValidHHMM('7pm')).toBe(false);
  });
});

describe('resolveWeeklyHours', () => {
  it('produces a canonical 7-day week with missing days closed', () => {
    const week = resolveWeeklyHours([{ dayOfWeek: 1, openTime: '08:00', closeTime: '16:00', isClosed: false }]);
    expect(week).toHaveLength(7);
    expect(week[0]).toMatchObject({ dayOfWeek: 0, isClosed: true });
    expect(week[1]).toMatchObject({ dayOfWeek: 1, isClosed: false, openTime: '08:00', closeTime: '16:00' });
  });

  it('repairs a malformed window to the default while keeping the closed flag', () => {
    const week = resolveWeeklyHours([{ dayOfWeek: 2, openTime: '18:00', closeTime: '09:00', isClosed: false }]);
    expect(week[2]).toMatchObject({ openTime: '09:00', closeTime: '17:00' });
  });

  it('keeps only storable rows (open windows + explicit closures)', () => {
    const week = resolveWeeklyHours([
      { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
      { dayOfWeek: 0, isClosed: true },
    ]);
    const storable = toStorableHours(week);
    // Sunday closed (stored) + Monday open (stored); Tue-Sat default-closed are also stored as closures.
    expect(storable.find((d) => d.dayOfWeek === 1)).toMatchObject({ isClosed: false });
    expect(storable.find((d) => d.dayOfWeek === 0)).toMatchObject({ isClosed: true });
  });
});

describe('buildBusinessHoursConstraint', () => {
  it('reports no constraint for an empty set', () => {
    const c = buildBusinessHoursConstraint([]);
    expect(c.hasAny).toBe(false);
    expect(c.windowsByDay.size).toBe(0);
    expect(c.closedDays.size).toBe(0);
  });

  it('separates open windows from closed days and supports split hours', () => {
    const c = buildBusinessHoursConstraint([
      { dayOfWeek: 1, openTime: '09:00', closeTime: '12:00', isClosed: false },
      { dayOfWeek: 1, openTime: '13:00', closeTime: '17:00', isClosed: false },
      { dayOfWeek: 0, openTime: '00:00', closeTime: '00:00', isClosed: true },
    ]);
    expect(c.hasAny).toBe(true);
    expect(c.windowsByDay.get(1)).toEqual([
      { open: 540, close: 720 },
      { open: 780, close: 1020 },
    ]);
    expect(c.closedDays.has(0)).toBe(true);
  });

  it('lets a valid open window win over a same-day closed row', () => {
    const c = buildBusinessHoursConstraint([
      { dayOfWeek: 3, openTime: '09:00', closeTime: '17:00', isClosed: false },
      { dayOfWeek: 3, openTime: '00:00', closeTime: '00:00', isClosed: true },
    ]);
    expect(c.windowsByDay.has(3)).toBe(true);
    expect(c.closedDays.has(3)).toBe(false);
  });
});

describe('intersectSpans', () => {
  it('returns the overlap of two span sets', () => {
    expect(intersectSpans([{ start: 0, end: 100 }], [{ start: 50, end: 150 }])).toEqual([{ start: 50, end: 100 }]);
  });
  it('handles multiple and disjoint windows', () => {
    const a = [{ start: 0, end: 60 }, { start: 100, end: 200 }];
    const b = [{ start: 40, end: 120 }, { start: 180, end: 300 }];
    expect(intersectSpans(a, b)).toEqual([
      { start: 40, end: 60 },
      { start: 100, end: 120 },
      { start: 180, end: 200 },
    ]);
  });
  it('is empty when nothing overlaps', () => {
    expect(intersectSpans([{ start: 0, end: 10 }], [{ start: 20, end: 30 }])).toEqual([]);
  });
});

describe('resolveBusinessProfile', () => {
  it('normalises a valid profile', () => {
    const p = resolveBusinessProfile({ name: '  Aurora Spa ', timezone: 'America/New_York', currency: 'eur', email: 'hi@aurora.test', phone: ' 555 ' });
    expect(p).toEqual({ name: 'Aurora Spa', timezone: 'America/New_York', currency: 'EUR', email: 'hi@aurora.test', phone: '555' });
  });
  it('defaults currency and timezone', () => {
    const p = resolveBusinessProfile({ name: 'X', currency: 'zz', timezone: '' });
    expect(p.currency).toBe('USD');
    expect(p.timezone).toBe('UTC');
  });
  it('rejects a missing name, bad timezone, and bad email', () => {
    expect(() => resolveBusinessProfile({ name: '  ' })).toThrow(ValidationError);
    expect(() => resolveBusinessProfile({ name: 'X', timezone: 'Mars/Phobos' })).toThrow(ValidationError);
    expect(() => resolveBusinessProfile({ name: 'X', email: 'not-an-email' })).toThrow(ValidationError);
  });
  it('validates timezones via Intl', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Nowhere/Void')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('resolveLocationInput', () => {
  it('resolves a location and inherits the business zone when blank', () => {
    const l = resolveLocationInput({ name: ' Downtown ', address: ' 1 Main St ', timezone: '' });
    expect(l).toEqual({ name: 'Downtown', address: '1 Main St', timezone: null, isActive: true });
  });
  it('keeps a valid timezone override and honours isActive=false', () => {
    const l = resolveLocationInput({ name: 'Uptown', timezone: 'America/Chicago', isActive: false });
    expect(l.timezone).toBe('America/Chicago');
    expect(l.isActive).toBe(false);
  });
  it('rejects a missing name or bad timezone', () => {
    expect(() => resolveLocationInput({ name: '' })).toThrow(ValidationError);
    expect(() => resolveLocationInput({ name: 'X', timezone: 'Bad/Zone' })).toThrow(ValidationError);
  });
});
