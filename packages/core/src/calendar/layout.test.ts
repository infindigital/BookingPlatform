import { describe, it, expect } from 'vitest';
import { assignLanes, hourWindow, type LaneInterval } from './layout';

const iv = (startMinutes: number, endMinutes: number, id: string) => ({ startMinutes, endMinutes, id });

describe('assignLanes', () => {
  it('gives a single lane to non-overlapping intervals', () => {
    const placed = assignLanes([iv(540, 600, 'a'), iv(600, 660, 'b'), iv(660, 720, 'c')]);
    expect(placed.every((p) => p.lanes === 1 && p.lane === 0)).toBe(true);
  });

  it('splits two overlapping intervals into two lanes', () => {
    const placed = assignLanes([iv(540, 660, 'a'), iv(600, 720, 'b')]);
    const a = placed.find((p) => p.item.id === 'a')!;
    const b = placed.find((p) => p.item.id === 'b')!;
    expect(a.lanes).toBe(2);
    expect(b.lanes).toBe(2);
    expect(new Set([a.lane, b.lane])).toEqual(new Set([0, 1]));
  });

  it('reuses a freed lane after an interval ends (three staggered → 2 lanes)', () => {
    // a: 9-10, b: 9:30-10:30 (overlaps a), c: 10-11 (overlaps b, not a).
    const placed = assignLanes([iv(540, 600, 'a'), iv(570, 630, 'b'), iv(600, 660, 'c')]);
    const byId = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    // All in one transitive cluster → 2 lanes wide.
    expect(byId.a!.lanes).toBe(2);
    // c can reuse a's lane (a ended at 600, c starts at 600).
    expect(byId.a!.lane).toBe(byId.c!.lane);
    expect(byId.b!.lane).not.toBe(byId.a!.lane);
  });

  it('separates disjoint clusters (independent lane counts)', () => {
    const placed = assignLanes([iv(540, 660, 'a'), iv(600, 720, 'b'), iv(800, 860, 'c')]);
    const byId = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(byId.a!.lanes).toBe(2);
    expect(byId.c!.lanes).toBe(1); // its own cluster
  });
});

describe('hourWindow', () => {
  it('returns the default business window when bookings fit inside it', () => {
    const items: LaneInterval[] = [iv(600, 660, 'x')];
    expect(hourWindow(items)).toEqual({ startHour: 8, endHour: 19 });
  });

  it('expands to include early and late bookings', () => {
    const items: LaneInterval[] = [iv(6 * 60 + 30, 7 * 60, 'early'), iv(20 * 60, 21 * 60 + 30, 'late')];
    const w = hourWindow(items);
    expect(w.startHour).toBe(6);
    expect(w.endHour).toBe(22); // ceil(21.5h) = 22
  });

  it('never exceeds 0..24', () => {
    const items: LaneInterval[] = [iv(0, 30, 'midnight'), iv(23 * 60, 24 * 60, 'endofday')];
    const w = hourWindow(items);
    expect(w.startHour).toBe(0);
    expect(w.endHour).toBe(24);
  });
});
