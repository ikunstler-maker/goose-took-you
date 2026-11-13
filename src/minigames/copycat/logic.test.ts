import { describe, expect, it } from 'vitest';
import { COPYCAT_WIRES_MAX, COPYCAT_WIRES_MIN } from '../../config';
import { connect, createCopycat, isMatched, matchRatio, toggleSwitch } from './logic';

describe('copycat mini-game', () => {
  it('starts unmatched with a non-trivial target', () => {
    for (let seed = 1; seed < 50; seed++) {
      const state = createCopycat(seed);
      expect(state.targetSwitches).toContain(true);
      expect(state.targetWires.every((v, i) => v === i)).toBe(false);
      expect(isMatched(state)).toBe(false);
    }
  });

  /** Copies the reference as it stands now; twice, in case the competitor updates it mid-way. */
  const copy = (state: ReturnType<typeof createCopycat>): void => {
    for (let pass = 0; pass < 2; pass++) {
      state.targetWires.forEach((right, left) => connect(state, left, right));
      state.targetSwitches.forEach((on, i) => {
        if (on !== state.switches[i]) toggleSwitch(state, i);
      });
    }
  };

  it('reaches 100% by copying wires and switches, whatever the board size', () => {
    const sizes = new Set<number>();
    let mono = 0;
    let updates = 0;
    for (let seed = 1; seed < 60; seed++) {
      const state = createCopycat(seed);
      sizes.add(state.wires.length);
      expect(state.wires.length).toBeGreaterThanOrEqual(COPYCAT_WIRES_MIN);
      expect(state.wires.length).toBeLessThanOrEqual(COPYCAT_WIRES_MAX);
      if (state.mono) mono++;
      copy(state);
      if (state.updated) updates++;
      expect(state.updatePending).toBe(false);
      expect(matchRatio(state)).toBe(1);
      expect(isMatched(state)).toBe(true);
      toggleSwitch(state, 0);
      expect(isMatched(state)).toBe(false);
    }
    expect(sizes.size).toBe(COPYCAT_WIRES_MAX - COPYCAT_WIRES_MIN + 1);
    expect(mono).toBeGreaterThan(5);
    expect(updates).toBeGreaterThan(5);
  });

  it('lets a right node hold only one wire', () => {
    const state = createCopycat(4);
    state.updatePending = false;
    connect(state, 0, 2);
    connect(state, 1, 2);
    expect(state.wires[0]).toBeNull();
    expect(state.wires[1]).toBe(2);
  });
});
