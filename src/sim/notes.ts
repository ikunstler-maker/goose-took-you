import { BOT_NOTES_MAX } from '../config';
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

/**
 * Every living bot chick that sees `actor` do `kind` remembers it; the actor
 * itself remembers its own task or fix (for «I was fixing…»). Newest first, capped.
 */
export function noteSeen(state: WorldState, kind: NoteKind, actor: Participant): void {
  const room = actor.roomId === null ? null : state.level.rooms[actor.roomId]!.type;
  for (const p of state.participants) {
    if (!p.brain || !p.alive || p.role !== 'chick') continue;
    if (p !== actor && !canSee(state.level, p.x, p.z, actor.x, actor.z, sightRadius(state))) continue;
    if (p === actor && kind === 'idle') continue;
    const notes = p.brain.notes.filter((n) => !(n.kind === kind && n.who === actor.id));
    notes.unshift({ kind, who: actor.id, room });
    p.brain.notes = notes.slice(0, BOT_NOTES_MAX);
  }
}
