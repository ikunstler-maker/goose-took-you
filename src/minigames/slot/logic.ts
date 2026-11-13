import { SLOT_MIN_SPEED, SLOT_SLOWDOWN, SLOT_START_SPEED, SLOT_SYMBOLS } from '../../config';
import { createRng } from '../../sim/rng';

/** Symbol index that means «7». Other symbols are drawn as fruit/eggs. */
export const SEVEN = 0;

/** «Занос на 777»: stop three reels on 7, left to right. A miss respins the reel slower. Satire only: no bets. */
export interface SlotState {
  /** Continuous reel positions in symbols; the visible symbol is floor(pos) mod SLOT_SYMBOLS. */
  pos: number[];
  speed: number[];
  /** Reel the stop button acts on; 3 means all locked. */
  current: number;
  /** Symbol each reel stopped on last, or null while spinning. */
  stopped: (number | null)[];
}

export function createSlot(seed: number): SlotState {
  const rng = createRng(seed);
  return {
    pos: [0, 1, 2].map(() => rng.next() * SLOT_SYMBOLS),
    speed: [0, 1, 2].map(() => SLOT_START_SPEED),
    current: 0,
    stopped: [null, null, null],
  };
}

export const symbolAt = (pos: number): number => Math.floor(pos + 0.5) % SLOT_SYMBOLS;

export function tickSlot(state: SlotState, dt: number): void {
  for (let i = 0; i < 3; i++) {
    // Locked reels and a reel showing its miss stand still.
    if (i < state.current || state.stopped[i] !== null) continue;
    state.pos[i] = (state.pos[i]! + state.speed[i]! * dt) % SLOT_SYMBOLS;
  }
}

/** Stops the current reel; returns true on a 7. */
export function stopReel(state: SlotState): boolean {
  const i = state.current;
  if (i > 2) return false;
  const symbol = symbolAt(state.pos[i]!);
  state.pos[i] = symbol;
  if (symbol === SEVEN) {
    state.stopped[i] = SEVEN;
    state.current++;
    return true;
  }
  state.stopped[i] = symbol;
  state.speed[i] = Math.max(SLOT_MIN_SPEED, state.speed[i]! * SLOT_SLOWDOWN);
  return false;
}

/** A missed reel starts spinning again on the next tick. */
export function respin(state: SlotState): void {
  const i = state.current;
  if (i <= 2) state.stopped[i] = null;
}

export const isJackpot = (state: SlotState): boolean => state.current > 2;
