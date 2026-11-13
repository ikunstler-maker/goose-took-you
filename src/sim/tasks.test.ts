import { describe, expect, it } from 'vitest';
import { INTERACT_RANGE, NEWS_BROADCAST_TIME, NEWS_BUTTON_TIME, TASKS_PER_PLAYER, TICK } from '../config';
import { rollSlip } from './cargo';
import { STATION_PROPS, stationDistance, taskProgress, WINDOW_TASKS, type TaskKind } from './tasks';
import { applyCommand, createWorld as createLobby, LOCAL_PLAYER, me, step, type WorldState } from './world';

/** A world past the lobby, ready to play. */
function createWorld(seed: number) {
  const state = createLobby(seed);
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

const KINDS = Object.keys(STATION_PROPS) as TaskKind[];

/** Puts the chick right next to a task's station on its free side. */
function standAt(state: WorldState, taskId: number): void {
  const task = state.tasks[taskId]!;
  const prop = state.level.props[state.stations[task.station]!.prop]!;
  me(state).x = prop.x;
  me(state).z = prop.z + prop.d / 2 + 0.5;
  step(state, TICK);
}

const taskOf = (state: WorldState, kind: TaskKind): number =>
  state.tasks.find((t) => t.kind === kind && t.owner === LOCAL_PLAYER)!.id;

/** First world from seed 42 up where the local player owns a task of `kind`. */
function worldWith(kind: TaskKind): WorldState {
  for (let seed = 42; ; seed++) {
    const state = createWorld(seed);
    if (state.tasks.some((t) => t.kind === kind && t.owner === LOCAL_PLAYER)) return state;
  }
}

describe('tasks', () => {
  it('finds hub stations for every task kind', () => {
    const state = createWorld(42);
    for (const kind of KINDS) expect(state.stations.some((s) => s.kind === kind)).toBe(true);
  });

  it('assigns one task of each kind on distinct stations', () => {
    for (const seed of [1, 7, 42, 999]) {
      const tasks = createWorld(seed).tasks.filter((t) => t.owner === LOCAL_PLAYER);
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
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'interact' })).toEqual([]);
    standAt(state, id);
    const station = state.stations[state.tasks[id]!.station]!;
    expect(stationDistance(state.level, station, me(state).x, me(state).z)).toBeLessThanOrEqual(INTERACT_RANGE);
    expect(me(state).prompt).toEqual({ kind: 'task', task: id });
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'interact' })[0]).toMatchObject({ type: 'taskOpened', taskId: id });
    expect(me(state).activeTask).toBe(id);

    applyCommand(state, LOCAL_PLAYER, { type: 'cancelTask' });
    expect(state.tasks[id]!.done).toBe(false);
    expect(taskProgress(state.tasks)).toBe(0);

    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'finishTask' })).toContainEqual({ type: 'taskDone', who: 0, taskId: id });
    expect(taskProgress(state.tasks)).toBe(1 / state.tasks.length);
    step(state, TICK);
    expect(me(state).prompt).not.toEqual({ kind: 'task', task: id });
  });

  it('keeps the chick in place while a mini-game is open', () => {
    const state = worldWith('copycat');
    standAt(state, taskOf(state, 'copycat'));
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    const { x, z } = me(state);
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 1, z: 0 });
    for (let i = 0; i < 30; i++) step(state, TICK);
    expect(me(state).x).toBe(x);
    expect(me(state).z).toBe(z);
  });

  /** Cuts the news edit; returns the task id, with the button rush running. */
  function cutNews(state: WorldState): number {
    const id = taskOf(state, 'news');
    standAt(state, id);
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'interact' })[0]).toMatchObject({ type: 'taskOpened', kind: 'news' });
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'finishTask' })).toContainEqual({ type: 'rushStarted', who: LOCAL_PLAYER, taskId: id });
    expect(state.tasks[id]!.done).toBe(false);
    expect(state.broadcast).toBe(0);
    return id;
  }

  it('airs the news only after a dash to the Giant Green Button in the room', () => {
    const state = worldWith('news');
    const id = cutNews(state);
    const button = state.level.props.find((p) => p.hub && p.kind === 'greenButton')!;
    expect(button.room).toBe(state.stations[state.tasks[id]!.station]!.room);
    me(state).x = button.x - button.w / 2 - 0.5;
    me(state).z = button.z;
    step(state, TICK);
    expect(me(state).prompt).toEqual({ kind: 'greenButton', task: id });
    const events = applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(events).toContainEqual({ type: 'broadcastStarted' });
    expect(events).toContainEqual({ type: 'newsLaunched', who: LOCAL_PLAYER, x: button.x, z: button.z });
    expect(state.tasks[id]!.done).toBe(true);
    expect(state.broadcast).toBe(NEWS_BROADCAST_TIME);
    for (let t = 0; t < NEWS_BROADCAST_TIME + 0.1; t += TICK) step(state, TICK);
    expect(state.broadcast).toBe(0);
  });

  it('makes the editor cut again when the button is not reached in time', () => {
    const state = worldWith('news');
    for (const p of state.participants) if (p.brain) p.brain.wait = 1e9;
    const id = cutNews(state);
    step(state, TICK);
    expect(me(state).prompt).toBeNull();
    const events: unknown[] = [];
    for (let t = 0; t < NEWS_BUTTON_TIME + 0.1; t += TICK) events.push(...step(state, TICK));
    expect(events).toContainEqual({ type: 'rushFailed', who: LOCAL_PLAYER, taskId: id });
    expect(state.tasks[id]!.done).toBe(false);
    expect(me(state).prompt).toEqual({ kind: 'task', task: id });
  });
});

describe('cargo', () => {
  it('is carried from the warehouse to the hinted green zone', () => {
    const state = worldWith('cargo');
    const id = taskOf(state, 'cargo');
    const task = state.tasks[id]!;
    expect(task.target).not.toBeNull();
    expect(['lounge', 'greenhouse']).toContain(state.level.rooms[task.target!]!.type);
    expect(WINDOW_TASKS).not.toContain('cargo');

    standAt(state, id);
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'interact' })).toEqual([{ type: 'boxPicked', who: 0, boxId: id }]);
    expect(me(state).carrying).toBe(id);
    expect(task.started).toBe(true);
    expect(me(state).activeTask).toBeNull();

    // Walking into the target room (teleport stands in for the route) offers to put the box down.
    const box = state.boxes[0]!;
    box.slipAt = -1;
    const room = state.level.rooms[task.target!]!;
    me(state).x = room.cx;
    me(state).z = room.cz;
    step(state, TICK);
    expect(me(state).prompt).toEqual({ kind: 'deliver', task: id });
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'interact' })).toContainEqual({ type: 'taskDone', who: 0, taskId: id });
    expect(state.boxes).toHaveLength(0);
    expect(me(state).carrying).toBeNull();
  });

  it('slips out of the wings at the rolled distance and can be picked up again', () => {
    const state = worldWith('cargo');
    const id = taskOf(state, 'cargo');
    standAt(state, id);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    const box = state.boxes[0]!;
    box.slipAt = 0.5;
    box.travelled = 0;
    let slipped = false;
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 0, z: 1 });
    for (let i = 0; i < 60 && !slipped; i++) slipped = step(state, TICK).some((e) => e.type === 'boxSlipped');
    expect(slipped).toBe(true);
    expect(me(state).carrying).toBeNull();
    expect(box.carrier).toBeNull();
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 0, z: 0 });
    step(state, TICK);
    expect(me(state).prompt).toEqual({ kind: 'pickup', box: box.id });
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(me(state).carrying).toBe(box.id);
  });

  it('slips on roughly BOX_SLIP_CHANCE of routes', () => {
    const box = { id: 1, kind: 'cargo' as const, x: 0, z: 0, carrier: 0, task: 0, travelled: 0, slipAt: -1, inside: null, reported: false };
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

describe('visited rooms', () => {
  it('starts with the lobby and remembers each room once', () => {
    const state = createWorld(42);
    const self = me(state);
    expect(self.visited).toEqual([self.roomId]);
    const other = state.level.rooms.find((r) => r.id !== self.roomId)!;
    for (let k = 0; k < 2; k++) {
      self.x = other.cx;
      self.z = other.cz;
      step(state, TICK);
      self.x = state.level.spawn.x;
      self.z = state.level.spawn.z;
      step(state, TICK);
    }
    expect(self.visited).toEqual([state.level.rooms.find((r) => r.type === 'lobby')!.id, other.id]);
  });
});

describe('badge', () => {
  it('has one reader by a door of the security room, with free floor next to it', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { level } = createLobby(seed);
      const readers = level.props.filter((p) => p.hub && p.kind === 'badgeScanner');
      expect(readers).toHaveLength(1);
      const reader = readers[0]!;
      expect(level.rooms[reader.room]!.type).toBe('security');
      const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
        const x = Math.floor(reader.x) + dx!;
        const z = Math.floor(reader.z) + dz!;
        return level.zone[z * level.size + x] === reader.room && !level.props.some((p) => p.solid && Math.abs(p.x - x - 0.5) < p.w / 2 && Math.abs(p.z - z - 0.5) < p.d / 2);
      });
      expect(free).toBe(true);
    }
  });

  it('is a card from the rack, then a swipe at the reader', () => {
    const state = worldWith('badge');
    const id = taskOf(state, 'badge');
    const task = state.tasks[id]!;
    expect(state.level.props[state.stations[task.station]!.prop]!.kind).toBe('badgeRack');
    standAt(state, id);
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'interact' })).toEqual([{ type: 'badgeTaken', who: LOCAL_PLAYER, taskId: id }]);
    expect(me(state).activeTask).toBeNull();
    expect(state.stations[task.station]!.kind).toBe('gate');
    step(state, TICK);
    expect(me(state).prompt).toBeNull();
    // Stand on any free side of the reader.
    const reader = state.level.props[state.stations[task.station]!.prop]!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      me(state).x = reader.x + dx! * 1;
      me(state).z = reader.z + dz! * 1;
      step(state, TICK);
      if (me(state).prompt) break;
    }
    expect(me(state).prompt).toEqual({ kind: 'task', task: id });
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'interact' })[0]).toMatchObject({ type: 'taskOpened', kind: 'badge' });
  });
});
