import { describe, expect, it } from 'vitest';
import { CURVE_TOLERANCE } from '../../config';
import { createCurve, curveError, curvePoint, isCurveMatched, moveHandle } from './logic';

describe('curve mini-game', () => {
  it('never starts solved', () => {
    for (let seed = 1; seed < 60; seed++) expect(isCurveMatched(createCurve(seed))).toBe(false);
  });

  it('is solved by dragging both handles onto the reference', () => {
    const state = createCurve(7);
    state.target.forEach((t, i) => moveHandle(state, i, t.x + CURVE_TOLERANCE / 2, t.y));
    expect(isCurveMatched(state)).toBe(true);
    moveHandle(state, 1, 2, -1);
    expect(state.handles[1]).toEqual({ x: 1, y: 0 });
    expect(curveError(state)).toBeGreaterThan(CURVE_TOLERANCE);
  });

  it('runs from (0,0) to (1,1)', () => {
    const a = { x: 0.2, y: 0.8 };
    const b = { x: 0.8, y: 0.2 };
    expect(curvePoint(a, b, 0)).toEqual({ x: 0, y: 0 });
    expect(curvePoint(a, b, 1)).toEqual({ x: 1, y: 1 });
  });
});
