import { BADGE_MAX_TIME, BADGE_MIN_TIME, BADGE_TRACK_DONE } from '../../config';

export type SwipeResult = 'ok' | 'tooFast' | 'tooSlow' | 'short';

/** «Сканер бейджа»: drag the badge through the reader at a steady pace. */
export interface BadgeState {
  /** Time since the swipe began, or null when the badge is not held. */
  elapsed: number | null;
  /** Badge position along the track, 0..1. */
  pos: number;
  last: SwipeResult | null;
  done: boolean;
}

export function createBadge(): BadgeState {
  return { elapsed: null, pos: 0, last: null, done: false };
}

export function grab(state: BadgeState): void {
  if (state.done) return;
  state.elapsed = 0;
  state.pos = 0;
}

export function tickBadge(state: BadgeState, dt: number): void {
  if (state.elapsed !== null) state.elapsed += dt;
}

/** The badge only moves forward along the reader. */
export function drag(state: BadgeState, pos: number): void {
  if (state.elapsed === null) return;
  state.pos = Math.max(state.pos, Math.min(1, Math.max(0, pos)));
}

export function release(state: BadgeState): SwipeResult | null {
  if (state.elapsed === null) return null;
  const time = state.elapsed;
  let result: SwipeResult;
  if (state.pos < BADGE_TRACK_DONE) result = 'short';
  else if (time < BADGE_MIN_TIME) result = 'tooFast';
  else if (time > BADGE_MAX_TIME) result = 'tooSlow';
  else result = 'ok';
  state.elapsed = null;
  state.last = result;
  if (result === 'ok') state.done = true;
  else state.pos = 0;
  return result;
}
