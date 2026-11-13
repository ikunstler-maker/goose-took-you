import {
  ATTN_GLANCE,
  BOT_REPORT_SIGHT,
  FEATHER_TIME,
  GOOSE_SKILL_COOLDOWN,
  MORPH_GLITCH,
  MORPH_TIME,
  RUSTLE_RANGE,
  RUSTLE_TIME,
  TICK,
  VANISH_SHIMMER,
  VANISH_TIME,
} from '../config';
import { notices, SEEN } from './attention';
import { remember } from './notes';
import { createRng } from './rng';
import { propDistance, sightRadius } from './sabotage';
import { canSee } from './vision';
import type { Participant, SimEvent, WorldState } from './world';

/** The Goose's two skills; a press of the roulette fires one of them at random. */
export type GooseSkill = 'morph' | 'vanish';

/** A white feather with a drop of yellow paint: a Deepfake started or ended here. */
export interface Feather {
  x: number;
  z: number;
  left: number;
}

/** A potted plant an invisible Goose just brushed past: `prop` is its index in the level. */
export interface Rustle {
  prop: number;
  left: number;
}

/** Plants that shake when brushed. */
const SHAKY: ReadonlySet<string> = new Set(['monstera', 'ficus', 'palm', 'planter', 'bonsai']);

/** Whom others take this participant for: the chick a Deepfake copies, or itself. */
export const shownId = (p: Participant): number => p.disguise ?? p.id;

/** Out of everyone else's sight: under a rug or invisible. The shimmer of coming back can be seen. */
export const unseen = (p: { under: number | null; vanish: number }): boolean => p.under !== null || p.vanish > 0;

/** A Deepfake or Incognito is running (the cooldown waits for it to end). */
export const skillActive = (p: Participant): boolean => p.glitch > 0 || p.disguise !== null || p.vanish > 0 || p.shimmer > 0;

/** May not pack, interact, sabotage or report: invisible, coming back, or inside the glitch cloud. */
export const skillBusy = (p: Participant): boolean => p.vanish > 0 || p.shimmer > 0 || p.glitch > 0;

const roll = (state: WorldState, p: Participant, salt: number): ReturnType<typeof createRng> =>
  createRng(((state.level.seed * 131 + state.tick * 7 + p.id * 977 + salt) >>> 0) || 1);

/** Rolls which skill the Goose's next press fires. */
export function rollNext(state: WorldState, p: Participant): void {
  p.gooseNext = roll(state, p, 5).next() < 0.5 ? 'morph' : 'vanish';
}

const roomOf = (state: WorldState, x: number, z: number) => {
  const zone = state.level.zone[Math.floor(z) * state.level.size + Math.floor(x)];
  return zone !== undefined && zone >= 0 ? state.level.rooms[zone]!.type : null;
};

/** Every chick that sees the cloud or the vanishing, and pays attention, knows who did it. */
function witness(state: WorldState, goose: Participant, deed: 'morph' | 'vanish'): void {
  const room = roomOf(state, goose.x, goose.z);
  for (const p of state.participants) {
    if (p === goose || !p.alive || p.role !== 'chick') continue;
    if (!canSee(state.level, p.x, p.z, goose.x, goose.z, sightRadius(state))) continue;
    if (!p.brain) {
      remember(p, deed, goose.id, room);
      continue;
    }
    if (!notices(p, goose.x, goose.z, state.tick, deed === 'morph' ? SEEN.morph : SEEN.vanish)) continue;
    // A pack seen outweighs it.
    if (p.brain.suspicion?.level === 2 && p.brain.suspicion.deed === 'pack') continue;
    p.brain.suspicion = { who: goose.id, level: 2, room, deed };
  }
}

function dropFeather(state: WorldState, goose: Participant): void {
  state.feathers.push({ x: goose.x, z: goose.z, left: FEATHER_TIME });
}

/** The roulette: fires the rolled skill. Deepfake copies a random living chick; Incognito hides the Goose. */
export function gooseSkill(state: WorldState, actor: Participant): SimEvent[] {
  if (state.phase !== 'play' || !actor.alive || actor.role !== 'goose' || actor.under !== null) return [];
  // Pressed again in a borrowed look: the mask comes off now, wherever the Goose finds it safe.
  if (actor.disguise !== null && actor.glitch === 0) return dropMask(state, actor);
  if (actor.skillCooldown > 0 || skillActive(actor)) return [];
  const kind = actor.gooseNext;
  if (kind === 'morph') {
    const chicks = state.participants.filter((p) => p.alive && p.role === 'chick');
    if (chicks.length === 0) return [];
    actor.morphTo = chicks[roll(state, actor, 9).int(chicks.length)]!.id;
    actor.glitch = MORPH_GLITCH;
    dropFeather(state, actor);
    witness(state, actor, 'morph');
  } else {
    actor.vanish = VANISH_TIME;
    witness(state, actor, 'vanish');
  }
  actor.skillCooldown = GOOSE_SKILL_COOLDOWN;
  rollNext(state, actor);
  return [{ type: kind === 'morph' ? 'morphed' : 'vanished', who: actor.id, x: actor.x, z: actor.z }];
}

/** The borrowed look comes off: the same glitch cloud and another feather. */
function dropMask(state: WorldState, p: Participant): SimEvent[] {
  p.disguiseLeft = 0;
  p.glitch = MORPH_GLITCH;
  p.morphTo = null;
  dropFeather(state, p);
  witness(state, p, 'morph');
  return [{ type: 'morphed', who: p.id, x: p.x, z: p.z }];
}

/** Deepfake and Incognito timers; an invisible Goose shakes the plants it brushes. */
export function stepRoulette(state: WorldState, p: Participant, dt: number, events: SimEvent[]): void {
  if (p.role !== 'goose' || state.phase !== 'play') return;
  if (p.glitch > 0) {
    p.glitch -= dt;
    if (p.glitch <= 0) {
      // The cloud clears: the new look (or the old one, on the way back) is in place.
      p.glitch = 0;
      p.disguise = p.morphTo;
      p.morphTo = null;
      p.disguiseLeft = p.disguise === null ? 0 : MORPH_TIME;
    }
  } else if (p.disguise !== null) {
    p.disguiseLeft -= dt;
    if (p.disguiseLeft <= 0) events.push(...dropMask(state, p));
  }
  if (p.vanish > 0) {
    p.vanish -= dt;
    rustle(state, p, events);
    if (p.vanish <= 0) {
      p.vanish = 0;
      p.shimmer = VANISH_SHIMMER;
      events.push({ type: 'modem', who: p.id, x: p.x, z: p.z });
    }
  } else if (p.shimmer > 0) {
    p.shimmer = Math.max(0, p.shimmer - dt);
  }
}

function rustle(state: WorldState, goose: Participant, events: SimEvent[]): void {
  state.level.props.forEach((prop, index) => {
    if (!SHAKY.has(prop.kind) || Math.abs(prop.x - goose.x) > 3 || Math.abs(prop.z - goose.z) > 3) return;
    if (propDistance(prop, goose.x, goose.z) > RUSTLE_RANGE) return;
    const live = state.rustles.find((r) => r.prop === index);
    if (live) {
      live.left = RUSTLE_TIME;
      return;
    }
    state.rustles.push({ prop: index, left: RUSTLE_TIME });
    events.push({ type: 'rustled', prop: index, x: prop.x, z: prop.z });
    // A bot chick that happens to look that way wonders who shook it.
    const room = roomOf(state, prop.x, prop.z);
    for (const p of state.participants) {
      if (!p.brain || !p.alive || p.role !== 'chick') continue;
      if (!canSee(state.level, p.x, p.z, prop.x, prop.z, sightRadius(state))) continue;
      if (notices(p, prop.x, prop.z, state.tick, SEEN.rustle + index)) p.brain.clue = { kind: 'rustle', room };
    }
  });
}

/** Feathers and shaking plants fade. */
export function stepClues(state: WorldState, dt: number): void {
  for (const f of state.feathers) f.left -= dt;
  state.feathers = state.feathers.filter((f) => f.left > 0);
  for (const r of state.rustles) r.left -= dt;
  state.rustles = state.rustles.filter((r) => r.left > 0);
}

/** A bot chick glancing round may spot a feather lying in view. */
export function spotFeather(state: WorldState, bot: Participant): void {
  const brain = bot.brain;
  if (!brain || brain.clue?.kind === 'feather' || state.feathers.length === 0) return;
  const glance = Math.floor(state.tick / Math.round(ATTN_GLANCE / TICK));
  state.feathers.forEach((f, i) => {
    if (Math.hypot(f.x - bot.x, f.z - bot.z) > BOT_REPORT_SIGHT) return;
    if (!canSee(state.level, bot.x, bot.z, f.x, f.z, sightRadius(state))) return;
    if (notices(bot, f.x, f.z, glance, SEEN.feather + i)) brain.clue = { kind: 'feather', room: roomOf(state, f.x, f.z) };
  });
}

/** Back to its own look and in plain view: a meeting ends every trick. */
export function endTricks(p: Participant): void {
  p.glitch = 0;
  p.morphTo = null;
  p.disguise = null;
  p.disguiseLeft = 0;
  p.vanish = 0;
  p.shimmer = 0;
}

/** The look `viewer` sees on `p`: a Deepfake shows its copy's colour and accessory to everyone but itself. */
export function shownLook(state: WorldState, p: Participant, viewer: number): { color: number; accessory: number } {
  const copy = p.disguise !== null && p.id !== viewer ? state.participants[p.disguise]! : p;
  return { color: copy.color, accessory: copy.accessory };
}
