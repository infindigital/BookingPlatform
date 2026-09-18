import { mergeSpans, overlapsAny, type Span } from './intervals';

/**
 * Pure slot generation. Given the workable windows for a resource, the spans it
 * is already busy, and a service's duration + buffers, produce the candidate
 * start times (ms). A candidate at `t` is valid when:
 *  - [t, t + duration) fits inside a working window, and
 *  - [t - bufferBefore, t + duration + bufferAfter) overlaps nothing busy, and
 *  - t is not before `now + minLead` (when `now` is given).
 * Candidates step by `stepMs` from each window's start.
 */
export interface SlotParams {
  windows: Span[];
  busy: Span[];
  durationMs: number;
  stepMs: number;
  bufferBeforeMs?: number;
  bufferAfterMs?: number;
  /** Absolute "now" (ms); slots before now + minLead are excluded. */
  now?: number;
  minLeadMs?: number;
}

export function generateSlots(params: SlotParams): number[] {
  const {
    windows,
    busy,
    durationMs,
    stepMs,
    bufferBeforeMs = 0,
    bufferAfterMs = 0,
    now,
    minLeadMs = 0,
  } = params;
  if (durationMs <= 0 || stepMs <= 0) return [];

  const earliest = now === undefined ? -Infinity : now + minLeadMs;
  const busySorted = mergeSpans(busy);
  const found = new Set<number>();

  for (const w of windows) {
    for (let t = w.start; t + durationMs <= w.end; t += stepMs) {
      if (t < earliest) continue;
      const paddedStart = t - bufferBeforeMs;
      const paddedEnd = t + durationMs + bufferAfterMs;
      if (!overlapsAny(paddedStart, paddedEnd, busySorted)) found.add(t);
    }
  }

  return [...found].sort((a, b) => a - b);
}
