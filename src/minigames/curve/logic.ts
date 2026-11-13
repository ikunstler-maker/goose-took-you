import { CURVE_MIN_START_OFFSET, CURVE_TOLERANCE } from '../../config';
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
  return { target, handles };
}

export function moveHandle(state: CurveState, index: number, x: number, y: number): void {
  const h = state.handles[index];
  if (!h) return;
  h.x = clamp01(x);
  h.y = clamp01(y);
}

/** Largest handle distance from its target. */
export function curveError(state: CurveState): number {
  return Math.max(...state.handles.map((h, i) => Math.hypot(h.x - state.target[i]!.x, h.y - state.target[i]!.y)));
}

export function isCurveMatched(state: CurveState): boolean {
  return curveError(state) <= CURVE_TOLERANCE;
}

/** Point on the cubic bezier from (0,0) to (1,1) through both handles. */
export function curvePoint(a: Handle, b: Handle, t: number): Handle {
  const u = 1 - t;
  return {
    x: 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t,
    y: 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t,
  };
}
