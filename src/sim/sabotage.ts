import { CALL_SIGNERS, CALL_TIME, INTERACT_RANGE, OVERHEAT_TIME, OVERHEAT_VISION, SABOTAGE_COOLDOWN, VISION_RADIUS } from '../config';
import type { Level, Prop } from './level';
import type { Participant, SimEvent, WorldState } from './world';

/**
 * `overheat` — «Перегрів рендер-ферми»: lights out, short sight, two fan points to restart.
 * `call` — «Терміновий дзвінок Модуса»: two different participants sign the NDA in time.
 */
export type SabotageKind = 'overheat' | 'call';

export const SABOTAGE_KINDS: readonly SabotageKind[] = ['overheat', 'call'];

/** The sabotage in progress. Runs out → the Goose wins. */
export interface Sabotage {
  kind: SabotageKind;
  /** Tick it started on; tells one sabotage from the next. */
  id: number;
  left: number;
  total: number;
  /** Overheat: fix-point props already restarted. Call: participants who signed. */
  done: number[];
}

/** Hub props where each sabotage is fixed (indices into `level.props`). */
export type FixPoints = Record<SabotageKind, number[]>;

/** Overheat: the big fan and the middle server rack of the render farm. Call: the briefing tablet. */
export function findFixPoints(level: Level): FixPoints {
  const hubs = (kind: Prop['kind']): number[] =>
    level.props.map((p, i) => (p.hub && p.kind === kind ? i : -1)).filter((i) => i >= 0);
  const racks = hubs('rack');
  const overheat = [...hubs('fan').slice(0, 1), ...racks.slice(Math.floor(racks.length / 2), Math.floor(racks.length / 2) + 1)];
  return { overheat, call: hubs('briefTablet').slice(0, 1) };
}

/** How many fixes end the sabotage. */
export function fixesNeeded(state: WorldState, kind: SabotageKind): number {
  return kind === 'overheat' ? state.fixPoints.overheat.length : CALL_SIGNERS;
}

/** How far anyone sees right now: the overheated office is dark. */
export function sightRadius(state: WorldState): number {
  return state.sabotage?.kind === 'overheat' ? OVERHEAT_VISION : VISION_RADIUS;
}

/** Distance from a point to the edge of a prop. */
export function propDistance(prop: Prop, x: number, z: number): number {
  const dx = Math.max(Math.abs(x - prop.x) - prop.w / 2, 0);
  const dz = Math.max(Math.abs(z - prop.z) - prop.d / 2, 0);
  return Math.hypot(dx, dz);
}

/** Fix points this participant can still help at. */
export function openFixPoints(state: WorldState, actor: Participant): number[] {
  const sabotage = state.sabotage;
  if (!sabotage || !actor.alive) return [];
  const points = state.fixPoints[sabotage.kind];
  if (sabotage.kind === 'overheat') return points.filter((p) => !sabotage.done.includes(p));
  return sabotage.done.includes(actor.id) ? [] : points;
}

/** The fix point within reach of the participant, or null. */
export function fixInReach(state: WorldState, actor: Participant): number | null {
  for (const point of openFixPoints(state, actor)) {
    if (propDistance(state.level.props[point]!, actor.x, actor.z) <= INTERACT_RANGE) return point;
  }
  return null;
}

export function startSabotage(state: WorldState, actor: Participant, kind: SabotageKind): SimEvent[] {
  if (actor.role !== 'goose' || !actor.alive || state.sabotage || state.sabotageCooldown > 0) return [];
  if (state.fixPoints[kind].length === 0) return [];
  const total = kind === 'overheat' ? OVERHEAT_TIME : CALL_TIME;
  state.sabotage = { kind, id: state.tick, left: total, total, done: [] };
  return [{ type: 'sabotageStarted', who: actor.id, kind }];
}

/** Stops the sabotage without a winner: fixed in time, or cut short by a meeting. */
export function endSabotage(state: WorldState, fixed: boolean): SimEvent[] {
  const sabotage = state.sabotage;
  if (!sabotage) return [];
  state.sabotage = null;
  state.sabotageCooldown = SABOTAGE_COOLDOWN;
  return [{ type: 'sabotageEnded', kind: sabotage.kind, fixed }];
}

/** One restart or one signature at a fix point. */
export function fixSabotage(state: WorldState, actor: Participant, point: number): SimEvent[] {
  const sabotage = state.sabotage;
  if (!sabotage || !openFixPoints(state, actor).includes(point)) return [];
  sabotage.done.push(sabotage.kind === 'overheat' ? point : actor.id);
  const events: SimEvent[] = [{ type: 'sabotageFixed', who: actor.id, kind: sabotage.kind, point }];
  if (sabotage.done.length >= fixesNeeded(state, sabotage.kind)) events.push(...endSabotage(state, true));
  return events;
}
