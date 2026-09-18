import { describe, it, expect } from 'vitest';
import { mergeSpans, subtractSpans, subtractManySpans, overlapsAny } from './intervals';

describe('mergeSpans', () => {
  it('merges overlapping and touching spans, drops empties', () => {
    expect(
      mergeSpans([
        { start: 10, end: 20 },
        { start: 15, end: 25 }, // overlaps
        { start: 25, end: 30 }, // touches
        { start: 40, end: 40 }, // empty
        { start: 5, end: 8 }, // separate, earlier
      ]),
    ).toEqual([
      { start: 5, end: 8 },
      { start: 10, end: 30 },
    ]);
  });
});

describe('subtractSpans', () => {
  it('cuts a hole out of the middle', () => {
    expect(subtractSpans({ start: 0, end: 100 }, [{ start: 40, end: 60 }])).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ]);
  });

  it('trims edges and removes fully-covered bases', () => {
    expect(subtractSpans({ start: 0, end: 100 }, [{ start: 0, end: 30 }])).toEqual([{ start: 30, end: 100 }]);
    expect(subtractSpans({ start: 0, end: 100 }, [{ start: 80, end: 200 }])).toEqual([{ start: 0, end: 80 }]);
    expect(subtractSpans({ start: 0, end: 100 }, [{ start: -10, end: 200 }])).toEqual([]);
  });

  it('applies multiple holes', () => {
    expect(
      subtractSpans({ start: 0, end: 100 }, [
        { start: 20, end: 30 },
        { start: 50, end: 60 },
      ]),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 50 },
      { start: 60, end: 100 },
    ]);
  });
});

describe('subtractManySpans', () => {
  it('subtracts holes from every base span', () => {
    expect(
      subtractManySpans(
        [
          { start: 0, end: 40 },
          { start: 50, end: 100 },
        ],
        [{ start: 30, end: 70 }],
      ),
    ).toEqual([
      { start: 0, end: 30 },
      { start: 70, end: 100 },
    ]);
  });
});

describe('overlapsAny', () => {
  it('detects half-open overlap and treats touching as non-overlap', () => {
    const spans = [{ start: 100, end: 200 }];
    expect(overlapsAny(150, 160, spans)).toBe(true);
    expect(overlapsAny(50, 100, spans)).toBe(false); // touches at 100
    expect(overlapsAny(200, 250, spans)).toBe(false); // touches at 200
    expect(overlapsAny(90, 110, spans)).toBe(true);
  });
});
