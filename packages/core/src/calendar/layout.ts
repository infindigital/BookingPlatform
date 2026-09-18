/**
 * Pure layout maths for the calendar time-grid: overlap lane assignment and the
 * visible hour window. Framework-free and easy to unit-test.
 */

export interface LaneInterval {
  startMinutes: number;
  endMinutes: number;
}

export interface Placed<T> {
  item: T;
  lane: number; // 0-based column within its overlap cluster
  lanes: number; // total columns in that cluster
}

/**
 * Assign overlapping intervals to side-by-side lanes. Intervals are grouped into
 * clusters of transitive overlap; within a cluster each interval gets the first
 * free lane, and every member reports the cluster's lane count so widths divide
 * evenly. Input order is by start time (callers sort first).
 */
export function assignLanes<T extends LaneInterval>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  );
  const result: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = cluster.reduce((max, p) => Math.max(max, p.lane + 1), 0);
    for (const p of cluster) p.lanes = lanes;
    result.push(...cluster);
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMinutes >= clusterEnd) flush();
    // First lane not occupied by a still-open interval in the current cluster.
    const laneEnds: number[] = [];
    for (const p of cluster) {
      laneEnds[p.lane] = Math.max(laneEnds[p.lane] ?? -Infinity, p.item.endMinutes);
    }
    let lane = 0;
    while (lane < laneEnds.length && (laneEnds[lane] ?? -Infinity) > item.startMinutes) lane++;
    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.endMinutes);
  }
  if (cluster.length > 0) flush();

  return result;
}

/**
 * Visible [startHour, endHour] window: the business day (default 8-19) expanded
 * to include every booking, clamped to 0-24 and padded by an hour.
 */
export function hourWindow(
  items: LaneInterval[],
  defaults: { startHour: number; endHour: number } = { startHour: 8, endHour: 19 },
): { startHour: number; endHour: number } {
  let startHour = defaults.startHour;
  let endHour = defaults.endHour;
  for (const it of items) {
    startHour = Math.min(startHour, Math.floor(it.startMinutes / 60));
    endHour = Math.max(endHour, Math.ceil(it.endMinutes / 60));
  }
  startHour = Math.max(0, Math.min(startHour, defaults.startHour));
  endHour = Math.min(24, Math.max(endHour, defaults.endHour));
  if (endHour <= startHour) endHour = Math.min(24, startHour + 1);
  return { startHour, endHour };
}
