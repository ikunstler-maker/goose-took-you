import { describe, expect, it } from 'vitest';
import { BADGE_MAX_TIME, BADGE_MIN_TIME } from '../../config';
import { createBadge, drag, grab, release, tickBadge } from './logic';

const swipe = (time: number, to = 1) => {
  const state = createBadge();
  grab(state);
  tickBadge(state, time);
  drag(state, to);
  return { state, result: release(state) };
};

describe('badge mini-game', () => {
  it('accepts a steady swipe', () => {
    const { state, result } = swipe((BADGE_MIN_TIME + BADGE_MAX_TIME) / 2);
    expect(result).toBe('ok');
    expect(state.done).toBe(true);
  });

  it('rejects too fast, too slow and half swipes', () => {
    expect(swipe(BADGE_MIN_TIME / 2).result).toBe('tooFast');
    expect(swipe(BADGE_MAX_TIME * 2).result).toBe('tooSlow');
    expect(swipe(BADGE_MIN_TIME + 0.1, 0.5).result).toBe('short');
  });

  it('only moves forward and ignores release without a grab', () => {
    const state = createBadge();
    expect(release(state)).toBeNull();
    grab(state);
    drag(state, 0.6);
    drag(state, 0.2);
    expect(state.pos).toBe(0.6);
  });
});
