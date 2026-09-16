import { describe, it, expect } from 'vitest';
import { intervalsOverlap, hasConflict, isValidInterval } from './overlap';

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 1, h, m));

describe('intervalsOverlap (half-open)', () => {
  it('detects true overlap', () => {
    expect(
      intervalsOverlap({ start: at(9), end: at(10) }, { start: at(9, 30), end: at(10, 30) }),
    ).toBe(true);
  });

  it('allows back-to-back bookings (touching edges)', () => {
    expect(
      intervalsOverlap({ start: at(9), end: at(10) }, { start: at(10), end: at(11) }),
    ).toBe(false);
  });

  it('detects containment', () => {
    expect(
      intervalsOverlap({ start: at(9), end: at(12) }, { start: at(10), end: at(11) }),
    ).toBe(true);
  });

  it('non-overlapping separate intervals', () => {
    expect(
      intervalsOverlap({ start: at(9), end: at(10) }, { start: at(11), end: at(12) }),
    ).toBe(false);
  });
});

describe('hasConflict', () => {
  const existing = [
    { start: at(9), end: at(10) },
    { start: at(13), end: at(14) },
  ];

  it('finds a conflict', () => {
    expect(hasConflict({ start: at(9, 30), end: at(10, 30) }, existing)).toBe(true);
  });

  it('finds no conflict in a free gap', () => {
    expect(hasConflict({ start: at(11), end: at(12) }, existing)).toBe(false);
  });

  it('empty existing never conflicts', () => {
    expect(hasConflict({ start: at(9), end: at(10) }, [])).toBe(false);
  });
});

describe('isValidInterval', () => {
  it('rejects zero and negative length', () => {
    expect(isValidInterval({ start: at(9), end: at(9) })).toBe(false);
    expect(isValidInterval({ start: at(10), end: at(9) })).toBe(false);
  });
  it('accepts positive length', () => {
    expect(isValidInterval({ start: at(9), end: at(10) })).toBe(true);
  });
});
