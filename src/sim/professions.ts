import {
  PROFESSIONS_PER_MATCH,
  SIREN_BOT_RANGE,
  SIREN_TIME,
  SKILL_FIRST_COOLDOWN,
  TABLET_TIME,
  TAG_COOLDOWN,
  TAG_RANGE,
  TAG_TIME,
  TAG_TRAIL_EVERY,
} from '../config';
import { remember } from './notes';
import { createRng } from './rng';
import { castShield } from './spirits';
import { gooseSkill, rollNext, skillActive, unseen } from './roulette';
import type { Participant, SimEvent, WorldState } from './world';

/**
 * Chick professions. Nothing about a chick's look or name gives one away:
 * only its owner knows it, until the match is over.
 */
export type Profession = 'analyst' | 'lead' | 'sysadmin' | 'streamer';
export const PROFESSIONS: readonly Profession[] = ['analyst', 'lead', 'sysadmin', 'streamer'];

/** Tracker Analyst's pixel: whom it follows, seconds left, and the trail as flat x, z pairs. */
export interface Tag {
  target: number;
  left: number;
  /** Seconds until the next trail point. */
  every: number;
  trail: number[];
}

/** Casino Streamer's siren: where its box stands and seconds left. */
export interface Siren {
  x: number;
  z: number;
  left: number;
  box: number;
  victim: number;
}

const TRAIL_MAX = Math.ceil(TAG_TIME / TAG_TRAIL_EVERY) + 1;

/** Fresh skill state for everyone; then PROFESSIONS_PER_MATCH chicks get one each, all different. */
export function dealProfessions(state: WorldState, forced: Profession | null, local: number): void {
  // Its own stream, so the rolls of everything else in the match stay as they were.
  const rng = createRng((state.level.seed ^ 0x9a0f5) >>> 0 || 1);
  for (const p of state.participants) {
    p.profession = null;
    p.skillCooldown = SKILL_FIRST_COOLDOWN;
    p.tag = null;
    p.tablet = 0;
    p.charged = true;
    p.ductLeft = 0;
    p.outAt = -1;
    if (p.role === 'goose') rollNext(state, p);
  }
  const chicks = rng.shuffle(state.participants.filter((p) => p.role === 'chick').map((p) => p.id));
  const kinds = rng.shuffle([...PROFESSIONS]);
  const me = state.participants[local]!;
  if (forced && me.role === 'chick') {
    // Testing: the player's profession first, the others from what is left.
    chicks.splice(chicks.indexOf(local), 1);
    chicks.unshift(local);
    kinds.splice(kinds.indexOf(forced), 1);
    kinds.unshift(forced);
  }
  for (let i = 0; i < Math.min(PROFESSIONS_PER_MATCH, chicks.length, kinds.length); i++) {
    state.participants[chicks[i]!]!.profession = kinds[i]!;
  }
}

/** The participant the Analyst's pixel would stick to right now: the nearest one in reach, or null. */
export function tagTarget(state: WorldState, p: Participant): number | null {
  let best: number | null = null;
  let bestDistance = TAG_RANGE;
  for (const o of state.participants) {
    if (o === p || !o.alive || unseen(o)) continue;
    const distance = Math.hypot(o.x - p.x, o.z - p.z);
    if (distance <= bestDistance) {
      best = o.id;
      bestDistance = distance;
    }
  }
  return best;
}

/** The skill key: the Analyst tags someone, the Team Lead opens the tablet. SysAdmins use rugs with E; Streamers have nothing to press. */
export function useSkill(state: WorldState, actor: Participant): SimEvent[] {
  // Out of the match only the Holy Farmer has a skill: the shield.
  if (!actor.alive) return castShield(state, actor);
  if (actor.role === 'goose') return gooseSkill(state, actor);
  if (state.phase !== 'play' || !actor.alive || actor.under !== null || actor.role !== 'chick') return [];
  if (actor.profession === 'analyst') {
    if (actor.skillCooldown > 0) return [];
    const target = tagTarget(state, actor);
    if (target === null) return [];
    const t = state.participants[target]!;
    actor.tag = { target, left: TAG_TIME, every: TAG_TRAIL_EVERY, trail: [t.x, t.z] };
    actor.skillCooldown = TAG_COOLDOWN;
    return [{ type: 'tagged', who: actor.id, target }];
  }
  if (actor.profession === 'lead') {
    if (!actor.charged || actor.tablet > 0) return [];
    actor.tablet = TABLET_TIME;
    actor.charged = false;
    return [{ type: 'tabletOpened', who: actor.id }];
  }
  return [];
}

/** Skill timers and the pixel's trail, every tick of play. */
export function stepSkills(state: WorldState, p: Participant, dt: number): void {
  // The Goose's cooldown waits until its trick is over.
  if (!skillActive(p)) p.skillCooldown = Math.max(0, p.skillCooldown - dt);
  p.tablet = Math.max(0, p.tablet - dt);
  const tag = p.tag;
  if (!tag) return;
  tag.left -= dt;
  if (tag.left <= 0 || !p.alive) {
    p.tag = null;
    return;
  }
  tag.every -= dt;
  const target = state.participants[tag.target]!;
  // A packed target leaves no more trail; a hidden one is drawn at its rug.
  if (tag.every <= 0 && target.alive) {
    tag.every += TAG_TRAIL_EVERY;
    tag.trail.push(target.x, target.z);
    if (tag.trail.length > TRAIL_MAX * 2) tag.trail.splice(0, 2);
  }
}

/** Someone was packed: the Streamer's siren goes off, an Analyst whose pixel sat on the packer knows. */
export function afterPack(state: WorldState, goose: Participant, victim: Participant, box: { id: number; x: number; z: number }): SimEvent[] {
  victim.outAt = state.tick;
  victim.tag = null;
  victim.tablet = 0;
  const room = goose.roomId === null ? null : state.level.rooms[goose.roomId]!.type;
  for (const p of state.participants) {
    if (!p.alive || p.profession !== 'analyst' || p.tag?.target !== goose.id) continue;
    if (p.brain) {
      // The pixel puts the packer at the box at the very moment: as good as seeing it.
      p.brain.suspicion = { who: goose.id, level: 2, room, deed: 'pixel' };
    } else remember(p, 'pixel', goose.id, room);
  }
  if (victim.profession !== 'streamer') return [];
  state.siren = { x: box.x, z: box.z, left: SIREN_TIME, box: box.id, victim: victim.id };
  for (const p of state.participants) {
    if (p.brain && p.alive && p.role === 'chick' && Math.hypot(p.x - box.x, p.z - box.z) <= SIREN_BOT_RANGE) p.brain.heard = box.id;
  }
  return [{ type: 'siren', x: box.x, z: box.z, victim: victim.id }];
}

/** Ticks the siren down. */
export function stepSiren(state: WorldState, dt: number): void {
  if (!state.siren) return;
  state.siren.left -= dt;
  if (state.siren.left <= 0) state.siren = null;
}

/** What the tablet says about one seat. */
export type TabletStatus = 'working' | 'fresh' | 'recent' | 'long' | 'fired';

export function tabletStatus(p: Participant, tick: number, tickSeconds: number, fresh: number, recent: number): TabletStatus {
  if (p.alive) return 'working';
  if (p.ejected) return 'fired';
  const age = (tick - p.outAt) * tickSeconds;
  return age < fresh ? 'fresh' : age < recent ? 'recent' : 'long';
}
