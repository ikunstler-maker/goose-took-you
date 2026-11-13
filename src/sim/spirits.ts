import {
  ACCESSORIES,
  CHICK_COLORS,
  PACK_COOLDOWN,
  PLAYER_SPEED,
  SHIELD_COOLDOWN,
  SHIELD_RANGE,
  SHIELD_TIME,
  SPIRIT_BOTS,
  SPIRIT_SPEED,
  SPIRIT_WORK_MAX,
  SPIRIT_WORK_MIN,
} from '../config';
import type { Level } from './level';
import { createRng, type Rng } from './rng';
import type { Command, Participant, SimEvent, WorldState } from './world';

/**
 * The spirit realm. Everyone out of the match (packed or voted out) becomes a
 * spirit: it drifts through inner walls, sees other spirits but not the living,
 * and may keep doing its tasks, which no longer count. Spirit bots live there
 * from the first second; each newcomer takes one's place. The first chick packed
 * is the Holy Farmer: it alone sees the living and can shield one of them.
 */
export interface SpiritBot {
  id: number;
  x: number;
  z: number;
  facing: number;
  moving: boolean;
  color: number;
  accessory: number;
  /** Where it drifts to, and seconds left standing at a desk there. */
  tx: number;
  tz: number;
  wait: number;
}

/** Keeps a spirit a cell inside the office's outer walls. */
const MARGIN = 1.5;

const rngAt = (state: WorldState, salt: number): Rng => createRng(((state.level.seed * 977 + state.tick * 31 + salt) >>> 0) || 1);

/** A random desk to drift to. */
function deskSpot(state: WorldState, rng: Rng): { x: number; z: number } {
  const station = state.stations[rng.int(state.stations.length)];
  if (!station) return { x: state.level.spawn.x, z: state.level.spawn.z };
  const prop = state.level.props[station.prop]!;
  const a = rng.next() * Math.PI * 2;
  return { x: prop.x + Math.cos(a) * 1.2, z: prop.z + Math.sin(a) * 1.2 };
}

/** The spirit bots of a fresh match, spread over the desks. */
export function createSpiritBots(state: WorldState): SpiritBot[] {
  const rng = createRng((state.level.seed ^ 0x5b1e7) >>> 0 || 1);
  const bots: SpiritBot[] = [];
  for (let i = 0; i < SPIRIT_BOTS; i++) {
    const at = deskSpot(state, rng);
    bots.push({
      id: i,
      x: at.x,
      z: at.z,
      facing: 0,
      moving: false,
      color: rng.int(CHICK_COLORS.length),
      accessory: rng.int(ACCESSORIES.length),
      tx: at.x,
      tz: at.z,
      wait: SPIRIT_WORK_MIN + rng.next() * (SPIRIT_WORK_MAX - SPIRIT_WORK_MIN),
    });
  }
  return bots;
}

/** One step of drifting: no walls, only the office's outer edge. */
export function spiritWalk(level: Level, p: { x: number; z: number }, dirX: number, dirZ: number, dt: number): void {
  const max = level.size - MARGIN;
  p.x = Math.min(max, Math.max(MARGIN, p.x + dirX * PLAYER_SPEED * SPIRIT_SPEED * dt));
  p.z = Math.min(max, Math.max(MARGIN, p.z + dirZ * PLAYER_SPEED * SPIRIT_SPEED * dt));
}

/** A participant just left the match: it appears where a spirit bot was, and that bot fades away. */
export function becomeSpirit(state: WorldState, p: Participant): void {
  p.moveX = 0;
  p.moveZ = 0;
  p.moving = false;
  p.shield = 0;
  p.skillCooldown = 0;
  const bot = state.spirits.shift();
  if (bot) {
    p.x = bot.x;
    p.z = bot.z;
    p.facing = bot.facing;
  }
  if (p.brain) {
    p.brain.goal = null;
    p.brain.path = [];
    p.brain.wait = 0;
  }
}

/** The spirit bots drift from desk to desk and «work» there for a while. */
export function stepSpiritBots(state: WorldState, dt: number): void {
  for (const s of state.spirits) {
    const dx = s.tx - s.x;
    const dz = s.tz - s.z;
    const far = Math.hypot(dx, dz);
    if (far > 0.1) {
      s.moving = true;
      s.facing = Math.atan2(dx, dz);
      const step = Math.min(1, (PLAYER_SPEED * SPIRIT_SPEED * dt) / far);
      s.x += dx * step;
      s.z += dz * step;
      continue;
    }
    s.moving = false;
    s.wait -= dt;
    if (s.wait > 0) continue;
    const rng = rngAt(state, 701 + s.id);
    const next = deskSpot(state, rng);
    s.tx = next.x;
    s.tz = next.z;
    s.wait = SPIRIT_WORK_MIN + rng.next() * (SPIRIT_WORK_MAX - SPIRIT_WORK_MIN);
  }
}

/** The living participant nearest the Holy Farmer within reach, or null. */
export function shieldTarget(state: WorldState, farmer: Participant): number | null {
  let best: number | null = null;
  let bestDistance = SHIELD_RANGE;
  for (const o of state.participants) {
    if (!o.alive || o.under !== null) continue;
    const d = Math.hypot(o.x - farmer.x, o.z - farmer.z);
    if (d <= bestDistance) {
      best = o.id;
      bestDistance = d;
    }
  }
  return best;
}

/** The Holy Farmer's skill: an invisible shield on the nearest living participant. */
export function castShield(state: WorldState, actor: Participant): SimEvent[] {
  if (state.phase !== 'play' || actor.alive || state.farmer !== actor.id || actor.skillCooldown > 0) return [];
  const target = shieldTarget(state, actor);
  if (target === null) return [];
  state.participants[target]!.shield = SHIELD_TIME;
  actor.skillCooldown = SHIELD_COOLDOWN;
  return [{ type: 'shielded', who: actor.id, target }];
}

/** A pack hits a shield: the box bursts into confetti, the Goose's pack goes on cooldown. */
export function popShield(goose: Participant, victim: Participant): SimEvent[] {
  victim.shield = 0;
  goose.packCooldown = PACK_COOLDOWN;
  goose.canPack = null;
  return [{ type: 'shieldPopped', who: goose.id, victim: victim.id, x: victim.x, z: victim.z }];
}

type Send = (who: number, command: Command) => SimEvent[];

/**
 * A bot that is out of the match: it drifts between its desks like the spirit
 * bots; as the Holy Farmer it follows a living participant and shields them.
 */
export function spiritMind(state: WorldState, bot: Participant, dt: number, send: Send): SimEvent[] {
  const brain = bot.brain!;
  const events: SimEvent[] = [];
  const rng = rngAt(state, 389 + bot.id);
  if (state.farmer === bot.id) {
    if (bot.skillCooldown === 0 && shieldTarget(state, bot) !== null) events.push(...send(bot.id, { type: 'skill' }));
    // Drift after whoever it is guarding, changing its mind now and then.
    if (brain.guard === null || !state.participants[brain.guard]!.alive || rng.next() < dt / 20) {
      const living = state.participants.filter((p) => p.alive);
      brain.guard = living.length > 0 ? living[rng.int(living.length)]!.id : null;
    }
    const g = brain.guard === null ? null : state.participants[brain.guard]!;
    if (g) {
      const dx = g.x - bot.x;
      const dz = g.z - bot.z;
      const far = Math.hypot(dx, dz);
      events.push(...send(bot.id, far > SHIELD_RANGE * 0.6 ? { type: 'move', x: dx, z: dz } : { type: 'move', x: 0, z: 0 }));
    }
    return events;
  }
  if (brain.wait > 0) {
    brain.wait -= dt;
    if (bot.moveX !== 0 || bot.moveZ !== 0) events.push(...send(bot.id, { type: 'move', x: 0, z: 0 }));
    return events;
  }
  if (!brain.drift) brain.drift = deskSpot(state, rng);
  const dx = brain.drift.x - bot.x;
  const dz = brain.drift.z - bot.z;
  if (Math.hypot(dx, dz) < 0.3) {
    brain.drift = null;
    brain.wait = SPIRIT_WORK_MIN + rng.next() * (SPIRIT_WORK_MAX - SPIRIT_WORK_MIN);
    events.push(...send(bot.id, { type: 'move', x: 0, z: 0 }));
    return events;
  }
  events.push(...send(bot.id, { type: 'move', x: dx, z: dz }));
  return events;
}
