import { describe, expect, it } from 'vitest';
import { GPU_HOLD_MIN, TICK } from '../../config';
import { createGpu, inZone, tickGpu, zone } from './logic';

describe('GPU mini-game', () => {
  it('overheats without the fan', () => {
    const state = createGpu(3);
    for (let i = 0; i < 10 / TICK; i++) tickGpu(state, TICK, false);
    expect(state.temp).toBe(1);
    expect(state.done).toBe(false);
  });

  it('is won on every card by pulsing the fan around the middle of its zone', () => {
    const widths = new Set<number>();
    let drifting = 0;
    for (let seed = 1; seed < 40; seed++) {
      const state = createGpu(seed);
      widths.add(Math.round(state.width * 100));
      if (state.drift > 0) drifting++;
      let time = 0;
      while (!state.done && time < 60) {
        const { low, high } = zone(state);
        tickGpu(state, TICK, state.temp > (low + high) / 2);
        time += TICK;
      }
      expect(state.done).toBe(true);
      expect(time).toBeGreaterThanOrEqual(GPU_HOLD_MIN);
    }
    expect(widths.size).toBeGreaterThan(5);
    expect(drifting).toBeGreaterThan(5);
  });

  it('resets the hold timer when leaving the zone', () => {
    const state = createGpu(3);
    state.temp = state.centre;
    state.drift = 0;
    tickGpu(state, TICK, true);
    expect(state.held).toBeGreaterThan(0);
    state.temp = 0.95;
    tickGpu(state, TICK, false);
    expect(inZone(state)).toBe(false);
    expect(state.held).toBe(0);
  });
});
