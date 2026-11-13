import {
  MODUS_CHAOS_PER_STICKER,
  MODUS_CHAOS_RELIEF,
  MODUS_MAX_STICKERS,
  MODUS_RETRY_DELAY,
  MODUS_RUNNER_SPEED,
  MODUS_SPECIAL_MAX,
  MODUS_SPECIAL_MIN,
  MODUS_SPAWN_MIN,
  MODUS_SPAWN_RAMP,
  MODUS_SPAWN_START,
  MODUS_TARGET,
} from '../../config';
import { createRng, type Rng } from '../../sim/rng';

/** Number of edit phrases in i18n (`minigame.modus.note1..N`). */
export const MODUS_NOTES = 11;

/**
 * plain: cross or bin · urgent: must be closed twice · runner: drifts around
 * the board · sticky: the cross is torn off, only the bin takes it.
 */
export type StickerKind = 'plain' | 'urgent' | 'runner' | 'sticky';
const SPECIALS: readonly StickerKind[] = ['urgent', 'runner', 'sticky'];

export interface Sticker {
  id: number;
  kind: StickerKind;
  /** Closes left before it goes away; 2 for a fresh urgent edit. */
  hits: number;
  /** Drift, board widths per second; zero unless a runner. */
  vx: number;
  vy: number;
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
  /** This round's mood: how many edits are special and which special kind Modus favours. */
  specialShare: number;
  favourite: StickerKind;
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
  const rng = createRng(seed);
  return {
    specialShare: MODUS_SPECIAL_MIN + rng.next() * (MODUS_SPECIAL_MAX - MODUS_SPECIAL_MIN),
    favourite: rng.pick(SPECIALS),
    rng,
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
  let kind: StickerKind = 'plain';
  if (rng.next() < state.specialShare) kind = rng.next() < 0.6 ? state.favourite : rng.pick(SPECIALS);
  const angle = rng.next() * Math.PI * 2;
  const speed = kind === 'runner' ? MODUS_RUNNER_SPEED : 0;
  state.stickers.push({
    id: state.nextId++,
    kind,
    hits: kind === 'urgent' ? 2 : 1,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
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
  for (const sticker of state.stickers) {
    if (sticker.vx === 0 && sticker.vy === 0) continue;
    sticker.x += sticker.vx * dt;
    sticker.y += sticker.vy * dt;
    // Runaway edits bounce off the edges of the board.
    if (sticker.x < 0.14 || sticker.x > 0.86) sticker.vx = Math.sign(0.5 - sticker.x) * Math.abs(sticker.vx);
    if (sticker.y < 0.16 || sticker.y > 0.78) sticker.vy = Math.sign(0.5 - sticker.y) * Math.abs(sticker.vy);
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

/**
 * Closes a sticker by its cross or by dropping it in the bin. Returns false
 * when it stays: unknown id, a sticky one hit on the cross, or the first hit
 * on an urgent one.
 */
export function closeSticker(state: ModusState, id: number, via: 'cross' | 'bin' = 'cross'): boolean {
  if (state.status !== 'playing') return false;
  const index = state.stickers.findIndex((s) => s.id === id);
  if (index < 0) return false;
  const sticker = state.stickers[index]!;
  if (sticker.kind === 'sticky' && via === 'cross') return false;
  if (--sticker.hits > 0) return false;
  state.stickers.splice(index, 1);
  state.closed++;
  state.chaos = Math.max(0, state.chaos - MODUS_CHAOS_RELIEF);
  if (state.closed >= MODUS_TARGET) {
    state.status = 'won';
    state.stickers = [];
  }
  return true;
}
