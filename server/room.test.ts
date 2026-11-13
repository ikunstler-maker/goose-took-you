import { describe, expect, it } from 'vitest';
import type { ServerMessage, WireView } from '../src/net/protocol';
import { Room, sanitize } from './room';

/** A fake browser: remembers everything the room sent and keeps the merged snapshot. */
function browser() {
  const inbox: ServerMessage[] = [];
  const view: Partial<WireView> = {};
  const send = (message: ServerMessage): void => {
    inbox.push(message);
    if (message.t === 'state') Object.assign(view, message.v);
  };
  const last = <T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> =>
    [...inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }>;
  return { inbox, view, send, last };
}

let n = 0;
const room = (): Room => new Room('ABCDE', () => 7, () => `token-${++n}`);
const run = (r: Room, seconds: number): void => {
  for (let t = 0; t < seconds; t += 0.05) r.tick(0.05);
};

describe('sanitize', () => {
  it('rebuilds known commands and drops everything else', () => {
    expect(sanitize({ type: 'move', x: 1, z: -1, extra: 'x' })).toEqual({ type: 'move', x: 1, z: -1 });
    expect(sanitize({ type: 'move', x: 'a', z: 0 })).toBeNull();
    expect(sanitize({ type: 'move', x: Infinity, z: 0 })).toBeNull();
    expect(sanitize({ type: 'join' })).toBeNull();
    expect(sanitize({ type: 'leave' })).toBeNull();
    expect(sanitize({ type: 'vote', target: 1.5 })).toBeNull();
    expect(sanitize({ type: 'sabotage', kind: 'nuke' })).toBeNull();
    expect(sanitize({ type: 'say', kind: 'suspect', about: 3, room: null })).toEqual({ type: 'say', kind: 'suspect', about: 3, room: null });
    expect(sanitize('start')).toBeNull();
    expect(sanitize(null)).toBeNull();
  });
});

describe('rooms', () => {
  it('seat people in the lobby, each with a seat, a token and a look of their own', () => {
    const r = room();
    const [a, b] = [browser(), browser()];
    const idA = r.join(a.send, { color: 3, accessory: 1 });
    const idB = r.join(b.send, { color: 3, accessory: 2 });
    expect(typeof idA).toBe('number');
    expect(typeof idB).toBe('number');
    const [ra, rb] = [a.last('room'), b.last('room')];
    expect(ra.you).not.toBe(rb.you);
    expect(ra.token).not.toBe(rb.token);
    expect(rb.host).toBe(ra.you);
    expect(a.last('roster').players).toBe(2);
    const seats = r.state.participants;
    expect(seats.filter((p) => !p.isBot)).toHaveLength(2);
    expect(seats[ra.you]!.color).toBe(3);
    // The second person asked for a taken colour and keeps a free one.
    expect(seats[rb.you]!.color).not.toBe(3);
    expect(new Set(seats.map((p) => p.color)).size).toBe(seats.length);
    // Each got a full first snapshot of their own.
    expect(a.view.you).toBe(ra.you);
    expect(b.view.you).toBe(rb.you);
    expect(a.view.seed).toBe(7);
  });

  it('are full at eight and closed once the match runs', () => {
    const r = room();
    const all = Array.from({ length: 8 }, () => browser());
    for (const x of all) expect(typeof r.join(x.send, null)).toBe('number');
    expect(r.join(browser().send, null)).toBe('full');
    r.receive(1, { t: 'cmd', c: { type: 'start' } });
    expect(r.state.phase).toBe('play');
    expect(r.join(browser().send, null)).toBe('started');
  });

  it('let only the host start, and pass the host on when they leave', () => {
    const r = room();
    const [a, b, c] = [browser(), browser(), browser()];
    const idA = r.join(a.send, null) as number;
    const idB = r.join(b.send, null) as number;
    r.join(c.send, null);
    r.receive(idB, { t: 'cmd', c: { type: 'start' } });
    expect(r.state.phase).toBe('lobby');
    r.drop(idA);
    expect(r.host).toBe(b.last('room').you);
    expect(c.last('roster')).toMatchObject({ host: b.last('room').you, players: 2 });
    // A lobby seat left behind goes back to the bots.
    expect(r.state.participants[a.last('room').you]!.isBot).toBe(true);
    r.receive(idB, { t: 'cmd', c: { type: 'start' } });
    expect(r.state.phase).toBe('play');
    expect(b.inbox.some((m) => m.t === 'state' && m.e.some((e) => e.type === 'started'))).toBe(false);
    run(r, 0.2);
    expect(b.inbox.some((m) => m.t === 'state' && m.e.some((e) => e.type === 'started'))).toBe(true);
  });

  it('move a player by their own commands only, and send only what changed', () => {
    const r = room();
    const [a, b] = [browser(), browser()];
    const idA = r.join(a.send, null) as number;
    r.join(b.send, null);
    r.receive(idA, { t: 'cmd', c: { type: 'start' } });
    run(r, 0.3);
    const seatA = a.last('room').you;
    const before = { ...r.state.participants[seatA]! };
    // Rubbish and seat commands are ignored.
    r.receive(idA, { t: 'cmd', c: { type: 'join' } as never });
    r.receive(idA, { t: 'cmd', c: 'boom' as never });
    r.receive(idA, { t: 'cmd', c: { type: 'move', x: 1, z: 0 } });
    a.inbox.length = 0;
    run(r, 1);
    expect(r.state.participants[seatA]!.x).toBeGreaterThan(before.x);
    // The snapshot trails the match by at most one send.
    expect(Math.abs(a.view.seats![seatA]!.body!.x - r.state.participants[seatA]!.x)).toBeLessThan(0.6);
    const states = a.inbox.filter((m) => m.t === 'state');
    expect(states.length).toBeGreaterThanOrEqual(9);
    // The office itself and the task list did not change: they are not resent.
    expect(states.every((m) => m.t === 'state' && !('seed' in m.v) && !('tasks' in m.v) && !('carpets' in m.v))).toBe(true);
    // Nobody is told another seat's role.
    const seatB = b.last('room').you;
    expect(a.view.seats![seatB]!.role).toBeNull();
    expect(b.view.seats![seatA]!.role).toBeNull();
    expect(JSON.stringify(a.inbox)).not.toContain('brain');
  });

  it('let a bot cover for a dropped player and give the seat back by token', () => {
    const r = room();
    const [a, b] = [browser(), browser()];
    const idA = r.join(a.send, null) as number;
    const idB = r.join(b.send, null) as number;
    r.receive(idA, { t: 'cmd', c: { type: 'start' } });
    run(r, 0.2);
    const { you, token } = b.last('room');
    r.drop(idB);
    expect(r.state.participants[you]!.brain).not.toBeNull();
    expect(r.state.participants[you]!.isBot).toBe(false);
    expect(r.rejoin(browser().send, 'wrong')).toBe('noRoom');
    const back = browser();
    expect(typeof r.rejoin(back.send, token)).toBe('number');
    expect(back.last('room').you).toBe(you);
    expect(r.state.participants[you]!.brain).toBeNull();
    // A full snapshot again, not just the changes.
    expect(back.view.seed).toBe(7);
    expect(back.view.tasks!.length).toBeGreaterThan(0);
    // The token works once.
    expect(r.rejoin(browser().send, token)).toBe('noRoom');
  });

  it('wait while empty and start a fresh office for the host after the match', () => {
    const r = room();
    const [a, b] = [browser(), browser()];
    const idA = r.join(a.send, null) as number;
    const idB = r.join(b.send, null) as number;
    r.receive(idA, { t: 'cmd', c: { type: 'start' } });
    r.state.phase = 'over';
    r.receive(idB, { t: 'again' });
    expect(r.state.phase).toBe('over');
    r.receive(idA, { t: 'again' });
    expect(r.state.phase).toBe('lobby');
    expect(r.state.participants.filter((p) => !p.isBot)).toHaveLength(2);
    expect(a.last('room').players).toBe(2);
    r.drop(idA);
    r.drop(idB);
    const tick = r.state.tick;
    run(r, 2);
    expect(r.state.tick).toBe(tick);
    expect(r.emptyFor).toBeGreaterThan(1.9);
  });
});
