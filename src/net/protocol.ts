import type { PlayerView } from '../sim/view';
import type { Command, SimEvent } from '../sim/world';

/** Room codes: five letters, without the look-alikes (no I, L, O). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 5;

export const normalizeCode = (raw: string): string => raw.trim().toUpperCase().slice(0, CODE_LENGTH);
export const isCode = (code: string): boolean =>
  code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));

/** Commands a browser may send for its own seat. Seats themselves are handled by the server. */
export type PlayerCommand = Exclude<Command, { type: 'join' } | { type: 'leave' }>;

export interface Look {
  color: number;
  accessory: number;
}

/** Browser → server. */
export type ClientMessage =
  | { t: 'create'; look: Look }
  | { t: 'join'; code: string; look: Look }
  /** Back to the seat held before the connection dropped. */
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'cmd'; c: PlayerCommand }
  /** Host only, on the win screen: a fresh office for the same room. */
  | { t: 'again' };

/** Why the server said no; the browser shows `online.error.<reason>`. */
export type Refusal = 'noRoom' | 'full' | 'started' | 'busy' | 'bad';

/** The snapshot as sent: sight packed into a base64 bitset, tasks split off so they travel only when they change. */
export interface WireView extends Omit<PlayerView, 'sight' | 'self'> {
  sight: string;
  self: Omit<PlayerView['self'], 'tasks'>;
  tasks: PlayerView['self']['tasks'];
}

/** Server → browser. */
export type ServerMessage =
  /** You are in: your seat, the token to come back with, who is host. */
  | { t: 'room'; code: string; you: number; token: string; host: number; players: number }
  /** Seats changed hands or the host changed. */
  | { t: 'roster'; host: number; players: number }
  /** Only the parts of the snapshot that changed since the last message, and what happened meanwhile. */
  | { t: 'state'; v: Partial<WireView>; e: SimEvent[] }
  | { t: 'refused'; reason: Refusal };

/** 1 bit per floor cell, base64. Works in browsers and in Node alike. */
export function packSight(cells: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(cells.length / 8));
  for (let i = 0; i < cells.length; i++) if (cells[i] === 1) bytes[i >> 3]! |= 1 << (i & 7);
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}

export function unpackSight(packed: string, into: Uint8Array): void {
  const text = atob(packed);
  for (let i = 0; i < into.length; i++) into[i] = (text.charCodeAt(i >> 3) >> (i & 7)) & 1;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** The snapshot ready for the wire: packed sight, positions to the centimetre. */
export function toWire(view: PlayerView): WireView {
  const { tasks, ...self } = view.self;
  return {
    ...view,
    sight: packSight(view.sight),
    self,
    tasks,
    seats: view.seats.map((seat) =>
      seat.body ? { ...seat, body: { ...seat.body, x: round(seat.body.x), z: round(seat.body.z), facing: round(seat.body.facing) } } : seat,
    ),
    boxes: view.boxes.map((box) => ({ ...box, x: round(box.x), z: round(box.z) })),
  };
}
