import { describe, it, expect } from 'vitest';
import {
  daySpan,
  chooseGranularity,
  bucketKeyOf,
  enumerateBuckets,
  bucketLabel,
  ratio,
  formatPercent,
} from './index';

describe('daySpan', () => {
  it('counts inclusive days', () => {
    expect(daySpan('2031-03-01', '2031-03-01')).toBe(1);
    expect(daySpan('2031-03-01', '2031-03-31')).toBe(31);
    expect(daySpan('2031-02-01', '2031-03-01')).toBe(29); // 2031 not a leap year → Feb has 28
  });
});

describe('chooseGranularity', () => {
  it('day for short ranges, week for mid, month for long', () => {
    expect(chooseGranularity('2031-03-01', '2031-03-15')).toBe('day');
    expect(chooseGranularity('2031-03-01', '2031-03-31')).toBe('day');
    expect(chooseGranularity('2031-01-01', '2031-03-01')).toBe('week');
    expect(chooseGranularity('2031-01-01', '2031-12-31')).toBe('month');
  });
});

describe('bucketKeyOf', () => {
  it('maps to the day, the Monday of the week, or the first of the month', () => {
    expect(bucketKeyOf('2031-03-05', 'day')).toBe('2031-03-05'); // Wednesday
    expect(bucketKeyOf('2031-03-05', 'week')).toBe('2031-03-03'); // Monday of that week
    expect(bucketKeyOf('2031-03-03', 'week')).toBe('2031-03-03'); // a Monday maps to itself
    expect(bucketKeyOf('2031-03-05', 'month')).toBe('2031-03-01');
  });

  it('week key of a Sunday points at the preceding Monday', () => {
    // 2031-03-02 is Sunday; Monday-based week starts 2031-02-24.
    expect(bucketKeyOf('2031-03-02', 'week')).toBe('2031-02-24');
  });
});

describe('enumerateBuckets', () => {
  it('lists daily buckets inclusively', () => {
    expect(enumerateBuckets('2031-03-01', '2031-03-04', 'day')).toEqual([
      '2031-03-01',
      '2031-03-02',
      '2031-03-03',
      '2031-03-04',
    ]);
  });

  it('lists weekly buckets by Monday', () => {
    const weeks = enumerateBuckets('2031-03-01', '2031-03-20', 'week');
    expect(weeks[0]).toBe('2031-02-24');
    expect(weeks).toContain('2031-03-17');
    // strictly increasing, 7 days apart
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i]! > weeks[i - 1]!).toBe(true);
    }
  });

  it('lists monthly buckets across a year boundary', () => {
    expect(enumerateBuckets('2031-11-15', '2032-02-10', 'month')).toEqual([
      '2031-11-01',
      '2031-12-01',
      '2032-01-01',
      '2032-02-01',
    ]);
  });
});

describe('bucketLabel', () => {
  it('formats day/week as month + day and month as month + year', () => {
    expect(bucketLabel('2031-03-05', 'day')).toBe('Mar 5');
    expect(bucketLabel('2031-03-03', 'week')).toBe('Mar 3');
    expect(bucketLabel('2031-03-01', 'month')).toBe('Mar 2031');
  });
});

describe('ratio + formatPercent', () => {
  it('clamps and guards ratio', () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(5, 4)).toBe(1);
    expect(ratio(1, 0)).toBe(0);
    expect(ratio(-1, 4)).toBe(0);
  });
  it('formats whole-number percents', () => {
    expect(formatPercent(0.4267)).toBe('43%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
  });
});
