import { afterEach, describe, expect, it } from 'vitest';
import { Room } from '../../server/room';
import { LOCAL_PLAYER, me, progress, setLocalSeat } from '../sim/world';
import { PLAYER_SPEED } from '../config';
import { applyView, createMirror, glide, type OwnInput, type Targets } from './mirror';
import { packSight, unpackSight, type ServerMessage, type WireView } from './protocol';

afterEach(() => setLocalSeat(0));

/** A browser's side of the wire: merges snapshot parts like the real client does. */
function browser() {
  const view: Partial<WireView> = {};
  let changed: Partial<WireView> = {};
  const send = (message: ServerMessage): void => {
    if (message.t !== 'state') return;
    Object.assign(view, message.v);
    changed = message.v;
  };
  return { view: view as WireView, send, changed: () => changed };
}

describe('sight packing', () => {
  it('survives the round trip', () => {
    const cells = Uint8Array.from({ length: 1003 }, (_, i) => (i * 7) % 3 === 0 ? 1 : 0);
    const back = new Uint8Array(cells.length);
    unpackSight(packSight(cells), back);
    expect(back).toEqual(cells);
  });
});

describe('the browser copy of an online match', () => {
  it('shows the match from its own seat and hides whoever is out of sight', () => {
    const room = new Room('ABCDE', () => 7, () => 'token');
    const [a, b] = [browser(), browser()];
    const idA = room.join(a.send, null) as number;
    room.join(b.send, null);
    const seat = b.view.you;
    expect(seat).not.toBe(0);

    const world = createMirror(b.view);
    const targets: Targets = new Map();
    applyView(world, b.view, b.view, targets);
    expect(LOCAL_PLAYER).toBe(seat);
    expect(world.level.seed).toBe(room.state.level.seed);
    expect(world.participants.map((p) => p.color)).toEqual(room.state.participants.map((p) => p.color));
    expect(world.participants.filter((p) => !p.isBot).map((p) => p.id)).toEqual([0, seat]);
    // In the lobby everyone stands in plain view.
    expect(world.participants.every((p) => p.x > 0)).toBe(true);

    room.receive(idA, { t: 'cmd', c: { type: 'start' } });
    for (let t = 0; t < 12; t += 0.05) {
      room.tick(0.05);
      applyView(world, b.view, b.changed(), targets);
      glide(world, targets, 0.05);
    }
    const real = room.state.participants;
    expect(world.phase).toBe('play');
    expect(me(world).role).toBe(real[seat]!.role);
    expect(world.tasks.filter((t) => t.owner === seat)).toEqual(room.state.tasks.filter((t) => t.owner === seat));
    expect(world.sight[seat]!.cells).toEqual(room.state.sight[seat]!.cells);
    expect(progress(world)).toBe(progress(room.state));
    let hidden = 0;
    for (const p of world.participants) {
      if (p.id === seat) continue;
      // Nobody else's role is known mid-match.
      expect(p.role).toBe('chick');
      if (p.x < 0) hidden++;
      // Whoever is drawn stands close to where the server has them.
      else expect(Math.hypot(p.x - real[p.id]!.x, p.z - real[p.id]!.z)).toBeLessThan(1.5);
    }
    // After twelve seconds the bots have scattered: most of the office is out of sight.
    expect(hidden).toBeGreaterThan(2);
  });

  it('walks its own chick at once and ends up where the server says', () => {
    const room = new Room('ABCDE', () => 7, () => 'token');
    const a = browser();
    const idA = room.join(a.send, null) as number;
    room.receive(idA, { t: 'cmd', c: { type: 'start' } });
    room.tick(0.05);
    const world = createMirror(a.view);
    const targets: Targets = new Map();
    const own: OwnInput = { x: 0, z: 0, still: 0 };
    applyView(world, a.view, a.view, targets, own);
    const seat = a.view.you;
    const startX = me(world).x;

    // The player pushes right; the command reaches the server 0.2 s later.
    own.x = 1;
    for (let t = 0; t < 0.2; t += 0.05) {
      room.tick(0.05);
      applyView(world, a.view, a.changed(), targets, own);
      glide(world, targets, 0.05, seat, own);
    }
    // Already walking here, although the server has not moved the chick yet.
    expect(me(world).x - startX).toBeGreaterThan(PLAYER_SPEED * 0.15);
    expect(me(world).moving).toBe(true);
    expect(room.state.participants[seat]!.x).toBe(startX);

    room.receive(idA, { t: 'cmd', c: { type: 'move', x: 1, z: 0 } });
    let worst = 0;
    for (let t = 0; t < 2; t += 0.05) {
      room.tick(0.05);
      applyView(world, a.view, a.changed(), targets, own);
      glide(world, targets, 0.05, seat, own);
      worst = Math.max(worst, Math.abs(me(world).x - room.state.participants[seat]!.x));
    }
    // Never further ahead than the delay explains, walls included.
    expect(worst).toBeLessThan(PLAYER_SPEED * 0.4 + 0.6);

    // Letting go: the server hears it at once here, and the copy settles on the server's spot.
    own.x = 0;
    room.receive(idA, { t: 'cmd', c: { type: 'move', x: 0, z: 0 } });
    for (let t = 0; t < 2; t += 0.05) {
      room.tick(0.05);
      applyView(world, a.view, a.changed(), targets, own);
      glide(world, targets, 0.05, seat, own);
    }
    expect(Math.hypot(me(world).x - room.state.participants[seat]!.x, me(world).z - room.state.participants[seat]!.z)).toBeLessThan(0.05);
    expect(me(world).moving).toBe(false);
  });

  it('shows a meeting without telling who voted for whom', () => {
    const room = new Room('ABCDE', () => 7, () => 'token');
    const [a, b] = [browser(), browser()];
    const idA = room.join(a.send, null) as number;
    const idB = room.join(b.send, null) as number;
    room.receive(idA, { t: 'cmd', c: { type: 'start' } });
    room.tick(0.05);
    const world = createMirror(b.view);
    const targets: Targets = new Map();
    applyView(world, b.view, b.view, targets);
    // Skip to a meeting called by the other person, straight into voting.
    room.state.phase = 'meeting';
    room.state.meeting = {
      caller: 0, victim: null, stage: 'vote', elapsed: 40, timeLeft: 10, chat: [], plan: [], ejected: null, tie: false,
      votes: room.state.participants.map(() => null),
      rooms: room.state.participants.map(() => null),
      hints: room.state.participants.map(() => []),
      said: room.state.participants.map(() => 0),
      saidAt: room.state.participants.map(() => -10),
      swayed: room.state.participants.map(() => false),
    };
    room.receive(idA, { t: 'cmd', c: { type: 'vote', target: b.view.you } });
    room.receive(idB, { t: 'cmd', c: { type: 'vote', target: 0 } });
    room.tick(0.05);
    room.tick(0.05);
    applyView(world, b.view, b.changed(), targets);
    const m = world.meeting!;
    expect(m.stage).toBe('vote');
    expect(m.votes[b.view.you]).toBe(0);
    // The other vote is there, its target is not.
    expect(m.votes[0]).not.toBeNull();
    expect(m.votes[0]).not.toBe(b.view.you);
    expect(JSON.stringify(b.view.meeting)).not.toContain('"votes":[');
  });
});
