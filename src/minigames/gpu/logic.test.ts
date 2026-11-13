import { describe, expect, it } from 'vitest';
import { GPU_HOLD_TIME, TICK } from '../../config';
import { createGpu, inZone, tickGpu } from './logic';

describe('GPU mini-game', () => {
  it('overheats without the fan', () => {
    const state = createGpu(3);
    for (let i = 0; i < 10 / TICK; i++) tickGpu(state, TICK, false);
    expect(state.temp).toBe(1);
    expect(state.done).toBe(false);
  });

  it('is won by pulsing the fan to stay in the green zone', () => {
    const state = createGpu(3);
    let time = 0;
    while (!state.done && time < 30) {
      // A simple player: fan on above the middle of the zone.
      tickGpu(state, TICK, state.temp > 0.5);
      time += TICK;
    }
    expect(state.done).toBe(true);
    expect(time).toBeGreaterThanOrEqual(GPU_HOLD_TIME);
  });

  it('resets the hold timer when leaving the zone', () => {
    const state = createGpu(3);
    state.temp = 0.5;
    tickGpu(state, 0.2, true);
    expect(state.held).toBeGreaterThan(0);
    state.temp = 0.95;
    tickGpu(state, TICK, false);
    expect(inZone(state.temp)).toBe(false);
    expect(state.held).toBe(0);
  });
});
