import { describe, it, expect } from 'vitest';
import { generateSlots } from './slots';

// Units are minutes for readability (the function is unit-agnostic).
const H = 60;

describe('generateSlots', () => {
  it('fills an empty window at the step granularity', () => {
    const slots = generateSlots({
      windows: [{ start: 9 * H, end: 12 * H }],
      busy: [],
      durationMs: 60,
      stepMs: 30,
    });
    // 9:00, 9:30, 10:00, 10:30, 11:00 (11:00+60=12:00 fits); 11:30 would end 12:30 > 12:00.
    expect(slots).toEqual([9 * H, 9.5 * H, 10 * H, 10.5 * H, 11 * H]);
  });

  it('excludes candidates that collide with a busy booking', () => {
    const slots = generateSlots({
      windows: [{ start: 9 * H, end: 12 * H }],
      busy: [{ start: 10 * H, end: 10.5 * H }],
      durationMs: 60,
      stepMs: 30,
    });
    // 9:30 (ends 10:30) overlaps; 10:00 overlaps; 10:30 (ends 11:30) overlaps at 10:30? busy ends 10:30 → touching ok.
    expect(slots).toEqual([9 * H, 10.5 * H, 11 * H]);
  });

  it('respects before/after buffers as required gaps', () => {
    const slots = generateSlots({
      windows: [{ start: 9 * H, end: 12 * H }],
      busy: [{ start: 10 * H, end: 10.5 * H }],
      durationMs: 60,
      stepMs: 30,
      bufferBeforeMs: 15,
      bufferAfterMs: 15,
    });
    // 9:00 ends 10:00, +15 buffer → 10:15 overlaps busy(10:00-10:30)? padded end 10:15 > 10:00 start → overlaps. Excluded.
    // 10:30 padded start 10:15 < busy end 10:30 → overlaps. Excluded.
    // 11:00 padded [10:45,12:15] - but window end 12:00, slot 11:00+60=12:00 fits; padded end beyond window is fine (buffer past close).
    expect(slots).toEqual([11 * H]);
  });

  it('does not offer a slot longer than the window', () => {
    expect(
      generateSlots({ windows: [{ start: 9 * H, end: 9.5 * H }], busy: [], durationMs: 60, stepMs: 15 }),
    ).toEqual([]);
  });

  it('splits availability around a mid-day break (two windows)', () => {
    const slots = generateSlots({
      windows: [
        { start: 9 * H, end: 12 * H },
        { start: 13 * H, end: 15 * H },
      ],
      busy: [],
      durationMs: 60,
      stepMs: 60,
    });
    expect(slots).toEqual([9 * H, 10 * H, 11 * H, 13 * H, 14 * H]);
  });

  it('excludes past slots using now + minLead', () => {
    const slots = generateSlots({
      windows: [{ start: 9 * H, end: 12 * H }],
      busy: [],
      durationMs: 60,
      stepMs: 60,
      now: 9 * H,
      minLeadMs: 90, // must start at/after 10:30
    });
    expect(slots).toEqual([11 * H]);
  });

  it('deduplicates and sorts across overlapping windows', () => {
    const slots = generateSlots({
      windows: [
        { start: 9 * H, end: 11 * H },
        { start: 10 * H, end: 12 * H },
      ],
      busy: [],
      durationMs: 60,
      stepMs: 60,
    });
    expect(slots).toEqual([9 * H, 10 * H, 11 * H]);
  });
});
