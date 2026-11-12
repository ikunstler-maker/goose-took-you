import { BOX_SLIP_CHANCE, BOX_SLIP_MAX, BOX_SLIP_MIN, INTERACT_RANGE } from '../config';
import { createRng } from './rng';

/** A box in the office. Cargo boxes and vacation boxes (stage 3) share this shape. */
export interface Box {
  id: number;
  kind: 'cargo';
  x: number;
  z: number;
  /** Participant carrying it, or null when it lies on the floor. */
  carrier: number | null;
  /** Cargo task this box belongs to. */
  task: number;
  /** Metres carried on the current route. */
  travelled: number;
  /** Metres after which it slips out of the wings on this route; -1 means it holds. */
  slipAt: number;
}

/** Rolls whether the box will slip on the route that starts now, and where. */
export function rollSlip(box: Box, seed: number, tick: number): void {
  const rng = createRng(((seed * 131 + box.id * 7907 + tick) >>> 0) || 1);
  box.travelled = 0;
  box.slipAt = rng.next() < BOX_SLIP_CHANCE ? BOX_SLIP_MIN + rng.next() * (BOX_SLIP_MAX - BOX_SLIP_MIN) : -1;
}

/** Moves a carried box with its carrier; returns true when it slips and drops this step. */
export function carryBox(box: Box, x: number, z: number): boolean {
  box.travelled += Math.hypot(x - box.x, z - box.z);
  box.x = x;
  box.z = z;
  if (box.slipAt >= 0 && box.travelled >= box.slipAt) {
    box.carrier = null;
    box.slipAt = -1;
    return true;
  }
  return false;
}

/** The closest box on the floor within reach, or null. */
export function boxInReach(boxes: Box[], x: number, z: number): Box | null {
  let best: Box | null = null;
  let bestDistance = INTERACT_RANGE + 0.4;
  for (const box of boxes) {
    if (box.carrier !== null) continue;
    const distance = Math.hypot(box.x - x, box.z - z);
    if (distance <= bestDistance) {
      best = box;
      bestDistance = distance;
    }
  }
  return best;
}
