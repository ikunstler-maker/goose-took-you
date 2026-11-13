import { describe, expect, it } from 'vitest';
import { PACK_COOLDOWN, TICK } from '../config';
import { fitsIn } from './nav';
import { eventsFor, viewFor } from './view';
import { applyCommand, createWorld, isAway, step, type SimEvent, type WorldState } from './world';

/** A match with people on seats 0, 1 and 2; the rest are bots. */
function online(seed: number): WorldState {
  const state = createWorld(seed);
  applyCommand(state, 1, { type: 'join' });
  applyCommand(state, 2, { type: 'join' });
  return state;
}

function run(state: WorldState, seconds: number, each?: (events: SimEvent[]) => void): void {
  for (let t = 0; t < seconds; t += TICK) {
    const events = step(state, TICK);
    each?.(events);
  }
}

describe('seats', () => {
  it('let people take bot seats in the lobby, each in a colour of their own', () => {
    const state = online(7);
    const humans = state.participants.filter((p) => !p.isBot);
    expect(humans.map((p) => p.id)).toEqual([0, 1, 2]);
    expect(humans.every((p) => p.brain === null)).toBe(true);
    expect(new Set(state.participants.map((p) => p.color)).size).toBe(state.participants.length);
    // Nobody takes a colour another person wears.
    expect(applyCommand(state, 1, { type: 'setLook', color: state.participants[0]!.color, accessory: 0 })).toEqual([]);
    const free = state.participants[5]!.color;
    expect(applyCommand(state, 1, { type: 'setLook', color: free, accessory: 2 })).toHaveLength(1);
    expect(new Set(state.participants.map((p) => p.color)).size).toBe(state.participants.length);
    // Leaving the lobby hands the seat back to the bots.
    applyCommand(state, 2, { type: 'leave' });
    expect(state.participants[2]!.isBot).toBe(true);
    expect(state.participants[2]!.brain).not.toBeNull();
    // Nobody new once the match runs.
    applyCommand(state, 0, { type: 'start' });
    expect(applyCommand(state, 4, { type: 'join' })).toEqual([]);
  });

  it('deal the Goose among everyone and give every person their own sight', () => {
    const gooseSeats = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const state = online(seed);
      applyCommand(state, 1, { type: 'start' });
      gooseSeats.add(state.participants.findIndex((p) => p.role === 'goose'));
    }
    expect(gooseSeats.size).toBeGreaterThan(4);

    const state = online(7);
    applyCommand(state, 0, { type: 'start' });
    const far = state.level.rooms.find((r) => r.id !== state.participants[0]!.roomId)!;
    state.participants[1]!.x = far.cx + 0.5;
    state.participants[1]!.z = far.cz + 0.5;
    applyCommand(state, 1, { type: 'move', x: 1, z: 0 });
    run(state, 1);
    expect(state.sight[1]!.cells).not.toEqual(state.sight[0]!.cells);
    expect(state.sight[1]!.cells.some((c) => c === 1)).toBe(true);
    // Bot seats are not tracked.
    expect(state.sight[5]!.cells.some((c) => c === 1)).toBe(false);
  });

  it('let a bot cover for a person who left mid-match, and hand the seat back', () => {
    const state = online(7);
    applyCommand(state, 0, { type: 'start' });
    const seat = state.participants[1]!;
    expect(applyCommand(state, 1, { type: 'leave' })).toContainEqual({ type: 'seatChanged', who: 1 });
    expect(seat.isBot).toBe(false);
    expect(isAway(seat)).toBe(true);
    const { x, z } = seat;
    run(state, 20);
    expect(Math.hypot(seat.x - x, seat.z - z)).toBeGreaterThan(1);
    expect(viewFor(state, 0).seats[1]).toMatchObject({ human: true, away: true });
    applyCommand(state, 1, { type: 'join' });
    expect(seat.brain).toBeNull();
    expect(isAway(seat)).toBe(false);
    expect(seat.moveX).toBe(0);
  });
});

describe('player views', () => {
  it('never show a chick anything it cannot know, through a whole stretch of play', () => {
    const state = online(11);
    applyCommand(state, 0, { type: 'start' });
    const chick = state.participants.find((p) => !p.isBot && p.role === 'chick')!;
    let checked = 0;
    run(state, 90, () => {
      if (state.tick % 30 !== 0) return;
      // People wander so that sight keeps changing.
      for (const id of [0, 1, 2]) applyCommand(state, id, { type: 'move', x: Math.sin(state.tick + id), z: Math.cos(state.tick * 0.7 + id) });
      const view = viewFor(state, chick.id);
      const wire = JSON.stringify(view);
      for (const secret of ['brain', 'plan', 'suspicion', 'notes', 'tellIn', '"seen"', 'rooms']) expect(wire).not.toContain(secret);
      for (const seat of view.seats) {
        const p = state.participants[seat.id]!;
        if (seat.id !== chick.id && state.phase !== 'over' && !p.ejected) expect(seat.role).toBeNull();
        if (seat.id !== chick.id && state.phase === 'play' && seat.body) {
          expect(p.under).toBeNull();
          expect(state.sight[chick.id]!.cells[Math.floor(p.z) * state.level.size + Math.floor(p.x)]).toBe(1);
        }
      }
      expect(view.self.tasks.every((t) => t.owner === chick.id)).toBe(true);
      expect(view.self.sabotageCooldown).toBe(0);
      if (view.meeting && view.meeting.stage !== 'result') expect(view.meeting.votes).toBeNull();
      checked++;
    });
    expect(checked).toBeGreaterThan(50);
  });

  it('are plain copies: changing one does not touch the match', () => {
    const state = online(7);
    applyCommand(state, 0, { type: 'start' });
    const view = viewFor(state, 0);
    view.sight.fill(1);
    view.seats[0]!.body!.x += 5;
    view.self.tasks[0]!.done = true;
    expect(state.sight[0]!.cells.every((c) => c === 1)).toBe(false);
    expect(viewFor(state, 0).seats[0]!.body!.x).toBe(state.participants[0]!.x);
    expect(state.tasks.find((t) => t.owner === 0)!.done).toBe(false);
  });

  it('keep a pack and the saboteur from those who did not see it', () => {
    const state = createWorld(42, undefined, 'goose');
    applyCommand(state, 1, { type: 'join' });
    applyCommand(state, 2, { type: 'join' });
    applyCommand(state, 0, { type: 'start' });
    const [goose, near, away] = [state.participants[0]!, state.participants[1]!, state.participants[2]!];
    const victim = state.participants[4]!;
    victim.brain = null;
    const far = state.level.rooms.find((r) => r.id !== goose.roomId && r.id !== victim.roomId)!;
    // A free spot in that room, so that walking a step refreshes the sight.
    const fits = fitsIn(state.level, state.buckets);
    spot: for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (!fits(far.cx + dx + 0.5, far.cz + dz + 0.5) || !fits(far.cx + dx + 1.5, far.cz + dz + 0.5)) continue;
        away.x = far.cx + dx + 0.5;
        away.z = far.cz + dz + 0.5;
        break spot;
      }
    }
    goose.packCooldown = 0;
    goose.x = victim.x + 0.6;
    goose.z = victim.z;
    near.x = victim.x;
    near.z = victim.z + 1.5;
    applyCommand(state, 1, { type: 'move', x: 0, z: -0.01 });
    applyCommand(state, 2, { type: 'move', x: 1, z: 0 });
    run(state, 0.5);
    applyCommand(state, 1, { type: 'move', x: 0, z: 0 });
    goose.x = victim.x + 0.6;
    goose.z = victim.z;
    step(state, TICK);
    const events = applyCommand(state, 0, { type: 'pack' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'packed', victim: victim.id }));
    expect(goose.packCooldown).toBe(PACK_COOLDOWN);
    expect(eventsFor(state, near.id, events).some((e) => e.type === 'packed')).toBe(true);
    expect(eventsFor(state, away.id, events).some((e) => e.type === 'packed')).toBe(false);
    expect(eventsFor(state, victim.id, events).some((e) => e.type === 'packed')).toBe(true);
    expect(near.seen).toContainEqual(expect.objectContaining({ kind: 'pack', who: goose.id }));
    expect(away.seen.some((n) => n.kind === 'pack')).toBe(false);

    state.sabotageCooldown = 0;
    const sabotage = applyCommand(state, 0, { type: 'sabotage', kind: 'overheat' });
    expect(sabotage).toContainEqual(expect.objectContaining({ type: 'sabotageStarted', who: 0 }));
    expect(eventsFor(state, away.id, sabotage)).toContainEqual(expect.objectContaining({ type: 'sabotageStarted', who: -1 }));
    expect(eventsFor(state, 0, sabotage)).toContainEqual(expect.objectContaining({ type: 'sabotageStarted', who: 0 }));
  });
});
