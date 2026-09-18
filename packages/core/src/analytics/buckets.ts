/**
 * Analytics time-bucketing - pure and dependency-free. Operates on civil
 * `YYYY-MM-DD` day keys (the data layer resolves instants → local day keys in
 * the business timezone, then hands them here). Chooses a sensible granularity
 * for a range and maps each day into its bucket so a series stays readable
 * whether it spans a week or a year.
 */

import { addDays, parseDayKey, weekdayOf } from '../calendar/dates';

export type AnalyticsGranularity = 'day' | 'week' | 'month';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Inclusive number of days between two day keys (`from` ≤ `to`). */
export function daySpan(from: string, to: string): number {
  const a = parseDayKey(from);
  const b = parseDayKey(to);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.floor(ms / 86_400_000) + 1;
}

/** Pick day/week/month buckets so a chart never has too many or too few bars. */
export function chooseGranularity(from: string, to: string): AnalyticsGranularity {
  const days = daySpan(from, to);
  if (days <= 31) return 'day';
  if (days <= 182) return 'week';
  return 'month';
}

/** The bucket key a given day belongs to. Weeks are Monday-based. */
export function bucketKeyOf(dayKey: string, granularity: AnalyticsGranularity): string {
  if (granularity === 'day') return dayKey;
  if (granularity === 'week') {
    const backToMonday = (weekdayOf(dayKey) + 6) % 7;
    return addDays(dayKey, -backToMonday);
  }
  const { y, m } = parseDayKey(dayKey);
  return `${y}-${pad2(m)}-01`;
}

function nextBucket(bucketKey: string, granularity: AnalyticsGranularity): string {
  if (granularity === 'day') return addDays(bucketKey, 1);
  if (granularity === 'week') return addDays(bucketKey, 7);
  const { y, m } = parseDayKey(bucketKey);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`;
}

/** Ordered, unique bucket keys covering [from, to] inclusive. */
export function enumerateBuckets(from: string, to: string, granularity: AnalyticsGranularity): string[] {
  const out: string[] = [];
  const end = bucketKeyOf(to, granularity);
  let cur = bucketKeyOf(from, granularity);
  // Guard against pathological input; a year of daily buckets is 366.
  for (let i = 0; i < 800 && cur <= end; i++) {
    out.push(cur);
    cur = nextBucket(cur, granularity);
  }
  return out;
}

/** A short axis label for a bucket key. */
export function bucketLabel(bucketKey: string, granularity: AnalyticsGranularity): string {
  const { y, m, d } = parseDayKey(bucketKey);
  const month = MONTHS_SHORT[m - 1] ?? '';
  if (granularity === 'month') return `${month} ${y}`;
  return `${month} ${d}`;
}

/** Safe ratio in [0, 1]; 0 when the total is non-positive. */
export function ratio(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(1, part / total));
}

/** Whole-number percent string, e.g. 0.4267 → "43%". */
export function formatPercent(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  return `${Math.round(v * 100)}%`;
}
