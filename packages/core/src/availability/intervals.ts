/**
 * Pure interval (span) math for the availability engine. Spans are numeric
 * [start, end) ranges (milliseconds) - framework- and timezone-free. The data
 * layer resolves working hours / bookings / time-off into spans and calls these.
 */

export interface Span {
  start: number;
  end: number;
}

/** Merge overlapping or touching spans into a minimal sorted set. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/** Remove `holes` from a single `base` span, returning the remaining pieces. */
export function subtractSpans(base: Span, holes: Span[]): Span[] {
  let segments: Span[] = base.end > base.start ? [{ ...base }] : [];
  for (const h of holes) {
    const next: Span[] = [];
    for (const s of segments) {
      const oStart = Math.max(s.start, h.start);
      const oEnd = Math.min(s.end, h.end);
      if (oStart >= oEnd) {
        next.push(s); // no overlap
        continue;
      }
      if (s.start < oStart) next.push({ start: s.start, end: oStart });
      if (oEnd < s.end) next.push({ start: oEnd, end: s.end });
    }
    segments = next;
  }
  return segments;
}

/** Remove `holes` from every base span. */
export function subtractManySpans(bases: Span[], holes: Span[]): Span[] {
  return bases.flatMap((b) => subtractSpans(b, holes));
}

/** Whether [start, end) overlaps any of the (sorted or unsorted) spans. */
export function overlapsAny(start: number, end: number, spans: Span[]): boolean {
  for (const s of spans) {
    if (s.start < end && s.end > start) return true;
  }
  return false;
}

/**
 * Intersect two span sets - the ranges covered by BOTH. Inputs need not be
 * sorted or disjoint. Used to clip a resource's working windows to an outer
 * boundary (e.g. business opening hours).
 */
export function intersectSpans(a: Span[], b: Span[]): Span[] {
  const A = mergeSpans(a);
  const B = mergeSpans(b);
  const out: Span[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const start = Math.max(A[i]!.start, B[j]!.start);
    const end = Math.min(A[i]!.end, B[j]!.end);
    if (end > start) out.push({ start, end });
    if (A[i]!.end < B[j]!.end) i++;
    else j++;
  }
  return out;
}
