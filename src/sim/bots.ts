import {
  BOT_AVOID_TIME,
  BOT_GIVE_UP,
  BOT_IDLE_MAX,
  BOT_IDLE_MIN,
  BOT_START_DELAY,
  BOT_STUCK_DISTANCE,
  BOT_TASK_MAX,
  BOT_TASK_MIN,
  INTERACT_RANGE,
} from '../config';
import { cellCentre, findPath, fitsIn, nearestFree, type NavGrid } from './nav';
import { createRng, type Rng } from './rng';
import { stationDistance, WINDOW_TASKS } from './tasks';
import type { Command, Participant, SimEvent, WorldState } from './world';

/** What a bot is heading for. */
export type Goal =
  | { kind: 'task'; task: number }
  | { kind: 'deliver'; task: number }
  | { kind: 'pickup'; box: number }
  | { kind: 'wander' };

/** A bot's plan; plain data so the whole world stays serialisable. */
export interface Brain {
  goal: Goal | null;
  /** Remaining waypoints, metres. */
  path: { x: number; z: number }[];
  /** Seconds to stand still before thinking again. */
  wait: number;
  /** Seconds left at a window task before the bot reports it done. */
  work: number;
  /** Stuck detection: position one second ago and the time since. */
  checkX: number;
  checkZ: number;
  checkTime: number;
  /** The last waypoint was reached; now waiting for the goal's prompt. */
  arrived: boolean;
  /** Seconds spent at the goal without the matching prompt. */
  atGoal: number;
  /** A task given up on for a while (someone else's box in the way, etc.). */
  avoid: number | null;
  avoidLeft: number;
}

export function createBrain(rng: Rng): Brain {
  return {
    goal: null,
    path: [],
    wait: rng.next() * BOT_START_DELAY,
    work: 0,
    checkX: 0,
    checkZ: 0,
    checkTime: 0,
    arrived: false,
    atGoal: 0,
    avoid: null,
    avoidLeft: 0,
  };
}

type Send = (who: number, command: Command) => SimEvent[];

const between = (rng: Rng, a: number, b: number): number => a + rng.next() * (b - a);

/** Free cells next to a station, close enough to get its prompt, best first. */
function standCells(state: WorldState, nav: NavGrid, stationId: number): number[] {
  const station = state.stations[stationId]!;
  const prop = state.level.props[station.prop]!;
  const found: { cell: number; d: number }[] = [];
  const reach = Math.ceil((Math.max(prop.w, prop.d) / 2 + INTERACT_RANGE) / nav.step) + 1;
  const cx = Math.floor(prop.x / nav.step);
  const cz = Math.floor(prop.z / nav.step);
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const gx = cx + dx;
      const gz = cz + dz;
      if (gx < 0 || gz < 0 || gx >= nav.cols || gz >= nav.cols) continue;
      const cell = gz * nav.cols + gx;
      if (nav.free[cell] !== 1) continue;
      const c = cellCentre(nav, cell);
      const d = stationDistance(state.level, station, c.x, c.z);
      if (d <= INTERACT_RANGE - 0.3) found.push({ cell, d });
    }
  }
  return found.sort((a, b) => a.d - b.d).map((f) => f.cell);
}

function roomCell(state: WorldState, nav: NavGrid, roomId: number, rng: Rng): number {
  const room = state.level.rooms[roomId]!;
  // A few tries at random spots inside the room's bounds; fall back to its centre.
  for (let i = 0; i < 6; i++) {
    const x = room.cx + (rng.next() - 0.5) * 8;
    const z = room.cz + (rng.next() - 0.5) * 8;
    const cell = nearestFree(nav, x, z, 4);
    if (cell >= 0 && state.level.zone[Math.floor(cellCentre(nav, cell).z) * state.level.size + Math.floor(cellCentre(nav, cell).x)] === roomId) {
      return cell;
    }
  }
  return nearestFree(nav, room.cx, room.cz, 12);
}

function chooseGoal(state: WorldState, bot: Participant, avoid: number | null): Goal {
  if (bot.carrying !== null) {
    const box = state.boxes.find((b) => b.id === bot.carrying)!;
    return { kind: 'deliver', task: box.task };
  }
  const dropped = state.boxes.find((b) => b.carrier === null && state.tasks[b.task]!.owner === bot.id);
  if (dropped) return { kind: 'pickup', box: dropped.id };
  const task = state.tasks.find((t) => t.owner === bot.id && !t.done && !t.started && t.id !== avoid);
  return task ? { kind: 'task', task: task.id } : { kind: 'wander' };
}

/** Candidate end cells for a goal; the first one with a route wins. */
function destinations(state: WorldState, nav: NavGrid, goal: Goal, rng: Rng): number[] {
  switch (goal.kind) {
    case 'task': {
      // Spread the tries around the desk: some spots near it can be closed-in pockets.
      const cells = standCells(state, nav, state.tasks[goal.task]!.station);
      const picks: number[] = [];
      for (let i = 0; i < cells.length && picks.length < STAND_TRIES; i += Math.max(1, Math.floor(cells.length / STAND_TRIES))) {
        picks.push(cells[i]!);
      }
      return picks;
    }
    case 'deliver': {
      const target = state.tasks[goal.task]!.target;
      return target === null ? [] : [roomCell(state, nav, target, rng)];
    }
    case 'pickup': {
      const box = state.boxes.find((b) => b.id === goal.box);
      return box ? [nearestFree(nav, box.x, box.z, 4)] : [];
    }
    case 'wander':
      return [roomCell(state, nav, rng.int(state.level.rooms.length), rng)];
  }
}

const STAND_TRIES = 6;
/** How close counts as reaching a waypoint; small, so a bot really steps around corners. */
const WAYPOINT_REACH = 0.12;

/** True when the bot's current prompt is the one its goal needs. */
function promptFits(bot: Participant, goal: Goal): boolean {
  const p = bot.prompt;
  if (!p) return false;
  if (goal.kind === 'task') return p.kind === 'task' && p.task === goal.task;
  if (goal.kind === 'deliver') return p.kind === 'deliver';
  if (goal.kind === 'pickup') return p.kind === 'pickup' && p.box === goal.box;
  return false;
}

/** One bot's decision for this tick. Bots act only through `send`, the same commands the player uses. */
export function thinkBot(state: WorldState, nav: NavGrid, bot: Participant, dt: number, send: Send): SimEvent[] {
  const brain = bot.brain;
  if (!brain || state.phase !== 'play') return [];
  const rng = createRng(((state.level.seed * 7919 + bot.id * 104729 + state.tick) >>> 0) || 1);
  const events: SimEvent[] = [];
  const halt = (): void => {
    if (bot.moveX !== 0 || bot.moveZ !== 0) events.push(...send(bot.id, { type: 'move', x: 0, z: 0 }));
  };

  if (bot.activeTask !== null) {
    brain.work -= dt;
    if (brain.work <= 0) {
      events.push(...send(bot.id, { type: 'finishTask' }));
      brain.goal = null;
      brain.wait = between(rng, 0.3, 1);
    }
    return events;
  }
  if (brain.wait > 0) {
    brain.wait -= dt;
    halt();
    return events;
  }

  brain.avoidLeft = Math.max(0, brain.avoidLeft - dt);
  if (brain.avoidLeft === 0) brain.avoid = null;
  // Re-think when the goal is gone or no longer what matters most.
  const wanted = chooseGoal(state, bot, brain.avoid);
  const sameWander = brain.goal?.kind === 'wander' && wanted.kind === 'wander';
  if (!sameWander && JSON.stringify(brain.goal) !== JSON.stringify(wanted)) {
    brain.goal = wanted;
    brain.path = [];
    brain.arrived = false;
    brain.atGoal = 0;
  }
  const goal = brain.goal!;

  if (promptFits(bot, goal)) {
    halt();
    events.push(...send(bot.id, { type: 'interact' }));
    const task = goal.kind === 'task' ? state.tasks[goal.task]! : null;
    if (task && WINDOW_TASKS.includes(task.kind)) brain.work = between(rng, BOT_TASK_MIN, BOT_TASK_MAX);
    brain.goal = null;
    brain.path = [];
    return events;
  }

  if (brain.path.length === 0) {
    if (brain.arrived) {
      // At the goal: wait for its prompt a moment, then let it go for a while.
      brain.atGoal += dt;
      halt();
      if (goal.kind === 'wander' || brain.atGoal > BOT_GIVE_UP) {
        if (goal.kind === 'task') {
          brain.avoid = goal.task;
          brain.avoidLeft = BOT_AVOID_TIME;
        }
        brain.goal = null;
        brain.arrived = false;
        brain.atGoal = 0;
        brain.wait = between(rng, BOT_IDLE_MIN, BOT_IDLE_MAX);
      }
      return events;
    }
    let path: { x: number; z: number }[] | null = null;
    for (const target of destinations(state, nav, goal, rng)) {
      path = target >= 0 ? findPath(nav, fitsIn(state.level, state.buckets), bot.x, bot.z, target) : null;
      if (path) break;
    }
    if (!path) {
      if (goal.kind === 'task') {
        brain.avoid = goal.task;
        brain.avoidLeft = BOT_AVOID_TIME;
      }
      brain.goal = null;
      brain.wait = between(rng, BOT_IDLE_MIN, BOT_IDLE_MAX);
      return events;
    }
    brain.path = path;
    brain.checkX = bot.x;
    brain.checkZ = bot.z;
    brain.checkTime = 0;
  }

  const next = brain.path[0]!;
  const dx = next.x - bot.x;
  const dz = next.z - bot.z;
  if (Math.hypot(dx, dz) < WAYPOINT_REACH) {
    brain.path.shift();
    if (brain.path.length === 0) {
      // Arrival: the next ticks wait for the prompt instead of re-planning.
      brain.arrived = true;
      halt();
    }
    return events;
  }
  events.push(...send(bot.id, { type: 'move', x: dx, z: dz }));

  brain.checkTime += dt;
  if (brain.checkTime >= 1) {
    if (Math.hypot(bot.x - brain.checkX, bot.z - brain.checkZ) < BOT_STUCK_DISTANCE) brain.path = [];
    brain.checkX = bot.x;
    brain.checkZ = bot.z;
    brain.checkTime = 0;
  }
  return events;
}
