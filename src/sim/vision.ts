import { VISION_RADIUS } from '../config';
import { FLOOR, type Level } from './level';

/**
 * Marks the floor cells the observer sees along a clear straight line.
 * Walls, windows and distance block the view; furniture does not.
 * `out` has one byte per cell and is fully rewritten.
 */
export function computeVisibility(level: Level, x: number, z: number, out: Uint8Array): void {
  const n = level.size;
  out.fill(0);
  const r = VISION_RADIUS;
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(n - 1, Math.floor(x + r));
  const z0 = Math.max(0, Math.floor(z - r));
  const z1 = Math.min(n - 1, Math.floor(z + r));

  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const cell = cz * n + cx;
      if (level.cells[cell] !== FLOOR) continue;
      const dx = cx + 0.5 - x;
      const dz = cz + 0.5 - z;
      const dist = Math.hypot(dx, dz);
      if (dist > r) continue;
      // Sample the line every 0.4 m; the target cell itself is not tested.
      const steps = Math.ceil(dist / 0.4);
      let clear = true;
      for (let s = 1; s < steps && clear; s++) {
        const sx = Math.floor(x + (dx * s) / steps);
        const sz = Math.floor(z + (dz * s) / steps);
        if (sx === cx && sz === cz) break;
        clear = level.cells[sz * n + sx] === FLOOR;
      }
      if (clear) out[cell] = 1;
    }
  }
}

/** One observer sees a point: within VISION_RADIUS and no wall or window in between. */
export function canSee(level: Level, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist > VISION_RADIUS) return false;
  const n = level.size;
  const steps = Math.ceil(dist / 0.4);
  for (let s = 1; s < steps; s++) {
    const sx = Math.floor(ax + (dx * s) / steps);
    const sz = Math.floor(az + (dz * s) / steps);
    if (level.cells[sz * n + sx] !== FLOOR) return false;
  }
  return true;
}
