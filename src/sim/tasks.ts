import { INTERACT_RANGE, TASKS_PER_PLAYER } from '../config';
import type { Level } from './level';
import type { PropKind, RoomType } from './prefabs';
import { createRng } from './rng';
import { propDistance } from './sabotage';

/** Mini-game that completes a task. Folder names in `src/minigames/`. */
export type TaskKind = 'modus' | 'copycat' | 'news' | 'cargo' | 'lines';

/** Hub furniture that hosts each task kind. */
export const STATION_PROPS: Record<TaskKind, PropKind> = {
  modus: 'deskBuyer',
  copycat: 'deskCopy',
  news: 'dualStation',
  cargo: 'shelf',
  lines: 'briefTablet',
};

/** Tasks that open a mini-game window; the rest are done in the office itself. */
export const WINDOW_TASKS: readonly TaskKind[] = ['modus', 'copycat', 'news', 'lines'];

/** Rooms a cargo box can be ordered to; the task list gives only a vague hint. */
export const CARGO_DESTINATIONS: readonly RoomType[] = ['lounge', 'greenhouse'];

/** A workplace where a task can be done; points at a hub prop. */
export interface Station {
  id: number;
  kind: TaskKind;
  prop: number;
  room: number;
}

export interface Task {
  id: number;
  kind: TaskKind;
  station: number;
  /** Participant the task belongs to; 0 is the local player until roles arrive. */
  owner: number;
  done: boolean;
  /** Cargo only: room id the box must reach. */
  target: number | null;
  /** Cargo only: the box has been taken from the shelf. */
  started: boolean;
}

export function findStations(level: Level): Station[] {
  const stations: Station[] = [];
  const kinds = Object.keys(STATION_PROPS) as TaskKind[];
  level.props.forEach((prop, index) => {
    if (!prop.hub) return;
    const kind = kinds.find((k) => STATION_PROPS[k] === prop.kind);
    if (kind) stations.push({ id: stations.length, kind, prop: index, room: prop.room });
  });
  return stations;
}

/** Kinds are dealt round-robin from a shuffled order, so tasks spread over rooms; never two tasks on one station. */
export function assignTasks(stations: Station[], seed: number, owner: number): Task[] {
  const rng = createRng((seed ^ 0x7a5c) + owner * 7919);
  const queues = rng
    .shuffle(Object.keys(STATION_PROPS) as TaskKind[])
    .map((kind) => rng.shuffle(stations.filter((s) => s.kind === kind)));
  const picked: Station[] = [];
  while (picked.length < TASKS_PER_PLAYER && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const station = queue.shift();
      if (station && picked.length < TASKS_PER_PLAYER) picked.push(station);
    }
  }
  return picked.map((station, id) => ({
    id,
    kind: station.kind,
    station: station.id,
    owner,
    done: false,
    target: null,
    started: false,
  }));
}

/** Gives every cargo task a destination among the green zones. */
export function assignCargoTargets(level: Level, tasks: Task[], seed: number): void {
  const rng = createRng(seed ^ 0xb0c5);
  const rooms = level.rooms.filter((r) => CARGO_DESTINATIONS.includes(r.type));
  for (const task of tasks) if (task.kind === 'cargo' && rooms.length > 0) task.target = rng.pick(rooms).id;
}

/** Distance from a point to the edge of a station's furniture. */
export function stationDistance(level: Level, station: Station, x: number, z: number): number {
  return propDistance(level.props[station.prop]!, x, z);
}

/** The closest unfinished task of `owner` within reach, or null. */
export function taskInReach(level: Level, stations: Station[], tasks: Task[], owner: number, x: number, z: number): Task | null {
  let best: Task | null = null;
  let bestDistance = INTERACT_RANGE;
  for (const task of tasks) {
    if (task.done || task.started || task.owner !== owner) continue;
    const distance = stationDistance(level, stations[task.station]!, x, z);
    if (distance <= bestDistance) {
      best = task;
      bestDistance = distance;
    }
  }
  return best;
}

/** Shared progress bar value, 0..1, over every participant's tasks. */
export function taskProgress(tasks: Task[]): number {
  return tasks.length === 0 ? 0 : tasks.filter((t) => t.done).length / tasks.length;
}
