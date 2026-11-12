import {
  MODUS_CHAOS_PER_STICKER,
  MODUS_CHAOS_RELIEF,
  MODUS_MAX_STICKERS,
  MODUS_RETRY_DELAY,
  MODUS_SPAWN_MIN,
  MODUS_SPAWN_RAMP,
  MODUS_SPAWN_START,
  MODUS_TARGET,
} from '../../config';
import { createRng, type Rng } from '../../sim/rng';

/** Number of edit phrases in i18n (`minigame.modus.note1..N`). */
export const MODUS_NOTES = 8;

export interface Sticker {
  id: number;
  /** Position of the sticker's centre, 0..1 of the board. */
  x: number;
  y: number;
  /** Phrase number, 1..MODUS_NOTES. */
  note: number;
  /** Slight tilt in degrees; pure looks. */
  tilt: number;
}

export interface ModusState {
  rng: Rng;
  stickers: Sticker[];
  nextId: number;
  closed: number;
  /** 0..100 */
  chaos: number;
  spawnIn: number;
  /** Seconds left of the "chaos won" pause; a fresh round starts after it. */
  retryIn: number;
  status: 'playing' | 'lost' | 'won';
}

export function createModus(seed: number): ModusState {
  return {
    rng: createRng(seed),
    stickers: [],
    nextId: 1,
    closed: 0,
    chaos: 0,
    spawnIn: 0.3,
    retryIn: 0,
    status: 'playing',
  };
}

function spawn(state: ModusState): void {
  const { rng } = state;
  state.stickers.push({
    id: state.nextId++,
    x: 0.14 + rng.next() * 0.72,
    y: 0.16 + rng.next() * 0.62,
    note: 1 + rng.int(MODUS_NOTES),
    tilt: -8 + rng.next() * 16,
  });
}

export function tickModus(state: ModusState, dt: number): void {
  if (state.status === 'won') return;
  if (state.status === 'lost') {
    state.retryIn -= dt;
    if (state.retryIn <= 0) {
      state.stickers = [];
      state.closed = 0;
      state.chaos = 0;
      state.spawnIn = 0.3;
      state.status = 'playing';
    }
    return;
  }
  state.spawnIn -= dt;
  if (state.spawnIn <= 0) {
    if (state.stickers.length < MODUS_MAX_STICKERS) spawn(state);
    state.spawnIn = Math.max(MODUS_SPAWN_MIN, MODUS_SPAWN_START - state.closed * MODUS_SPAWN_RAMP);
  }
  state.chaos = Math.min(100, state.chaos + state.stickers.length * MODUS_CHAOS_PER_STICKER * dt);
  if (state.chaos >= 100) {
    state.status = 'lost';
    state.retryIn = MODUS_RETRY_DELAY;
  }
}

/** Closes a sticker (cross button or dropped in the bin). */
export function closeSticker(state: ModusState, id: number): void {
  if (state.status !== 'playing') return;
  const index = state.stickers.findIndex((s) => s.id === id);
  if (index < 0) return;
  state.stickers.splice(index, 1);
  state.closed++;
  state.chaos = Math.max(0, state.chaos - MODUS_CHAOS_RELIEF);
  if (state.closed >= MODUS_TARGET) {
    state.status = 'won';
    state.stickers = [];
  }
}
