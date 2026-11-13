import { ACCESSORIES, CHAT_TEXT_MAX, CHICK_COLORS, TICK } from '../src/config';
import { toWire, type ClientMessage, type Look, type PlayerCommand, type Refusal, type ServerMessage, type WireView } from '../src/net/protocol';
import { eventsFor, viewFor } from '../src/sim/view';
import { applyCommand, createWorld, step, type SimEvent, type WorldState } from '../src/sim/world';
import { MAX_CATCH_UP, SEND_RATE } from './config';

/** One connected browser (or one that dropped mid-match and may come back). */
interface Peer {
  id: number;
  seat: number;
  token: string;
  /** Null while disconnected. */
  send: ((message: ServerMessage) => void) | null;
  /** What was last sent, per snapshot part, to send only changes. */
  sent: Map<string, string>;
  /** Events this seat may hear, gathered since the last snapshot. */
  events: SimEvent[];
}

const THOUGHTS = ['doubt', 'meh', 'heart', 'busy'];
const SABOTAGES = ['overheat', 'call'];
const int = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Rebuilds a command from untrusted input; anything odd becomes null. */
export function sanitize(raw: unknown): PlayerCommand | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case 'move':
      return finite(c.x) && finite(c.z) ? { type: 'move', x: c.x, z: c.z } : null;
    case 'interact':
    case 'finishTask':
    case 'cancelTask':
    case 'stopWatching':
    case 'start':
    case 'pack':
    case 'report':
    case 'skill':
      return { type: c.type };
    case 'setLook':
      return int(c.color) && int(c.accessory) ? { type: 'setLook', color: c.color, accessory: c.accessory } : null;
    case 'think':
      return THOUGHTS.includes(c.thought as string) ? ({ type: 'think', thought: c.thought } as PlayerCommand) : null;
    case 'vote':
      return int(c.target) ? { type: 'vote', target: c.target } : null;
    case 'crawl':
      return int(c.to) ? { type: 'crawl', to: c.to } : null;
    case 'sabotage':
      return SABOTAGES.includes(c.kind as string) ? ({ type: 'sabotage', kind: c.kind } as PlayerCommand) : null;
    case 'say': {
      const about = c.about === null ? null : int(c.about) ? c.about : undefined;
      const room = c.room === null ? null : typeof c.room === 'string' && c.room.length < 24 ? c.room : undefined;
      if (typeof c.kind !== 'string' || c.kind.length > 16 || about === undefined || room === undefined) return null;
      // The sim checks the phrase, the participant and the room against the match, and cleans free text.
      if (c.kind === 'text') return typeof c.text === 'string' && c.text.length <= 4 * CHAT_TEXT_MAX ? ({ type: 'say', kind: 'text', about: null, room: null, text: c.text } as PlayerCommand) : null;
      return { type: 'say', kind: c.kind, about, room } as PlayerCommand;
    }
    default:
      return null;
  }
}

const validLook = (look: unknown): Look | null => {
  const l = look as Look | null;
  return l && int(l.color) && int(l.accessory) && l.color >= 0 && l.color < CHICK_COLORS.length && l.accessory >= 0 && l.accessory < ACCESSORIES.length
    ? { color: l.color, accessory: l.accessory }
    : null;
};

/**
 * One room: the match, who sits where, who is host. Knows nothing about
 * sockets or timers, so it runs the same under any host and in tests.
 */
export class Room {
  state: WorldState;
  private peers: Peer[] = [];
  private nextPeer = 1;
  private pending = 0;
  private sendIn = 0;
  /** Seconds since the last browser left; 0 while anyone is connected. */
  emptyFor = 0;

  constructor(
    readonly code: string,
    private readonly newSeed: () => number,
    private readonly newToken: () => string,
  ) {
    this.state = this.freshWorld();
  }

  /** A lobby where every seat is a bot, waiting for people. */
  private freshWorld(): WorldState {
    const state = createWorld(this.newSeed());
    applyCommand(state, 0, { type: 'leave' });
    return state;
  }

  private connected(): Peer[] {
    return this.peers.filter((p) => p.send);
  }

  /** The host is whoever has been in the room the longest and is still connected. */
  get host(): number {
    return this.connected()[0]?.seat ?? -1;
  }

  get players(): number {
    return this.connected().length;
  }

  private tellRoster(): void {
    for (const p of this.connected()) p.send!({ t: 'roster', host: this.host, players: this.players });
  }

  private seat(peer: Peer, look: Look | null): boolean {
    const free = this.state.participants.find((p) => p.isBot);
    if (!free) return false;
    peer.seat = free.id;
    applyCommand(this.state, free.id, { type: 'join' });
    // The saved look, if nobody in the room wears that colour already.
    if (look) applyCommand(this.state, free.id, { type: 'setLook', ...look });
    return true;
  }

  private welcome(peer: Peer): void {
    peer.sent.clear();
    peer.events = [];
    peer.send!({ t: 'room', code: this.code, you: peer.seat, token: peer.token, host: this.host, players: this.players });
    this.tellRoster();
    this.sendState(peer);
  }

  /** A new person: a seat in the lobby, or a refusal. Returns the peer id to route their messages by. */
  join(send: (message: ServerMessage) => void, look: unknown): number | Refusal {
    if (this.state.phase !== 'lobby') return 'started';
    const peer: Peer = { id: this.nextPeer++, seat: -1, token: this.newToken(), send, sent: new Map(), events: [] };
    if (!this.seat(peer, validLook(look))) return 'full';
    this.peers.push(peer);
    this.welcome(peer);
    return peer.id;
  }

  /** Someone whose connection dropped mid-match takes their seat back from the bot. */
  rejoin(send: (message: ServerMessage) => void, token: unknown): number | Refusal {
    const peer = this.peers.find((p) => p.token === token && !p.send);
    if (!peer) return 'noRoom';
    peer.send = send;
    applyCommand(this.state, peer.seat, { type: 'join' });
    this.welcome(peer);
    return peer.id;
  }

  /** The connection is gone. In the lobby the seat is freed; mid-match a bot covers and the seat waits. */
  drop(peerId: number): void {
    const peer = this.peers.find((p) => p.id === peerId);
    if (!peer || !peer.send) return;
    peer.send = null;
    this.gather(applyCommand(this.state, peer.seat, { type: 'leave' }));
    if (this.state.phase === 'lobby') this.peers = this.peers.filter((p) => p !== peer);
    this.tellRoster();
  }

  receive(peerId: number, message: ClientMessage): void {
    const peer = this.peers.find((p) => p.id === peerId);
    if (!peer || !peer.send) return;
    if (message.t === 'again') {
      if (peer.seat === this.host && this.state.phase === 'over') this.again();
      return;
    }
    if (message.t !== 'cmd') return;
    const command = sanitize(message.c);
    if (!command) return;
    // Only the host opens the office.
    if (command.type === 'start' && peer.seat !== this.host) return;
    this.gather(applyCommand(this.state, peer.seat, command));
  }

  /** Same room, same people, a new office. Whoever is not connected loses the seat. */
  private again(): void {
    this.state = this.freshWorld();
    const staying = this.connected();
    this.peers = [];
    for (const peer of staying) {
      this.seat(peer, null);
      this.peers.push(peer);
    }
    for (const peer of this.peers) this.welcome(peer);
  }

  /** Hands fresh events to every connected seat, filtered by what it may know right now. */
  private gather(events: SimEvent[]): void {
    if (events.length === 0) return;
    for (const p of this.connected()) p.events.push(...eventsFor(this.state, p.seat, events));
  }

  private sendState(peer: Peer): void {
    const wire = toWire(viewFor(this.state, peer.seat)) as unknown as Record<string, unknown>;
    const changed: Record<string, unknown> = {};
    for (const key of Object.keys(wire)) {
      const text = JSON.stringify(wire[key]);
      if (peer.sent.get(key) === text) continue;
      peer.sent.set(key, text);
      changed[key] = wire[key];
    }
    peer.send!({ t: 'state', v: changed as Partial<WireView>, e: peer.events });
    peer.events = [];
  }

  /** Advances the match by real time and sends snapshots at their own pace. */
  tick(seconds: number): void {
    if (this.players === 0) {
      this.emptyFor += seconds;
      return;
    }
    this.emptyFor = 0;
    this.pending = Math.min(this.pending + seconds, MAX_CATCH_UP);
    while (this.pending >= TICK) {
      this.gather(step(this.state, TICK));
      this.pending -= TICK;
    }
    this.sendIn -= seconds;
    if (this.sendIn > 0) return;
    this.sendIn = 1 / SEND_RATE;
    for (const peer of this.connected()) this.sendState(peer);
  }
}
