import { describe, it, expect } from 'vitest';
import {
  localDayRange,
  localMonthRange,
  localWeekday,
  minutesBetween,
} from '../src/dashboard/timezone';

describe('dashboard timezone helpers', () => {
  it('computes a UTC day range as midnight-to-midnight', () => {
    const instant = new Date('2026-03-15T09:30:00.000Z');
    const { start, end } = localDayRange(instant, 'UTC');
    expect(start.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-16T00:00:00.000Z');
  });

  it('resolves the local day boundary for a positive-offset zone', () => {
    // 00:30 UTC is already the 15th, 08:30 local, in Asia/Singapore (+08:00).
    const instant = new Date('2026-03-15T00:30:00.000Z');
    const { start, end } = localDayRange(instant, 'Asia/Singapore');
    // Local midnight of the 15th is 2026-03-14T16:00Z.
    expect(start.toISOString()).toBe('2026-03-14T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-15T16:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('resolves the local day boundary for a negative-offset zone', () => {
    // 02:00 UTC on the 15th is still 21:00 on the 14th in America/New_York (-05:00, EST).
    const instant = new Date('2026-01-15T02:00:00.000Z');
    const { start, end } = localDayRange(instant, 'America/New_York');
    expect(start.toISOString()).toBe('2026-01-14T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });

  it('computes a month range', () => {
    const instant = new Date('2026-02-17T12:00:00.000Z');
    const { start, end } = localMonthRange(instant, 'UTC');
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('rolls a month range across the year boundary', () => {
    const instant = new Date('2026-12-20T12:00:00.000Z');
    const { start, end } = localMonthRange(instant, 'UTC');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('maps weekdays to 0=Sun..6=Sat', () => {
    // 2026-03-15 is a Sunday.
    expect(localWeekday(new Date('2026-03-15T12:00:00.000Z'), 'UTC')).toBe(0);
    // 2026-03-16 is a Monday.
    expect(localWeekday(new Date('2026-03-16T12:00:00.000Z'), 'UTC')).toBe(1);
  });

  it('parses HH:MM durations and rejects malformed input', () => {
    expect(minutesBetween('09:00', '17:00')).toBe(480);
    expect(minutesBetween('09:30', '10:00')).toBe(30);
    expect(minutesBetween('17:00', '09:00')).toBe(0); // negative clamped
    expect(minutesBetween('bad', '17:00')).toBe(0);
  });
});
