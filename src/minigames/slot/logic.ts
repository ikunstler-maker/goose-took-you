import { SLOT_DECOYS, SLOT_MIN_SPEED, SLOT_SLOWDOWN, SLOT_START_SPEED_MAX, SLOT_START_SPEED_MIN, SLOT_SYMBOLS } from '../../config';
import { createRng } from '../../sim/rng';

/** Everything a reel can show. Targets, their look-alike decoys, and plain fillers. */
export type SlotSymbol = 'seven' | 'axe' | 'egg' | 'button' | 'feather' | 'banana' | 'coin' | 'cap' | 'cherry' | 'star' | 'bell';

/** What to collect this round, and the look-alike that crowds the reels. */
export interface SlotTheme {
  target: SlotSymbol;
  decoy: SlotSymbol;
}

export const SLOT_THEMES: readonly SlotTheme[] = [
  { target: 'seven', decoy: 'axe' },
  { target: 'egg', decoy: 'button' },
  { target: 'feather', decoy: 'banana' },
  { target: 'coin', decoy: 'cap' },
];

const FILLERS: readonly SlotSymbol[] = ['cherry', 'star', 'bell'];

/** «Занос на 777»: stop three reels on the round's target, left to right. A miss respins the reel slower. Satire only: no bets. */
export interface SlotState {
  theme: SlotTheme;
  /** Symbols on each reel, top to bottom; every reel has exactly one target. */
  strips: SlotSymbol[][];
  /** Continuous reel positions in symbols. */
  pos: number[];
  speed: number[];
  /** Reel the stop button acts on; 3 means all locked. */
  current: number;
  /** Symbol each reel stopped on last, or null while spinning. */
  stopped: (SlotSymbol | null)[];
}

export function createSlot(seed: number): SlotState {
  const rng = createRng(seed);
  const theme = rng.pick(SLOT_THEMES);
  // Other rounds' targets and decoys pad the reel, so the eye has to work.
  const others = SLOT_THEMES.filter((t) => t !== theme).flatMap((t) => [t.target, t.decoy]);
  const strips = [0, 1, 2].map(() => {
    const pad = rng.shuffle([...FILLERS, ...others]).slice(0, SLOT_SYMBOLS - 1 - SLOT_DECOYS);
    return rng.shuffle<SlotSymbol>([theme.target, ...Array.from({ length: SLOT_DECOYS }, () => theme.decoy), ...pad]);
  });
  const speed = SLOT_START_SPEED_MIN + rng.next() * (SLOT_START_SPEED_MAX - SLOT_START_SPEED_MIN);
  return {
    theme,
    strips,
    pos: [0, 1, 2].map(() => rng.next() * SLOT_SYMBOLS),
    // Later reels spin a little faster.
    speed: [0, 1, 2].map((i) => speed * (1 + i * 0.12)),
    current: 0,
    stopped: [null, null, null],
  };
}

/** Symbol under the win line of a reel. */
export const symbolAt = (state: SlotState, reel: number): SlotSymbol =>
  state.strips[reel]![Math.floor(state.pos[reel]! + 0.5) % SLOT_SYMBOLS]!;

export function tickSlot(state: SlotState, dt: number): void {
  for (let i = 0; i < 3; i++) {
    // Locked reels and a reel showing its miss stand still.
    if (i < state.current || state.stopped[i] !== null) continue;
    state.pos[i] = (state.pos[i]! + state.speed[i]! * dt) % SLOT_SYMBOLS;
  }
}

/** Stops the current reel; returns true on the round's target. */
export function stopReel(state: SlotState): boolean {
  const i = state.current;
  if (i > 2 || state.stopped[i] !== null) return false;
  const symbol = symbolAt(state, i);
  state.pos[i] = Math.floor(state.pos[i]! + 0.5) % SLOT_SYMBOLS;
  state.stopped[i] = symbol;
  if (symbol === state.theme.target) {
    state.current++;
    return true;
  }
  state.speed[i] = Math.max(SLOT_MIN_SPEED, state.speed[i]! * SLOT_SLOWDOWN);
  return false;
}

/** True when the last stop landed on the look-alike rather than a random symbol. */
export const hitDecoy = (state: SlotState): boolean => state.current <= 2 && state.stopped[state.current] === state.theme.decoy;

/** A missed reel starts spinning again. */
export function respin(state: SlotState): void {
  const i = state.current;
  if (i <= 2) state.stopped[i] = null;
}

export const isJackpot = (state: SlotState): boolean => state.current > 2;
