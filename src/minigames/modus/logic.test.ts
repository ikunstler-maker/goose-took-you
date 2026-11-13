import { describe, expect, it } from 'vitest';
import { MODUS_RETRY_DELAY, MODUS_TARGET, TICK } from '../../config';
import { closeSticker, createModus, tickModus } from './logic';

const run = (state: ReturnType<typeof createModus>, seconds: number): void => {
  for (let t = 0; t < seconds; t += TICK) tickModus(state, TICK);
};

describe('modus mini-game', () => {
  it('is won by closing enough stickers as they appear', () => {
    const state = createModus(3);
    let guard = 0;
    while (state.status !== 'won' && guard++ < 10_000) {
      tickModus(state, TICK);
      const first = state.stickers[0];
      if (first) closeSticker(state, first.id, 'bin');
    }
    expect(state.status).toBe('won');
    expect(state.closed).toBe(MODUS_TARGET);
  });

  it('is lost when stickers pile up, then restarts', () => {
    const lostOnce = createModus(3);
    let sawLoss = false;
    for (let t = 0; t < 60 && !sawLoss; t += TICK) {
      tickModus(lostOnce, TICK);
      sawLoss = lostOnce.status === 'lost';
    }
    expect(sawLoss).toBe(true);
    expect(lostOnce.chaos).toBe(100);
    run(lostOnce, MODUS_RETRY_DELAY + TICK);
    expect(lostOnce.status).toBe('playing');
    expect(lostOnce.chaos).toBe(0);
    expect(lostOnce.closed).toBe(0);
  });

  it('rolls special edits: urgent takes two closes, sticky only the bin, runners move', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const state = createModus(seed);
      run(state, 4);
      for (const s of state.stickers) kinds.add(s.kind);
      const urgent = state.stickers.find((s) => s.kind === 'urgent');
      if (urgent) {
        expect(closeSticker(state, urgent.id)).toBe(false);
        expect(closeSticker(state, urgent.id)).toBe(true);
      }
      const sticky = state.stickers.find((s) => s.kind === 'sticky');
      if (sticky) {
        expect(closeSticker(state, sticky.id, 'cross')).toBe(false);
        expect(closeSticker(state, sticky.id, 'bin')).toBe(true);
      }
      const runner = state.stickers.find((s) => s.kind === 'runner');
      if (runner) {
        const { x, y } = runner;
        tickModus(state, 0.1);
        expect(Math.hypot(runner.x - x, runner.y - y)).toBeGreaterThan(0);
        expect(runner.x).toBeGreaterThan(0.1);
        expect(runner.x).toBeLessThan(0.9);
      }
    }
    expect(kinds.size).toBe(4);
  });

  it('ignores unknown stickers and is deterministic per seed', () => {
    const a = createModus(9);
    const b = createModus(9);
    run(a, 5);
    run(b, 5);
    closeSticker(a, 12345);
    expect(a.closed).toBe(0);
    expect(a.stickers).toEqual(b.stickers);
  });
});
