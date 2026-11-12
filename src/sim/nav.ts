import { NAV_STEP, PLAYER_RADIUS } from '../config';
import { blocked, type Buckets, type Level } from './level';

/** Walkability grid for bots: one sample every NAV_STEP metres, 1 where a chick fits. */
export interface NavGrid {
  cols: number;
  step: number;
  free: Uint8Array;
}

export function buildNav(level: Level, buckets: Buckets): NavGrid {
  const cols = Math.floor(level.size / NAV_STEP);
  const free = new Uint8Array(cols * cols);
  for (let cz = 0; cz < cols; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      // A small margin; straight shortcuts are checked against real collision in `findPath`.
      const x = (cx + 0.5) * NAV_STEP;
      const z = (cz + 0.5) * NAV_STEP;
      if (!blocked(level, buckets, x, z, PLAYER_RADIUS + 0.05)) free[cz * cols + cx] = 1;
    }
  }
  return { cols, step: NAV_STEP, free };
}

export const cellOf = (nav: NavGrid, x: number, z: number): number =>
  Math.min(nav.cols - 1, Math.max(0, Math.floor(z / nav.step))) * nav.cols +
  Math.min(nav.cols - 1, Math.max(0, Math.floor(x / nav.step)));

export const cellCentre = (nav: NavGrid, cell: number): { x: number; z: number } => ({
  x: ((cell % nav.cols) + 0.5) * nav.step,
  z: (Math.floor(cell / nav.cols) + 0.5) * nav.step,
});

/** The free cell nearest to a point (spiral search), or -1. */
export function nearestFree(nav: NavGrid, x: number, z: number, maxRing = 8): number {
  const cx = Math.floor(x / nav.step);
  const cz = Math.floor(z / nav.step);
  for (let r = 0; r <= maxRing; r++) {
    let best = -1;
    let bestD = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const gx = cx + dx;
        const gz = cz + dz;
        if (gx < 0 || gz < 0 || gx >= nav.cols || gz >= nav.cols) continue;
        const cell = gz * nav.cols + gx;
        if (nav.free[cell] !== 1) continue;
        const c = cellCentre(nav, cell);
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bestD) {
          bestD = d;
          best = cell;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** How far around the chick (in cells) a route may start. */
const START_RING = 3;

/** Answers whether a chick fits at a point; the real collision test. */
export type Fits = (x: number, z: number) => boolean;

/** A chick can walk the straight segment without touching anything. */
function clearLine(fits: Fits, ax: number, az: number, bx: number, bz: number): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!fits(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

/** Collision test for `findPath`, with a hair of extra margin. */
export function fitsIn(level: Level, buckets: Buckets): Fits {
  return (x, z) => !blocked(level, buckets, x, z, PLAYER_RADIUS + 0.08);
}

/** A* over the grid with 8 neighbours; returns smoothed waypoints in metres, or null. */
export function findPath(
  nav: NavGrid,
  fits: Fits,
  fromX: number,
  fromZ: number,
  toCell: number,
): { x: number; z: number }[] | null {
  if (toCell < 0 || nav.free[toCell] !== 1) return null;
  const n = nav.cols;
  // Start from every free cell within a step or two that the chick can walk to in a straight
  // line: one nearest cell may sit in a pocket of the grid the chick itself is not stuck in.
  const starts: { cell: number; cost: number }[] = [];
  const fx = Math.floor(fromX / nav.step);
  const fz = Math.floor(fromZ / nav.step);
  for (let dz = -START_RING; dz <= START_RING; dz++) {
    for (let dx = -START_RING; dx <= START_RING; dx++) {
      const gx = fx + dx;
      const gz = fz + dz;
      if (gx < 0 || gz < 0 || gx >= n || gz >= n) continue;
      const cell = gz * n + gx;
      if (nav.free[cell] !== 1) continue;
      const c = cellCentre(nav, cell);
      const cost = Math.hypot(c.x - fromX, c.z - fromZ) / nav.step;
      if (cost <= 1 || clearLine(fits, fromX, fromZ, c.x, c.z)) starts.push({ cell, cost });
    }
  }
  if (starts.length === 0) {
    const start = nearestFree(nav, fromX, fromZ, 3);
    if (start < 0) return null;
    starts.push({ cell: start, cost: 0 });
  }
  const total = n * n;
  const g = new Float32Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const tx = toCell % n;
  const tz = Math.floor(toCell / n);
  const h = (cell: number): number => {
    const dx = Math.abs((cell % n) - tx);
    const dz = Math.abs(Math.floor(cell / n) - tz);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  // Binary heap of [f, cell].
  const heap: number[] = [];
  const push = (f: number, cell: number): void => {
    heap.push(f, cell);
    let i = heap.length / 2 - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p * 2]! <= heap[i * 2]!) break;
      [heap[p * 2], heap[i * 2]] = [heap[i * 2]!, heap[p * 2]!];
      [heap[p * 2 + 1], heap[i * 2 + 1]] = [heap[i * 2 + 1]!, heap[p * 2 + 1]!];
      i = p;
    }
  };
  const pop = (): number => {
    const cell = heap[1]!;
    const lastF = heap[heap.length - 2]!;
    const lastC = heap[heap.length - 1]!;
    heap.length -= 2;
    if (heap.length > 0) {
      heap[0] = lastF;
      heap[1] = lastC;
      let i = 0;
      const size = heap.length / 2;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < size && heap[l * 2]! < heap[m * 2]!) m = l;
        if (r < size && heap[r * 2]! < heap[m * 2]!) m = r;
        if (m === i) break;
        [heap[m * 2], heap[i * 2]] = [heap[i * 2]!, heap[m * 2]!];
        [heap[m * 2 + 1], heap[i * 2 + 1]] = [heap[i * 2 + 1]!, heap[m * 2 + 1]!];
        i = m;
      }
    }
    return cell;
  };

  for (const st of starts) {
    if (st.cost < g[st.cell]!) {
      g[st.cell] = st.cost;
      push(st.cost + h(st.cell), st.cell);
    }
  }
  let found = false;
  while (heap.length > 0) {
    const cell = pop();
    if (closed[cell]) continue;
    closed[cell] = 1;
    if (cell === toCell) {
      found = true;
      break;
    }
    const cx = cell % n;
    const cz = Math.floor(cell / n);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const next = nz * n + nx;
        if (nav.free[next] !== 1 || closed[next]) continue;
        // No corner cutting.
        if (dx !== 0 && dz !== 0 && (nav.free[cz * n + nx] !== 1 || nav.free[nz * n + cx] !== 1)) continue;
        const cost = g[cell]! + (dx !== 0 && dz !== 0 ? 1.414 : 1);
        if (cost < g[next]!) {
          g[next] = cost;
          came[next] = cell;
          push(cost + h(next), next);
        }
      }
    }
  }
  if (!found) return null;
  const cells: number[] = [];
  for (let c = toCell; c !== -1; c = came[c]!) cells.push(c);
  cells.reverse();
  // String-pull: keep only the corners a straight walk cannot skip.
  const points = cells.map((c) => cellCentre(nav, c));
  const out: { x: number; z: number }[] = [];
  let anchor = { x: fromX, z: fromZ };
  let i = 0;
  // Squeezed against a wall or corner: step back to the middle of a free cell first.
  if (!clearLine(fits, fromX, fromZ, points[0]!.x, points[0]!.z) || !clearLine(fits, fromX, fromZ, points[Math.min(1, points.length - 1)]!.x, points[Math.min(1, points.length - 1)]!.z)) {
    out.push(points[0]!);
    anchor = points[0]!;
  }
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !clearLine(fits, anchor.x, anchor.z, points[j]!.x, points[j]!.z)) j--;
    out.push(points[j]!);
    anchor = points[j]!;
    i = j;
  }
  if (out.length === 0) out.push(points[points.length - 1]!);
  return out;
}
