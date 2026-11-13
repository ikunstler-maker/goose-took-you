import { CARPET_COUNT, CARPET_LONG, CARPET_RANGE } from '../config';
import { blocked, type Buckets, type Level } from './level';
import { createRng } from './rng';

/** A rug on the floor; the Goose can dive under it and crawl to the other rugs of its network. */
export interface Carpet {
  id: number;
  x: number;
  z: number;
  /** True when the long side runs along x. */
  alongX: boolean;
  room: number;
  /** Network index; rugs only connect within one network. */
  net: number;
  /** Carpet ids reachable from this one. */
  links: number[];
  /** Seconds left of the lifted edge (dive or climb-out); cosmetic. */
  lift: number;
  /** Someone hides under it right now: the rug shows a hump. */
  occupied: boolean;
}

/** How many rugs go into each network: two or three per network. */
function networkSizes(count: number): number[] {
  if (count < 2) return [];
  if (count <= 3) return [count];
  const sizes: number[] = [];
  let left = count;
  while (left > 0) {
    const size = left === 4 || left === 2 ? 2 : 3;
    sizes.push(size);
    left -= size;
  }
  return sizes;
}

/**
 * One rug in up to CARPET_COUNT rooms, on clear floor, away from the spawn.
 * Uses its own RNG stream so the office itself does not change.
 */
export function placeCarpets(level: Level, buckets: Buckets): Carpet[] {
  const rng = createRng(((level.seed * 92821 + 7) >>> 0) || 1);
  const n = level.size;
  const rooms = [...level.rooms];
  for (let i = rooms.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [rooms[i], rooms[j]] = [rooms[j]!, rooms[i]!];
  }
  const carpets: Carpet[] = [];
  for (const room of rooms) {
    if (carpets.length >= CARPET_COUNT) break;
    const cells: number[] = [];
    for (let c = 0; c < n * n; c++) if (level.zone[c] === room.id) cells.push(c);
    const alongX = rng.next() < 0.5;
    for (let tries = 0; tries < 40 && cells.length > 0; tries++) {
      const cell = cells[rng.int(cells.length)]!;
      const x = (cell % n) + 0.5;
      const z = Math.floor(cell / n) + 0.5;
      // Clear floor all around the rug, so walking onto it and climbing out always fit.
      if (blocked(level, buckets, x, z, CARPET_LONG / 2 + 0.45)) continue;
      if (Math.hypot(x - level.spawn.x, z - level.spawn.z) < 4) continue;
      carpets.push({ id: carpets.length, x, z, alongX, room: room.id, net: -1, links: [], lift: 0, occupied: false });
      break;
    }
  }

  // Networks: greedy nearest neighbours, so a network spans nearby rooms.
  const free = new Set(carpets.map((c) => c.id));
  networkSizes(carpets.length).forEach((size, net) => {
    const first = carpets[[...free][rng.int(free.size)]!]!;
    const group = [first];
    free.delete(first.id);
    while (group.length < size && free.size > 0) {
      const last = group[group.length - 1]!;
      let best = -1;
      let bestD = Infinity;
      for (const id of free) {
        const d = Math.hypot(carpets[id]!.x - last.x, carpets[id]!.z - last.z);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      group.push(carpets[best]!);
      free.delete(best);
    }
    for (const c of group) {
      c.net = net;
      c.links = group.filter((o) => o !== c).map((o) => o.id);
    }
  });
  return carpets.filter((c) => c.net >= 0);
}

/** The rug the participant stands on (close to its centre), or null. */
export function carpetInReach(carpets: Carpet[], x: number, z: number): Carpet | null {
  let best: Carpet | null = null;
  let bestD = CARPET_RANGE;
  for (const c of carpets) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** The linked rug that best matches a direction, or null when none lies that way. */
export function linkToward(carpets: Carpet[], from: Carpet, dx: number, dz: number): number | null {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return null;
  let best: number | null = null;
  let bestDot = 0.3;
  for (const id of from.links) {
    const c = carpets[id]!;
    const d = Math.hypot(c.x - from.x, c.z - from.z) || 1;
    const dot = ((c.x - from.x) * dx + (c.z - from.z) * dz) / (d * len);
    if (dot > bestDot) {
      bestDot = dot;
      best = id;
    }
  }
  return best;
}
