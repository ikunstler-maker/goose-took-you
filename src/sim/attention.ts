import {
  ATTN_BEHIND_CHANCE,
  ATTN_BUSY,
  ATTN_FOCUS,
  ATTN_FOCUS_CHANCE,
  ATTN_SIDE,
  ATTN_SIDE_CHANCE,
} from '../config';
import type { Participant } from './world';

/** What was seen, mixed into the attention roll so different sightings at once are rolled apart. */
export const SEEN = {
  pack: 1,
  carpet: 2,
  tell: 3,
  note: 7,
  morph: 11,
  vanish: 13,
  rustle: 17,
  feather: 31,
  carry: 37,
} as const;

/** Angle between where `p` faces and the direction to (x, z), degrees, 0..180. */
export function offFacing(p: { x: number; z: number; facing: number }, x: number, z: number): number {
  const dx = x - p.x;
  const dz = z - p.z;
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  // Heading 0 faces +z.
  const along = Math.sin(p.facing) * dx + Math.cos(p.facing) * dz;
  const across = Math.cos(p.facing) * dx - Math.sin(p.facing) * dz;
  return Math.abs(Math.atan2(across, along)) * (180 / Math.PI);
}

/** The chance a bot notices something at (x, z) it could see: high ahead, lower to the side, low behind. */
export function attentionChance(p: Participant, x: number, z: number): number {
  const angle = offFacing(p, x, z);
  let chance: number;
  if (angle <= ATTN_FOCUS) chance = ATTN_FOCUS_CHANCE;
  else if (angle <= ATTN_SIDE) chance = ATTN_FOCUS_CHANCE + ((angle - ATTN_FOCUS) / (ATTN_SIDE - ATTN_FOCUS)) * (ATTN_SIDE_CHANCE - ATTN_FOCUS_CHANCE);
  else chance = ATTN_BEHIND_CHANCE;
  // Staring at a mini-game screen leaves less attention for the room.
  const busy = p.activeTask !== null || (p.brain !== null && p.brain.fake > 0) || p.watching;
  return busy ? chance * ATTN_BUSY : chance;
}

/**
 * Does the bot notice it? A deterministic roll per tick, bot and `salt` (what was seen),
 * so a match stays reproducible.
 */
export function notices(p: Participant, x: number, z: number, tick: number, salt: number): boolean {
  const roll = ((((tick + 3) * 2654435761) ^ (p.id * 40503 + salt * 977)) >>> 0) % 1000;
  return roll < attentionChance(p, x, z) * 1000;
}

/** A tick at which `p` notices what happens at (x, z): bots can miss even what they look at. */
export function alertTick(p: Participant, x: number, z: number, salt: number, from: number): number {
  for (let tick = from; ; tick++) if (notices(p, x, z, tick, salt)) return tick;
}
