import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TICK } from '../config';
import { applyCommand, createWorld, step } from './world';

/**
 * Balance meter, off by default: `BALANCE=100 npx vitest run src/sim/balance.test.ts`
 * plays that many matches with bots on all eight seats and prints who won and how.
 * `BALANCE_OUT=<file>` also writes the summary there.
 */
const matches = Number(process.env.BALANCE) || 0;
/** A match that runs this long without a winner counts as a draw, seconds. */
const LIMIT = 1200;

export function playBots(seed: number): { winner: string; how: string; seconds: number } {
  const state = createWorld(seed);
  applyCommand(state, 0, { type: 'start' });
  // The person leaves at once: a bot covers the seat, so all eight are bots.
  applyCommand(state, 0, { type: 'leave' });
  let ejectedGoose = false;
  while (state.phase !== 'over' && state.tick * TICK < LIMIT) {
    for (const e of step(state, TICK)) {
      if (e.type === 'meetingEnded' && e.ejected !== null && state.participants[e.ejected]!.role === 'goose') ejectedGoose = true;
    }
  }
  const how = state.winner === null ? 'timeout' : state.winner === 'goose' ? (state.lostTo ?? 'packed') : ejectedGoose ? 'ejected' : 'tasks';
  return { winner: state.winner ?? 'none', how, seconds: Math.round(state.tick * TICK) };
}

describe('balance meter', () => {
  it.runIf(matches > 0)('plays bot-only matches and reports the split', () => {
    const tally: Record<string, number> = {};
    let goose = 0;
    let seconds = 0;
    for (let seed = 1; seed <= matches; seed++) {
      const result = playBots(seed);
      if (result.winner === 'goose') goose++;
      tally[`${result.winner}:${result.how}`] = (tally[`${result.winner}:${result.how}`] ?? 0) + 1;
      seconds += result.seconds;
    }
    const summary = `goose ${goose}/${matches} | ${JSON.stringify(tally)} | avg ${Math.round(seconds / matches)} s`;
    console.log(summary);
    if (process.env.BALANCE_OUT) writeFileSync(process.env.BALANCE_OUT, summary);
    expect(goose).toBeGreaterThan(0);
  }, 3_600_000);

  it('a bot-only match runs to a result', () => {
    const result = playBots(3);
    expect(['goose', 'chicks']).toContain(result.winner);
  }, 120_000);
});
