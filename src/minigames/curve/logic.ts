import {
  CURVE_FLIP_CHANCE,
  CURVE_MIN_START_OFFSET,
  CURVE_REBRIEF_CHANCE,
  CURVE_TOLERANCE_MAX,
  CURVE_TOLERANCE_MIN,
} from '../../config';
import { createRng } from '../../sim/rng';

/** Bezier handle in curve units: x is time 0..1, y is value 0..1. */
export interface Handle {
  x: number;
  y: number;
}

/** «Крива в Graph Editor»: drag two handles until the easing curve matches the reference. */
export interface CurveState {
  target: [Handle, Handle];
  handles: [Handle, Handle];
  /** How picky this client is: largest allowed handle distance from the target. */
  tolerance: number;
  /** The graph is shown upside down: the value axis grows downwards. View-only twist. */
  flipped: boolean;
  /** The client changes the brief once, when the curve is nearly there: the new target. */
  rebrief: [Handle, Handle] | null;
  rebriefed: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function createCurve(seed: number): CurveState {
  const rng = createRng(seed);
  const target: [Handle, Handle] = [
    { x: 0.1 + rng.next() * 0.4, y: rng.next() * 0.6 },
    { x: 0.5 + rng.next() * 0.4, y: 0.4 + rng.next() * 0.6 },
  ];
  // Start from a linear curve, nudged away so the round never starts solved.
  const handles: [Handle, Handle] = [
    { x: 0.33, y: 0.33 },
    { x: 0.66, y: 0.66 },
  ];
  handles.forEach((h, i) => {
    const t = target[i]!;
    if (Math.hypot(h.x - t.x, h.y - t.y) < CURVE_MIN_START_OFFSET) h.y = clamp01(t.y + (t.y > 0.5 ? -0.4 : 0.4));
  });
  const tolerance = CURVE_TOLERANCE_MIN + rng.next() * (CURVE_TOLERANCE_MAX - CURVE_TOLERANCE_MIN);
  const flipped = rng.next() < CURVE_FLIP_CHANCE;
  const rebrief: [Handle, Handle] | null =
    rng.next() < CURVE_REBRIEF_CHANCE
      ? [
          { x: target[0].x, y: clamp01(target[0].y + (target[0].y > 0.3 ? -0.3 : 0.3)) },
          { x: clamp01(target[1].x - 0.15), y: target[1].y },
        ]
      : null;
  return { target, handles, tolerance, flipped, rebrief, rebriefed: false };
}

export function moveHandle(state: CurveState, index: number, x: number, y: number): void {
  const h = state.handles[index];
  if (!h) return;
  h.x = clamp01(x);
  h.y = clamp01(y);
  // Nearly done? A fickle client sends a new reference, once.
  if (state.rebrief && curveError(state) <= state.tolerance * 2) {
    state.target = state.rebrief;
    state.rebrief = null;
    state.rebriefed = true;
  }
}

/** Largest handle distance from its target. */
export function curveError(state: CurveState): number {
  return Math.max(...state.handles.map((h, i) => Math.hypot(h.x - state.target[i]!.x, h.y - state.target[i]!.y)));
}

export function isCurveMatched(state: CurveState): boolean {
  return curveError(state) <= state.tolerance;
}

/** Point on the cubic bezier from (0,0) to (1,1) through both handles. */
export function curvePoint(a: Handle, b: Handle, t: number): Handle {
  const u = 1 - t;
  return {
    x: 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t,
    y: 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t,
  };
}
