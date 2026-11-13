import { BOT_NOTES_MAX, PLAYER_SEEN_MAX } from '../config';
import type { RoomType } from './prefabs';
import { sightRadius } from './sabotage';
import { canSee } from './vision';
import type { Participant, WorldState } from './world';

/** What a bot chick saw between meetings: a finished task, a fixed sabotage, someone idling. */
export type NoteKind = 'task' | 'fixed' | 'idle';

export interface Note {
  kind: NoteKind;
  who: number;
  room: RoomType | null;
}

/** What a human player saw between meetings; feeds the ready-made lines at the next one. */
export type SeenKind = NoteKind | 'pack' | 'carpet' | 'met' | 'pixel';

export interface Seen {
  kind: SeenKind;
  who: number;
  room: RoomType | null;
}

/** Remembers a sighting for a human participant: newest first, one per kind and subject, capped. */
export function remember(p: Participant, kind: SeenKind, who: number, room: RoomType | null): void {
  const seen = p.seen.filter((n) => !(n.kind === kind && n.who === who));
  seen.unshift({ kind, who, room });
  p.seen = seen.slice(0, PLAYER_SEEN_MAX);
}

/** Humans keep track of who they last saw where. */
export function noteMet(state: WorldState): void {
  for (const p of state.participants) {
    if (p.brain || !p.alive) continue;
    for (const o of state.participants) {
      if (o === p || !o.alive || o.under !== null) continue;
      if (!canSee(state.level, p.x, p.z, o.x, o.z, sightRadius(state))) continue;
      remember(p, 'met', o.id, o.roomId === null ? null : state.level.rooms[o.roomId]!.type);
    }
  }
}

/**
 * Every living bot chick that sees `actor` do `kind` remembers it; the actor
 * itself remembers its own task or fix (for «I was fixing…»). Newest first, capped.
 */
export function noteSeen(state: WorldState, kind: NoteKind, actor: Participant): void {
  const room = actor.roomId === null ? null : state.level.rooms[actor.roomId]!.type;
  for (const p of state.participants) {
    if (!p.alive) continue;
    if (!p.brain) {
      // A human remembers what others did in its sight, whatever its role.
      if (p !== actor && actor.under === null && canSee(state.level, p.x, p.z, actor.x, actor.z, sightRadius(state))) remember(p, kind, actor.id, room);
      continue;
    }
    if (p.role !== 'chick') continue;
    if (p !== actor && !canSee(state.level, p.x, p.z, actor.x, actor.z, sightRadius(state))) continue;
    if (p === actor && kind === 'idle') continue;
    const notes = p.brain.notes.filter((n) => !(n.kind === kind && n.who === actor.id));
    notes.unshift({ kind, who: actor.id, room });
    p.brain.notes = notes.slice(0, BOT_NOTES_MAX);
  }
}
