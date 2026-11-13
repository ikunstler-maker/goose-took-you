import { describe, expect, it } from 'vitest';
import { SLOT_DECOYS, SLOT_MIN_SPEED, SLOT_SYMBOLS, TICK } from '../../config';
import { createSlot, hitDecoy, isJackpot, respin, SLOT_THEMES, stopReel, symbolAt, tickSlot } from './logic';

describe('slot mini-game', () => {
  it('rolls every theme, with one target and look-alike decoys on each reel', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 80; seed++) {
      const state = createSlot(seed);
      seen.add(state.theme.target);
      for (const strip of state.strips) {
        expect(strip).toHaveLength(SLOT_SYMBOLS);
        expect(strip.filter((s) => s === state.theme.target)).toHaveLength(1);
        expect(strip.filter((s) => s === state.theme.decoy)).toHaveLength(SLOT_DECOYS);
      }
    }
    expect(seen.size).toBe(SLOT_THEMES.length);
  });

  it('locks reels on the target left to right', () => {
    const state = createSlot(5);
    for (let reel = 0; reel < 3; reel++) {
      state.pos[reel] = state.strips[reel]!.indexOf(state.theme.target) + 0.2;
      expect(stopReel(state)).toBe(true);
    }
    expect(isJackpot(state)).toBe(true);
  });

  it('treats the look-alike as a miss and slows the reel, never below the floor', () => {
    const state = createSlot(5);
    const start = state.speed[1];
    for (let k = 0; k < 20; k++) {
      state.pos[0] = state.strips[0]!.indexOf(state.theme.decoy);
      expect(stopReel(state)).toBe(false);
      expect(hitDecoy(state)).toBe(true);
      respin(state);
    }
    expect(state.speed[0]).toBe(SLOT_MIN_SPEED);
    expect(state.speed[1]).toBe(start);
  });

  it('is winnable by a player who waits for the target', () => {
    for (const seed of [9, 10, 11, 12]) {
      const state = createSlot(seed);
      let time = 0;
      while (!isJackpot(state) && time < 60) {
        tickSlot(state, TICK);
        time += TICK;
        if (symbolAt(state, state.current) === state.theme.target) stopReel(state);
      }
      expect(isJackpot(state)).toBe(true);
    }
  });
});
