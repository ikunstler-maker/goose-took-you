import { describe, expect, it } from 'vitest';
import { INTERACT_RANGE, NEWS_BROADCAST_TIME, TASKS_PER_PLAYER, TICK } from '../config';
import { rollSlip } from './cargo';
import { STATION_PROPS, stationDistance, taskProgress, WINDOW_TASKS, type TaskKind } from './tasks';
import { applyCommand, createWorld, step, type WorldState } from './world';

const KINDS = Object.keys(STATION_PROPS) as TaskKind[];

/** Puts the chick right next to a task's station on its free side. */
function standAt(state: WorldState, taskId: number): void {
  const task = state.tasks[taskId]!;
  const prop = state.level.props[state.stations[task.station]!.prop]!;
  state.player.x = prop.x;
  state.player.z = prop.z + prop.d / 2 + 0.5;
  step(state, TICK);
}

const taskOf = (state: WorldState, kind: TaskKind): number => state.tasks.find((t) => t.kind === kind)!.id;

describe('tasks', () => {
  it('finds hub stations for every task kind', () => {
    const state = createWorld(42);
    for (const kind of KINDS) expect(state.stations.some((s) => s.kind === kind)).toBe(true);
  });

  it('assigns one task of each kind on distinct stations', () => {
    for (const seed of [1, 7, 42, 999]) {
      const { tasks } = createWorld(seed);
      expect(tasks).toHaveLength(TASKS_PER_PLAYER);
      expect(new Set(tasks.map((t) => t.station)).size).toBe(tasks.length);
      for (const kind of KINDS) {
        expect(tasks.filter((t) => t.kind === kind).length).toBeGreaterThanOrEqual(Math.floor(TASKS_PER_PLAYER / KINDS.length));
      }
    }
    expect(createWorld(5).tasks).toEqual(createWorld(5).tasks);
  });

  it('opens a window task only within reach and fills the shared bar when finished', () => {
    const state = createWorld(42);
    const id = taskOf(state, 'modus');
    expect(applyCommand(state, { type: 'interact' })).toEqual([]);
    standAt(state, id);
    const station = state.stations[state.tasks[id]!.station]!;
    expect(stationDistance(state.level, station, state.player.x, state.player.z)).toBeLessThanOrEqual(INTERACT_RANGE);
    expect(state.prompt).toEqual({ kind: 'task', task: id });
    expect(applyCommand(state, { type: 'interact' })[0]).toMatchObject({ type: 'taskOpened', taskId: id });
    expect(state.activeTask).toBe(id);

    applyCommand(state, { type: 'cancelTask' });
    expect(state.tasks[id]!.done).toBe(false);
    expect(taskProgress(state.tasks)).toBe(0);

    applyCommand(state, { type: 'interact' });
    expect(applyCommand(state, { type: 'finishTask' })).toContainEqual({ type: 'taskDone', taskId: id });
    expect(taskProgress(state.tasks)).toBe(1 / TASKS_PER_PLAYER);
    step(state, TICK);
    expect(state.prompt).not.toEqual({ kind: 'task', task: id });
  });

  it('keeps the chick in place while a mini-game is open', () => {
    const state = createWorld(42);
    standAt(state, taskOf(state, 'copycat'));
    applyCommand(state, { type: 'interact' });
    const { x, z } = state.player;
    applyCommand(state, { type: 'move', x: 1, z: 0 });
    for (let i = 0; i < 30; i++) step(state, TICK);
    expect(state.player.x).toBe(x);
    expect(state.player.z).toBe(z);
  });

  it('starts the Lobby news broadcast when the news edit is done', () => {
    const state = createWorld(42);
    standAt(state, taskOf(state, 'news'));
    expect(applyCommand(state, { type: 'interact' })[0]).toMatchObject({ type: 'taskOpened', kind: 'news' });
    expect(applyCommand(state, { type: 'finishTask' })).toContainEqual({ type: 'broadcastStarted' });
    expect(state.broadcast).toBe(NEWS_BROADCAST_TIME);
    for (let t = 0; t < NEWS_BROADCAST_TIME + 0.1; t += TICK) step(state, TICK);
    expect(state.broadcast).toBe(0);
  });
});

describe('cargo', () => {
  it('is carried from the warehouse to the hinted green zone', () => {
    const state = createWorld(42);
    const id = taskOf(state, 'cargo');
    const task = state.tasks[id]!;
    expect(task.target).not.toBeNull();
    expect(['lounge', 'greenhouse']).toContain(state.level.rooms[task.target!]!.type);
    expect(WINDOW_TASKS).not.toContain('cargo');

    standAt(state, id);
    expect(applyCommand(state, { type: 'interact' })).toEqual([{ type: 'boxPicked', boxId: id }]);
    expect(state.player.carrying).toBe(id);
    expect(task.started).toBe(true);
    expect(state.activeTask).toBeNull();

    // Walking into the target room (teleport stands in for the route) offers to put the box down.
    const box = state.boxes[0]!;
    box.slipAt = -1;
    const room = state.level.rooms[task.target!]!;
    state.player.x = room.cx;
    state.player.z = room.cz;
    step(state, TICK);
    expect(state.prompt).toEqual({ kind: 'deliver', task: id });
    expect(applyCommand(state, { type: 'interact' })).toContainEqual({ type: 'taskDone', taskId: id });
    expect(state.boxes).toHaveLength(0);
    expect(state.player.carrying).toBeNull();
  });

  it('slips out of the wings at the rolled distance and can be picked up again', () => {
    const state = createWorld(42);
    const id = taskOf(state, 'cargo');
    standAt(state, id);
    applyCommand(state, { type: 'interact' });
    const box = state.boxes[0]!;
    box.slipAt = 0.5;
    box.travelled = 0;
    let slipped = false;
    applyCommand(state, { type: 'move', x: 0, z: 1 });
    for (let i = 0; i < 60 && !slipped; i++) slipped = step(state, TICK).some((e) => e.type === 'boxSlipped');
    expect(slipped).toBe(true);
    expect(state.player.carrying).toBeNull();
    expect(box.carrier).toBeNull();
    applyCommand(state, { type: 'move', x: 0, z: 0 });
    step(state, TICK);
    expect(state.prompt).toEqual({ kind: 'pickup', box: box.id });
    applyCommand(state, { type: 'interact' });
    expect(state.player.carrying).toBe(box.id);
  });

  it('slips on roughly BOX_SLIP_CHANCE of routes', () => {
    const box = { id: 1, kind: 'cargo' as const, x: 0, z: 0, carrier: 0, task: 0, travelled: 0, slipAt: -1 };
    let slips = 0;
    const runs = 4000;
    for (let tick = 0; tick < runs; tick++) {
      rollSlip(box, 42, tick * 17);
      if (box.slipAt >= 0) slips++;
    }
    expect(slips / runs).toBeGreaterThan(0.09);
    expect(slips / runs).toBeLessThan(0.15);
  });
});
