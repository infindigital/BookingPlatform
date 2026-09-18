import { describe, it, expect } from 'vitest';
import {
  parseHhMm,
  isValidHhMm,
  formatHhMm,
  validateWorkingWindow,
  windowWorkingMinutes,
  weeklyWorkingMinutes,
  validateWeeklySchedule,
  WEEKDAYS,
  type WorkingWindow,
} from './schedule';

describe('parseHhMm', () => {
  it('parses valid times to minutes-from-midnight', () => {
    expect(parseHhMm('00:00')).toBe(0);
    expect(parseHhMm('09:30')).toBe(570);
    expect(parseHhMm('23:59')).toBe(1439);
    expect(parseHhMm(' 9:05 ')).toBe(545);
  });
  it('rejects malformed or out-of-range times', () => {
    expect(parseHhMm('24:00')).toBeNull();
    expect(parseHhMm('12:60')).toBeNull();
    expect(parseHhMm('noon')).toBeNull();
    expect(parseHhMm('1200')).toBeNull();
    expect(parseHhMm('')).toBeNull();
  });
});

describe('isValidHhMm / formatHhMm', () => {
  it('round-trips', () => {
    expect(isValidHhMm('17:00')).toBe(true);
    expect(isValidHhMm('7:0')).toBe(false);
    expect(formatHhMm(570)).toBe('09:30');
    expect(formatHhMm(0)).toBe('00:00');
    expect(formatHhMm(1439)).toBe('23:59');
  });
});

describe('validateWorkingWindow', () => {
  it('accepts a clean window with an in-range break', () => {
    expect(
      validateWorkingWindow({ startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00' }] }),
    ).toEqual({ ok: true });
  });
  it('rejects end before/equal start', () => {
    expect(validateWorkingWindow({ startTime: '17:00', endTime: '09:00', breaks: [] }).ok).toBe(false);
    expect(validateWorkingWindow({ startTime: '09:00', endTime: '09:00', breaks: [] }).ok).toBe(false);
  });
  it('rejects a break outside the window', () => {
    expect(
      validateWorkingWindow({ startTime: '09:00', endTime: '12:00', breaks: [{ startTime: '12:30', endTime: '13:00' }] }).ok,
    ).toBe(false);
  });
  it('rejects an inverted break', () => {
    expect(
      validateWorkingWindow({ startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '13:00', endTime: '12:00' }] }).ok,
    ).toBe(false);
  });
  it('rejects overlapping breaks', () => {
    expect(
      validateWorkingWindow({
        startTime: '09:00',
        endTime: '17:00',
        breaks: [
          { startTime: '12:00', endTime: '13:00' },
          { startTime: '12:30', endTime: '14:00' },
        ],
      }).ok,
    ).toBe(false);
  });
  it('accepts two non-overlapping breaks', () => {
    expect(
      validateWorkingWindow({
        startTime: '08:00',
        endTime: '18:00',
        breaks: [
          { startTime: '12:00', endTime: '13:00' },
          { startTime: '15:00', endTime: '15:15' },
        ],
      }).ok,
    ).toBe(true);
  });
});

describe('windowWorkingMinutes / weeklyWorkingMinutes', () => {
  it('subtracts breaks from the window length', () => {
    expect(windowWorkingMinutes({ startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00' }] })).toBe(420);
    expect(windowWorkingMinutes({ startTime: '09:00', endTime: '17:00', breaks: [] })).toBe(480);
  });
  it('returns 0 for an invalid window', () => {
    expect(windowWorkingMinutes({ startTime: '17:00', endTime: '09:00', breaks: [] })).toBe(0);
  });
  it('sums across the week', () => {
    const windows: WorkingWindow[] = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00' }] },
      { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00' }] },
    ];
    expect(weeklyWorkingMinutes(windows)).toBe(840);
  });
});

describe('validateWeeklySchedule', () => {
  it('accepts a valid week', () => {
    const windows: WorkingWindow[] = WEEKDAYS.slice(1, 6).map((d) => ({
      dayOfWeek: d.value,
      startTime: '09:00',
      endTime: '17:00',
      breaks: [{ startTime: '12:00', endTime: '13:00' }],
    }));
    expect(validateWeeklySchedule(windows)).toEqual({ ok: true });
  });
  it('names the offending day', () => {
    const res = validateWeeklySchedule([{ dayOfWeek: 3, startTime: '17:00', endTime: '09:00', breaks: [] }]);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Wednesday/);
  });
});
