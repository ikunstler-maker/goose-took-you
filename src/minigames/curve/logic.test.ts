import { describe, expect, it } from 'vitest';
import { CURVE_TOLERANCE_MAX, CURVE_TOLERANCE_MIN } from '../../config';
import { createCurve, curveError, curvePoint, isCurveMatched, moveHandle } from './logic';

describe('curve mini-game', () => {
  it('never starts solved', () => {
    for (let seed = 1; seed < 60; seed++) expect(isCurveMatched(createCurve(seed))).toBe(false);
  });

  it('is solved by dragging both handles onto the reference, even after a changed brief', () => {
    let rebriefs = 0;
    let flips = 0;
    for (let seed = 1; seed < 60; seed++) {
      const state = createCurve(seed);
      expect(state.tolerance).toBeGreaterThanOrEqual(CURVE_TOLERANCE_MIN);
      expect(state.tolerance).toBeLessThanOrEqual(CURVE_TOLERANCE_MAX);
      if (state.flipped) flips++;
      for (let pass = 0; pass < 2; pass++) state.target.forEach((t, i) => moveHandle(state, i, t.x + state.tolerance / 2, t.y));
      if (state.rebriefed) rebriefs++;
      expect(state.rebrief).toBeNull();
      expect(isCurveMatched(state)).toBe(true);
    }
    expect(rebriefs).toBeGreaterThan(5);
    expect(flips).toBeGreaterThan(5);
    const state = createCurve(7);
    moveHandle(state, 1, 2, -1);
    expect(state.handles[1]).toEqual({ x: 1, y: 0 });
    expect(curveError(state)).toBeGreaterThan(CURVE_TOLERANCE_MAX);
  });

  it('runs from (0,0) to (1,1)', () => {
    const a = { x: 0.2, y: 0.8 };
    const b = { x: 0.8, y: 0.2 };
    expect(curvePoint(a, b, 0)).toEqual({ x: 0, y: 0 });
    expect(curvePoint(a, b, 1)).toEqual({ x: 1, y: 1 });
  });
});
