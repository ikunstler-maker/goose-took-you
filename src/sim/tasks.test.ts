import { describe, expect, it } from 'vitest';
import { INTERACT_RANGE, TASKS_PER_PLAYER, TICK } from '../config';
import { STATION_PROPS, stationDistance, taskProgress } from './tasks';
import { applyCommand, createWorld, step, type WorldState } from './world';

/** Puts the chick right next to a task's station on its free side. */
function standAt(state: WorldState, taskId: number): void {
  const task = state.tasks[taskId]!;
  const prop = state.level.props[state.stations[task.station]!.prop]!;
  state.player.x = prop.x;
  state.player.z = prop.z + prop.d / 2 + 0.5;
  step(state, TICK);
}

describe('tasks', () => {
  it('finds hub stations for every task kind', () => {
    const state = createWorld(42);
    for (const kind of Object.keys(STATION_PROPS)) {
      expect(state.stations.some((s) => s.kind === kind)).toBe(true);
    }
  });

  it('assigns a fixed number of tasks on distinct stations, every kind at least once', () => {
    for (const seed of [1, 7, 42, 999]) {
      const { tasks } = createWorld(seed);
      expect(tasks).toHaveLength(TASKS_PER_PLAYER);
      expect(new Set(tasks.map((t) => t.station)).size).toBe(tasks.length);
      for (const kind of Object.keys(STATION_PROPS)) {
        const count = tasks.filter((t) => t.kind === kind).length;
        // Round-robin: kinds differ by at most one task.
        expect(count).toBeGreaterThanOrEqual(Math.floor(TASKS_PER_PLAYER / Object.keys(STATION_PROPS).length));
      }
    }
    expect(createWorld(5).tasks).toEqual(createWorld(5).tasks);
  });

  it('opens a task only within reach and fills the shared bar when finished', () => {
    const state = createWorld(42);
    expect(applyCommand(state, { type: 'interact' })).toEqual([]);
    standAt(state, 0);
    const station = state.stations[state.tasks[0]!.station]!;
    expect(stationDistance(state.level, station, state.player.x, state.player.z)).toBeLessThanOrEqual(INTERACT_RANGE);
    expect(state.reachableTask).toBe(0);
    const opened = applyCommand(state, { type: 'interact' });
    expect(opened[0]).toMatchObject({ type: 'taskOpened', taskId: 0 });
    expect(state.activeTask).toBe(0);

    applyCommand(state, { type: 'cancelTask' });
    expect(state.tasks[0]!.done).toBe(false);
    expect(taskProgress(state.tasks)).toBe(0);

    applyCommand(state, { type: 'interact' });
    expect(applyCommand(state, { type: 'finishTask' })).toEqual([{ type: 'taskClosed', taskId: 0, done: true }]);
    expect(taskProgress(state.tasks)).toBe(1 / TASKS_PER_PLAYER);
    step(state, TICK);
    expect(state.reachableTask).not.toBe(0);
  });

  it('keeps the chick in place while a mini-game is open', () => {
    const state = createWorld(42);
    standAt(state, 0);
    applyCommand(state, { type: 'interact' });
    const { x, z } = state.player;
    applyCommand(state, { type: 'move', x: 1, z: 0 });
    for (let i = 0; i < 30; i++) step(state, TICK);
    expect(state.player.x).toBe(x);
    expect(state.player.z).toBe(z);
  });
});
