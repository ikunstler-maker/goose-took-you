import { describe, expect, it } from 'vitest';
import { SLOT_MIN_SPEED, SLOT_START_SPEED, SLOT_SYMBOLS, TICK } from '../../config';
import { createSlot, isJackpot, respin, SEVEN, stopReel, symbolAt, tickSlot } from './logic';

describe('slot mini-game', () => {
  it('locks reels on 7 left to right', () => {
    const state = createSlot(5);
    for (let reel = 0; reel < 3; reel++) {
      state.pos[reel] = SEVEN + 0.2;
      expect(stopReel(state)).toBe(true);
    }
    expect(isJackpot(state)).toBe(true);
  });

  it('slows a reel after a miss, never below the floor', () => {
    const state = createSlot(5);
    for (let k = 0; k < 20; k++) {
      state.pos[0] = 3;
      expect(stopReel(state)).toBe(false);
      respin(state);
    }
    expect(state.speed[0]).toBe(SLOT_MIN_SPEED);
    expect(state.speed[1]).toBe(SLOT_START_SPEED);
  });

  it('is winnable by a player who waits for the 7', () => {
    const state = createSlot(9);
    let time = 0;
    while (!isJackpot(state) && time < 60) {
      tickSlot(state, TICK);
      time += TICK;
      if (symbolAt(state.pos[state.current]!) === SEVEN) stopReel(state);
    }
    expect(isJackpot(state)).toBe(true);
    expect(state.pos.every((p) => p % SLOT_SYMBOLS === SEVEN)).toBe(true);
  });
});
