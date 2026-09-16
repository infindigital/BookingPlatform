import { describe, it, expect } from 'vitest';
import { addDays, rangeDays, weekDays, weekdayOf, parseDayKey } from './dates';

describe('calendar date helpers', () => {
  it('parses a day key', () => {
    expect(parseDayKey('2026-09-16')).toEqual({ y: 2026, m: 9, d: 16 });
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-16', 1)).toBe('2026-09-17');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28'); // 2026 not a leap year
  });

  it('maps weekday as 0=Sun..6=Sat', () => {
    expect(weekdayOf('2026-09-13')).toBe(0); // Sunday
    expect(weekdayOf('2026-09-16')).toBe(3); // Wednesday
  });

  it('builds a Monday-based week of 7 days', () => {
    // 2026-09-16 is a Wednesday; its week runs Mon 14th → Sun 20th.
    const week = weekDays('2026-09-16');
    expect(week).toHaveLength(7);
    expect(week[0]).toBe('2026-09-14');
    expect(week[6]).toBe('2026-09-20');
    expect(weekdayOf(week[0]!)).toBe(1); // Monday
  });

  it('keeps a Monday in its own week', () => {
    expect(weekDays('2026-09-14')[0]).toBe('2026-09-14');
  });

  it('keeps a Sunday at the end of the Monday-based week', () => {
    expect(weekDays('2026-09-20')[0]).toBe('2026-09-14');
    expect(weekDays('2026-09-20')[6]).toBe('2026-09-20');
  });

  it('produces a rolling range', () => {
    const r = rangeDays('2026-09-16', 3);
    expect(r).toEqual(['2026-09-16', '2026-09-17', '2026-09-18']);
  });
});
