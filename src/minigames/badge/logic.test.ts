import { describe, expect, it } from 'vitest';
import { BADGE_MAX_NAILS, BADGE_TIME_MAX, BADGE_TIME_MIN } from '../../config';
import { createBadge, drag, flip, grab, release, tickBadge, type BadgeState, type SwipeResult } from './logic';

/** One full swipe lasting `time`; stops early if a nail gets stuck. */
function swipe(state: BadgeState, time: number, to = 1): SwipeResult | null {
  grab(state);
  tickBadge(state, time);
  return drag(state, to) ?? release(state);
}

const ideal = (state: BadgeState): number => (state.minTime + state.maxTime) / 2;

describe('badge mini-game', () => {
  it('rolls a different reader each round: direction, pace, card side', () => {
    const dirs = new Set<string>();
    const sides = new Set<boolean>();
    const paces = new Set<number>();
    for (let seed = 1; seed < 60; seed++) {
      const state = createBadge(seed);
      dirs.add(state.dir);
      sides.add(state.flipped);
      paces.add(Math.round(ideal(state) * 10));
      expect(ideal(state)).toBeGreaterThanOrEqual(BADGE_TIME_MIN);
      expect(ideal(state)).toBeLessThanOrEqual(BADGE_TIME_MAX);
    }
    expect(dirs.size).toBe(4);
    expect(sides.size).toBe(2);
    expect(paces.size).toBeGreaterThan(5);
  });

  it('is always winnable: flip when needed, keep the pace, outlast the nails', () => {
    for (let seed = 1; seed < 60; seed++) {
      const state = createBadge(seed);
      let tries = 0;
      while (!state.done && tries++ < 20) {
        if (state.flipped) flip(state);
        swipe(state, ideal(state));
      }
      expect(state.done).toBe(true);
      expect(state.nails).toBeLessThanOrEqual(BADGE_MAX_NAILS);
    }
  });

  it('rejects the wrong side, the wrong pace and half swipes', () => {
    const results = new Set<SwipeResult | null>();
    for (let seed = 1; seed < 40; seed++) {
      const a = createBadge(seed);
      a.flipped = true;
      results.add(swipe(a, ideal(a)));
      const b = createBadge(seed);
      b.flipped = false;
      results.add(swipe(b, b.minTime / 2));
      const c = createBadge(seed);
      c.flipped = false;
      results.add(swipe(c, c.maxTime * 2));
      const d = createBadge(seed);
      d.flipped = false;
      const short = swipe(d, ideal(d), 0.25);
      expect(short).toBe('short');
    }
    for (const r of ['wrongSide', 'tooFast', 'tooSlow', 'nail'] as const) expect(results.has(r)).toBe(true);
    expect(results.has('ok')).toBe(false);
  });

  it('cannot be flipped mid-swipe and ignores a release without a grab', () => {
    const state = createBadge(3);
    expect(release(state)).toBeNull();
    const side = state.flipped;
    grab(state);
    flip(state);
    expect(state.flipped).toBe(side);
  });
});
