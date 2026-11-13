import { describe, expect, it } from 'vitest';
import {
  CARRY_VACATION_SPEED,
  PACK_COOLDOWN,
  PLAYER_SPEED,
  SHIELD_COOLDOWN,
  SHIELD_TIME,
  SPIRIT_BOTS,
  SPIRIT_SPEED,
  TICK,
} from '../config';
import { alertTick, SEEN } from './attention';
import { createBrain } from './bots';
import { meetingTable } from './meeting';
import { createRng } from './rng';
import { seesBody } from './view';
import { applyCommand, createWorld, LOCAL_PLAYER, me, progress, step, type Participant, type SimEvent, type WorldState } from './world';

/** A match with every bot frozen; the player plays `role`. */
function match(seed: number, role: 'chick' | 'goose'): WorldState {
  const state = createWorld(seed, undefined, role);
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  for (const p of state.participants) {
    if (p.id === LOCAL_PLAYER) continue;
    p.brain = null;
    p.moveX = 0;
    p.moveZ = 0;
  }
  return state;
}

function wait(state: WorldState, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += TICK) events.push(...step(state, TICK));
  return events;
}

const goose = (state: WorldState): Participant => state.participants.find((p) => p.role === 'goose')!;

/** The Goose packs `victim` right where it stands. */
function packNow(state: WorldState, victim: Participant): SimEvent[] {
  const g = goose(state);
  g.x = victim.x + 0.6;
  g.z = victim.z;
  g.packCooldown = 0;
  step(state, TICK);
  g.packCooldown = 0;
  return applyCommand(state, g.id, { type: 'pack' });
}

describe('spirit realm', () => {
  it('has SPIRIT_BOTS spirit bots from the start; whoever is packed takes one\'s place and the first is the Holy Farmer', () => {
    const state = match(3, 'chick');
    expect(state.spirits).toHaveLength(SPIRIT_BOTS);
    const first = state.spirits[0]!;
    const victim = me(state);
    packNow(state, victim);
    expect(victim.alive).toBe(false);
    expect(state.spirits).toHaveLength(SPIRIT_BOTS - 1);
    expect({ x: victim.x, z: victim.z }).toEqual({ x: first.x, z: first.z });
    expect(state.farmer).toBe(LOCAL_PLAYER);
    // The box stays where the pack happened.
    const box = state.boxes.find((b) => b.inside === victim.id)!;
    expect(Math.hypot(box.x - victim.x, box.z - victim.z)).toBeGreaterThan(0);
  });

  it('lets a spirit drift through walls, faster, but never out of the office', () => {
    const state = match(3, 'chick');
    const self = me(state);
    packNow(state, self);
    const x = self.x;
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 1, z: 0 });
    step(state, TICK);
    expect(self.x - x).toBeCloseTo(PLAYER_SPEED * SPIRIT_SPEED * TICK, 5);
    wait(state, 120);
    expect(self.x).toBeLessThan(state.level.size);
    expect(self.x).toBeGreaterThan(state.level.size - 3);
  });

  it('keeps two worlds apart: spirits and the living do not see each other; the Holy Farmer sees both', () => {
    const state = match(5, 'chick');
    const self = me(state);
    const other = state.participants.find((p) => p.role === 'chick' && p.id !== LOCAL_PLAYER)!;
    packNow(state, other);
    // The first packed is the Holy Farmer: it sees the living.
    expect(state.farmer).toBe(other.id);
    other.x = self.x + 1;
    other.z = self.z;
    wait(state, TICK);
    expect(seesBody(state, self, other)).toBe(false);
    // The player is packed second: a plain spirit, it sees the Farmer but none of the living.
    const living = state.participants.find((p) => p.alive && p.role === 'chick' && p.id !== LOCAL_PLAYER)!;
    packNow(state, self);
    other.x = self.x + 1;
    other.z = self.z;
    living.x = self.x - 1;
    living.z = self.z;
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 0.01, z: 0 });
    wait(state, TICK * 2);
    expect(seesBody(state, self, other)).toBe(true);
    expect(seesBody(state, self, living)).toBe(false);
  });

  it('lets a spirit finish its own mini-game, which never counts for the living', () => {
    const state = match(6, 'chick');
    const self = me(state);
    packNow(state, self);
    const before = progress(state);
    const task = state.tasks.find((t) => t.owner === LOCAL_PLAYER && t.kind === 'modus')
      ?? state.tasks.find((t) => t.owner === LOCAL_PLAYER && t.kind !== 'cargo' && t.kind !== 'news' && t.kind !== 'badge')!;
    const prop = state.level.props[state.stations[task.station]!.prop]!;
    self.x = prop.x;
    self.z = prop.z + prop.d / 2 + 0.6;
    step(state, TICK);
    expect(self.prompt).toEqual({ kind: 'task', task: task.id });
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(self.activeTask).toBe(task.id);
    wait(state, 5);
    applyCommand(state, LOCAL_PLAYER, { type: 'finishTask' });
    expect(task.ghostDone).toBe(true);
    expect(task.done).toBe(false);
    expect(progress(state)).toBe(before);
  });
});

describe('Holy Farmer', () => {
  it('shields a living one in reach; a pack on it bursts the box and puts the Goose on cooldown', () => {
    const state = match(7, 'chick');
    const self = me(state);
    packNow(state, self);
    expect(state.farmer).toBe(LOCAL_PLAYER);
    self.skillCooldown = 0;
    const near = state.participants.find((p) => p.alive && p.role === 'chick')!;
    self.x = near.x + 1;
    self.z = near.z;
    const [shielded] = applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    expect(shielded).toMatchObject({ type: 'shielded', who: LOCAL_PLAYER });
    const target = state.participants[(shielded as { target: number }).target]!;
    expect(target.shield).toBe(SHIELD_TIME);
    expect(self.skillCooldown).toBe(SHIELD_COOLDOWN);
    const events = packNow(state, target);
    expect(events).toContainEqual(expect.objectContaining({ type: 'shieldPopped', victim: target.id }));
    expect(target.alive).toBe(true);
    expect(target.shield).toBe(0);
    expect(goose(state).packCooldown).toBe(PACK_COOLDOWN);
  });

  it('is nobody but the Farmer: another spirit has no skill', () => {
    const state = match(7, 'chick');
    const other = state.participants.find((p) => p.role === 'chick' && p.id !== LOCAL_PLAYER)!;
    packNow(state, other);
    packNow(state, me(state));
    me(state).skillCooldown = 0;
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'skill' })).toEqual([]);
  });
});

describe('carrying a vacation box', () => {
  it('lets the Goose lift a fresh box, walk slower with it and put it down', () => {
    const state = match(9, 'goose');
    const victim = state.participants.find((p) => p.role === 'chick')!;
    packNow(state, victim);
    const box = state.boxes.find((b) => b.inside === victim.id)!;
    const g = me(state);
    g.x = box.x + 0.5;
    g.z = box.z;
    step(state, TICK);
    expect(g.prompt).toEqual({ kind: 'pickup', box: box.id });
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(box.carrier).toBe(LOCAL_PLAYER);
    step(state, TICK);
    expect(g.prompt).toEqual({ kind: 'drop' });
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 1, z: 0 });
    const x = g.x;
    step(state, TICK);
    if (g.x !== x) expect(g.x - x).toBeCloseTo(PLAYER_SPEED * CARRY_VACATION_SPEED * TICK, 5);
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 0, z: 0 });
    step(state, TICK);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(box.carrier).toBeNull();
    expect(g.carrying).toBeNull();
  });

  it('gives the Goose away to a chick that reads the sticker up close', () => {
    const state = match(9, 'goose');
    const victim = state.participants.find((p) => p.role === 'chick')!;
    packNow(state, victim);
    const box = state.boxes.find((b) => b.inside === victim.id)!;
    const g = me(state);
    g.x = box.x + 0.5;
    g.z = box.z;
    step(state, TICK);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    const witness = state.participants.find((p) => p.alive && p.role === 'chick')!;
    witness.brain = createBrain(createRng(3));
    witness.x = g.x + 1.5;
    witness.z = g.z;
    witness.facing = -Math.PI / 2;
    for (let i = 0; i < 120 && witness.brain.suspicion?.deed !== 'carry'; i++) {
      state.tick = alertTick(witness, g.x, g.z, SEEN.carry, state.tick);
      step(state, TICK);
    }
    expect(witness.brain.suspicion).toMatchObject({ who: LOCAL_PLAYER, level: 2, deed: 'carry' });
  });

  it('a meeting takes the box out of the Goose\'s wings', () => {
    const state = match(9, 'goose');
    const victim = state.participants.find((p) => p.role === 'chick')!;
    packNow(state, victim);
    const box = state.boxes.find((b) => b.inside === victim.id)!;
    const g = me(state);
    g.x = box.x + 0.5;
    g.z = box.z;
    step(state, TICK);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    const caller = state.participants.find((p) => p.alive && p.role === 'chick')!;
    state.buttonCooldown = 0;
    const table = meetingTable(state)!;
    caller.x = table.x + table.radius + 0.5;
    caller.z = table.z;
    step(state, TICK);
    applyCommand(state, caller.id, { type: 'interact' });
    expect(state.phase).toBe('meeting');
    expect(g.carrying).toBeNull();
  });
});
