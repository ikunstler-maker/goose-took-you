import { describe, expect, it } from 'vitest';
import { COPYCAT_SWITCHES, COPYCAT_WIRES } from '../../config';
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

  it('reaches 100% by copying wires and switches', () => {
    const state = createCopycat(4);
    state.targetWires.forEach((right, left) => connect(state, left, right));
    state.targetSwitches.forEach((on, i) => {
      if (on) toggleSwitch(state, i);
    });
    expect(matchRatio(state)).toBe(1);
    expect(isMatched(state)).toBe(true);
    toggleSwitch(state, 0);
    expect(matchRatio(state)).toBeCloseTo((COPYCAT_WIRES + COPYCAT_SWITCHES - 1) / (COPYCAT_WIRES + COPYCAT_SWITCHES));
  });

  it('lets a right node hold only one wire', () => {
    const state = createCopycat(4);
    connect(state, 0, 2);
    connect(state, 1, 2);
    expect(state.wires[0]).toBeNull();
    expect(state.wires[1]).toBe(2);
  });
});
