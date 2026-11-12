import {
  BORED_AFTER,
  DIZZY_COOLDOWN,
  DIZZY_TIME,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SURPRISED_TIME,
} from '../config';
import { blocked, buildBuckets, generateLevel, roomAt, type Buckets, type Level } from './level';
import { assignTasks, findStations, taskInReach, type Station, type Task, type TaskKind } from './tasks';
import { computeVisibility } from './vision';

/** What the chick's face shows; driven by what just happened to it. */
export type Emotion = 'calm' | 'happy' | 'dizzy' | 'surprised' | 'bored';

export interface PlayerState {
  x: number;
  z: number;
  /** Heading in radians; 0 faces south (+z). */
  facing: number;
  moving: boolean;
  moveX: number;
  moveZ: number;
  emotion: Emotion;
  /** Seconds left of a timed emotion (dizzy, surprised). */
  emotionTime: number;
  idleTime: number;
  /** Seconds of unobstructed movement; a bump only counts after a run-up. */
  runTime: number;
  bumpCooldown: number;
}

export interface WorldState {
  level: Level;
  buckets: Buckets;
  player: PlayerState;
  /** Room the player stands in, or null in a corridor. */
  roomId: number | null;
  /** 1 for every floor cell the player currently sees. */
  visible: Uint8Array;
  /** Bumped whenever `visible` is recomputed. */
  visibleVersion: number;
  stations: Station[];
  tasks: Task[];
  /** Task the player could start with `interact` right now. */
  reachableTask: number | null;
  /** Task whose mini-game is open; the chick stands still meanwhile, the office does not. */
  activeTask: number | null;
  tick: number;
}

export type Command =
  | { type: 'move'; x: number; z: number }
  | { type: 'interact' }
  | { type: 'finishTask' }
  | { type: 'cancelTask' };

export type SimEvent =
  | { type: 'roomChanged'; roomId: number | null }
  | { type: 'bumped' }
  | { type: 'reachChanged'; taskId: number | null }
  /** `seed` feeds the mini-game's own RNG so a round is reproducible. */
  | { type: 'taskOpened'; taskId: number; kind: TaskKind; seed: number }
  | { type: 'taskClosed'; taskId: number; done: boolean };

/** Local player id until roles and bots arrive in stage 3. */
export const LOCAL_PLAYER = 0;

export function createWorld(seed: number): WorldState {
  const level = generateLevel(seed);
  const stations = findStations(level);
  const state: WorldState = {
    level,
    buckets: buildBuckets(level),
    player: {
      x: level.spawn.x,
      z: level.spawn.z,
      facing: 0,
      moving: false,
      moveX: 0,
      moveZ: 0,
      emotion: 'calm',
      emotionTime: 0,
      idleTime: 0,
      runTime: 0,
      bumpCooldown: 0,
    },
    roomId: roomAt(level, level.spawn.x, level.spawn.z)?.id ?? null,
    visible: new Uint8Array(level.size * level.size),
    visibleVersion: 1,
    stations,
    tasks: assignTasks(stations, seed, LOCAL_PLAYER),
    reachableTask: null,
    activeTask: null,
    tick: 0,
  };
  computeVisibility(level, state.player.x, state.player.z, state.visible);
  return state;
}

/** Applies a command; returns events it caused immediately. */
export function applyCommand(state: WorldState, command: Command): SimEvent[] {
  switch (command.type) {
    case 'move': {
      const length = Math.hypot(command.x, command.z);
      state.player.moveX = length > 1e-6 ? command.x / length : 0;
      state.player.moveZ = length > 1e-6 ? command.z / length : 0;
      return [];
    }
    case 'interact': {
      if (state.activeTask !== null || state.reachableTask === null) return [];
      const task = state.tasks[state.reachableTask]!;
      if (task.done) return [];
      state.activeTask = task.id;
      const seed = ((state.level.seed * 31 + task.id * 997 + state.tick) >>> 0) || 1;
      return [{ type: 'taskOpened', taskId: task.id, kind: task.kind, seed }];
    }
    case 'finishTask':
    case 'cancelTask': {
      if (state.activeTask === null) return [];
      const task = state.tasks[state.activeTask]!;
      const done = command.type === 'finishTask';
      if (done) task.done = true;
      state.activeTask = null;
      return [{ type: 'taskClosed', taskId: task.id, done }];
    }
  }
}

export function step(state: WorldState, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  const player = state.player;
  const { level, buckets } = state;
  player.moving = state.activeTask === null && (player.moveX !== 0 || player.moveZ !== 0);
  player.bumpCooldown = Math.max(0, player.bumpCooldown - dt);
  player.emotionTime = Math.max(0, player.emotionTime - dt);

  if (player.moving) {
    player.facing = Math.atan2(player.moveX, player.moveZ);
    player.idleTime = 0;
    const fromX = player.x;
    const fromZ = player.z;
    // Axes are resolved separately so the chick slides along walls.
    const nextX = player.x + player.moveX * PLAYER_SPEED * dt;
    const hitX = player.moveX !== 0 && blocked(level, buckets, nextX, player.z, PLAYER_RADIUS);
    if (!hitX) player.x = nextX;
    const nextZ = player.z + player.moveZ * PLAYER_SPEED * dt;
    const hitZ = player.moveZ !== 0 && blocked(level, buckets, player.x, nextZ, PLAYER_RADIUS);
    if (!hitZ) player.z = nextZ;

    if (hitX || hitZ) {
      // Running into something at speed leaves the chick dizzy.
      if (player.runTime > 0.3 && player.bumpCooldown === 0) {
        player.emotion = 'dizzy';
        player.emotionTime = DIZZY_TIME;
        player.bumpCooldown = DIZZY_COOLDOWN;
        events.push({ type: 'bumped' });
      }
      player.runTime = 0;
    } else {
      player.runTime += dt;
    }

    if (Math.floor(fromX * 4) !== Math.floor(player.x * 4) || Math.floor(fromZ * 4) !== Math.floor(player.z * 4)) {
      computeVisibility(level, player.x, player.z, state.visible);
      state.visibleVersion++;
    }
  } else {
    player.idleTime += dt;
    player.runTime = 0;
  }

  const roomId = roomAt(level, player.x, player.z)?.id ?? null;
  if (roomId !== state.roomId) {
    state.roomId = roomId;
    events.push({ type: 'roomChanged', roomId });
    if (roomId !== null && player.emotion !== 'dizzy') {
      player.emotion = 'surprised';
      player.emotionTime = SURPRISED_TIME;
    }
  }

  const reach = taskInReach(level, state.stations, state.tasks, LOCAL_PLAYER, player.x, player.z)?.id ?? null;
  if (reach !== state.reachableTask) {
    state.reachableTask = reach;
    events.push({ type: 'reachChanged', taskId: reach });
  }

  if (player.emotionTime === 0) {
    player.emotion = player.moving ? 'happy' : player.idleTime > BORED_AFTER ? 'bored' : 'calm';
  }
  state.tick++;
  return events;
}
