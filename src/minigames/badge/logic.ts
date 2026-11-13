import {
  BADGE_FLIP_CHANCE,
  BADGE_MAX_NAILS,
  BADGE_NAIL_CHANCE,
  BADGE_REFLIP_CHANCE,
  BADGE_TIME_MAX,
  BADGE_TIME_MIN,
  BADGE_TIME_WINDOW,
  BADGE_TRACK_DONE,
} from '../../config';
import { createRng, type Rng } from '../../sim/rng';

export type SwipeResult = 'ok' | 'tooFast' | 'tooSlow' | 'short' | 'nail' | 'wrongSide';
/** Which way the card travels through the reader. */
export type SwipeDir = 'right' | 'left' | 'down' | 'up';
const DIRS: readonly SwipeDir[] = ['right', 'left', 'down', 'up'];

/**
 * «Сканер бейджа»: drag the card through the reader at this reader's pace and
 * in its direction, stripe side to the reader. Nails get stuck now and then.
 */
export interface BadgeState {
  rng: Rng;
  dir: SwipeDir;
  /** Accepted swipe duration, seconds. */
  minTime: number;
  maxTime: number;
  /** The card is held wrong side up; flip it before swiping. */
  flipped: boolean;
  /** Track position where a nail gets stuck on this swipe, or null. */
  snagAt: number | null;
  nails: number;
  /** Time since the swipe began, or null when the card is not held. */
  elapsed: number | null;
  /** Card position along the track, 0..1. */
  pos: number;
  last: SwipeResult | null;
  done: boolean;
}

export function createBadge(seed: number): BadgeState {
  const rng = createRng(seed);
  const dir = rng.pick(DIRS);
  const time = BADGE_TIME_MIN + rng.next() * (BADGE_TIME_MAX - BADGE_TIME_MIN);
  return {
    rng,
    dir,
    minTime: time * (1 - BADGE_TIME_WINDOW),
    maxTime: time * (1 + BADGE_TIME_WINDOW),
    flipped: rng.next() < BADGE_FLIP_CHANCE,
    snagAt: null,
    nails: 0,
    elapsed: null,
    pos: 0,
    last: null,
    done: false,
  };
}

/** Turns the card over; only while it is not being swiped. */
export function flip(state: BadgeState): void {
  if (state.elapsed === null && !state.done) state.flipped = !state.flipped;
}

export function grab(state: BadgeState): void {
  if (state.done) return;
  state.elapsed = 0;
  state.pos = 0;
  const snag = state.nails < BADGE_MAX_NAILS && state.rng.next() < BADGE_NAIL_CHANCE;
  state.snagAt = snag ? 0.3 + state.rng.next() * 0.5 : null;
}

export function tickBadge(state: BadgeState, dt: number): void {
  if (state.elapsed !== null) state.elapsed += dt;
}

function fail(state: BadgeState, result: SwipeResult): SwipeResult {
  state.elapsed = null;
  state.pos = 0;
  state.last = result;
  // Fumbling the card may turn it over.
  if (state.rng.next() < BADGE_REFLIP_CHANCE) state.flipped = !state.flipped;
  return result;
}

/** The card only moves forward; returns `nail` when the swipe just got stuck. */
export function drag(state: BadgeState, pos: number): SwipeResult | null {
  if (state.elapsed === null) return null;
  state.pos = Math.max(state.pos, Math.min(1, Math.max(0, pos)));
  if (state.snagAt !== null && state.pos >= state.snagAt && !state.flipped) {
    state.nails++;
    return fail(state, 'nail');
  }
  return null;
}

export function release(state: BadgeState): SwipeResult | null {
  if (state.elapsed === null) return null;
  const time = state.elapsed;
  if (state.pos < BADGE_TRACK_DONE) return fail(state, 'short');
  if (state.flipped) return fail(state, 'wrongSide');
  if (time < state.minTime) return fail(state, 'tooFast');
  if (time > state.maxTime) return fail(state, 'tooSlow');
  state.elapsed = null;
  state.last = 'ok';
  state.done = true;
  return 'ok';
}
