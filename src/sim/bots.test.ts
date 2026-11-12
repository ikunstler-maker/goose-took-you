import { describe, expect, it } from 'vitest';
import { TICK } from '../config';
import { cellOf, findPath, fitsIn, nearestFree } from './nav';
import { applyCommand, createWorld, LOCAL_PLAYER, step, type SimEvent, type WorldState } from './world';

/** The player is an idle Goose, so every bot is a chick and nobody gets packed. */
function started(seed: number): WorldState {
  const state = createWorld(seed, undefined, 'goose');
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

/** Runs the match with an idle player until every bot task is done or time runs out. */
function runBots(state: WorldState, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  const botTasks = state.tasks.filter((t) => t.owner !== LOCAL_PLAYER);
  for (let t = 0; t < seconds && !botTasks.every((task) => task.done); t += TICK) events.push(...step(state, TICK));
  return events;
}

describe('nav', () => {
  it('finds a route from the spawn to every room', () => {
    for (const seed of [1, 13, 42]) {
      const state = createWorld(seed);
      for (const room of state.level.rooms) {
        const target = nearestFree(state.nav, room.cx, room.cz, 12);
        expect(target, `seed ${seed} ${room.type}`).toBeGreaterThanOrEqual(0);
        const path = findPath(state.nav, fitsIn(state.level, state.buckets), state.level.spawn.x, state.level.spawn.z, target);
        expect(path, `seed ${seed} ${room.type}`).not.toBeNull();
        const end = path![path!.length - 1]!;
        expect(cellOf(state.nav, end.x, end.z)).toBe(target);
      }
    }
  });
});

describe('bots', () => {
  it('stay put in the lobby', () => {
    const state = createWorld(3);
    const before = state.participants.map((p) => [p.x, p.z]);
    for (let i = 0; i < 300; i++) step(state, TICK);
    expect(state.participants.map((p) => [p.x, p.z])).toEqual(before);
  });

  it('walk to their stations, finish all their tasks (cargo included) and win', () => {
    for (const seed of [1, 42, 77]) {
      const state = started(seed);
      const events = runBots(state, 600);
      const botTasks = state.tasks.filter((t) => t.owner !== LOCAL_PLAYER);
      const left = botTasks.filter((t) => !t.done).map((t) => `${t.owner}:${t.kind}`);
      expect(left, `seed ${seed}`).toEqual([]);
      expect(events.some((e) => e.type === 'boxPicked' && e.who !== LOCAL_PLAYER)).toBe(true);
      expect(state.boxes).toHaveLength(0);
      expect(state.winner).toBe('chicks');
      expect(events.some((e) => e.type === 'gameOver')).toBe(true);
    }
  }, 120_000);

  it('pick a slipped box back up and still deliver it', () => {
    const state = started(42);
    const bot = state.participants.find((p) => p.isBot)!;
    const cargo = state.tasks.find((t) => t.owner === bot.id && t.kind === 'cargo')!;
    // Let the bot get its box first, then force a slip a couple of metres later.
    let forced = false;
    let slipped = false;
    for (let t = 0; t < 600 && !cargo.done; t += TICK) {
      const box = state.boxes.find((b) => b.task === cargo.id);
      if (box && box.carrier === bot.id && !forced) {
        box.slipAt = box.travelled + 2;
        forced = true;
      }
      if (step(state, TICK).some((e) => e.type === 'boxSlipped' && e.who === bot.id)) slipped = true;
    }
    expect(slipped).toBe(true);
    expect(cargo.done).toBe(true);
  }, 120_000);

  it('is deterministic for a seed', () => {
    const a = started(9);
    const b = started(9);
    for (let i = 0; i < 1200; i++) {
      step(a, TICK);
      step(b, TICK);
    }
    expect(a.participants.map((p) => [p.x, p.z])).toEqual(b.participants.map((p) => [p.x, p.z]));
  });
});
