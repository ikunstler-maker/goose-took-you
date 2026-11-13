import { describe, expect, it } from 'vitest';
import {
  ATTN_BEHIND_CHANCE,
  ATTN_BUSY,
  ATTN_FOCUS_CHANCE,
  FEATHER_TIME,
  GOOSE_SKILL_COOLDOWN,
  MORPH_GLITCH,
  MORPH_TIME,
  PLAYER_SPEED,
  SKILL_FIRST_COOLDOWN,
  TICK,
  VANISH_SHIMMER,
  VANISH_SPEED,
  VANISH_TIME,
} from '../config';
import { alertTick, attentionChance, SEEN } from './attention';
import { createBrain } from './bots';
import { meetingTable } from './meeting';
import { createRng } from './rng';
import { seesBody, viewFor, eventsFor } from './view';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type Participant, type SimEvent, type WorldState } from './world';

function gooseMatch(seed: number): WorldState {
  const state = createWorld(seed, undefined, 'goose');
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  for (const p of state.participants) if (p.id !== LOCAL_PLAYER) p.brain = null;
  me(state).skillCooldown = 0;
  return state;
}

function wait(state: WorldState, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += TICK) events.push(...step(state, TICK));
  return events;
}

const chick = (state: WorldState, n = 1): Participant => state.participants.filter((p) => p.role === 'chick')[n]!;

describe('Goose roulette', () => {
  it('waits SKILL_FIRST_COOLDOWN after the start', () => {
    const state = createWorld(4, undefined, 'goose');
    applyCommand(state, LOCAL_PLAYER, { type: 'start' });
    expect(me(state).skillCooldown).toBe(SKILL_FIRST_COOLDOWN);
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'skill' })).toEqual([]);
  });

  it('rolls each next skill from the seed, both kinds over a match', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) kinds.add(gooseMatch(seed).participants[LOCAL_PLAYER]!.gooseNext);
    expect(kinds).toEqual(new Set(['morph', 'vanish']));
  });

  it('Deepfake: a glitch, then a living chick\'s look for MORPH_TIME, a feather at each end', () => {
    const state = gooseMatch(4);
    const goose = me(state);
    goose.gooseNext = 'morph';
    const events = applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    expect(events).toEqual([{ type: 'morphed', who: LOCAL_PLAYER, x: goose.x, z: goose.z }]);
    expect(state.feathers).toHaveLength(1);
    expect(goose.disguise).toBeNull();
    // No packing inside the cloud.
    expect(goose.glitch).toBe(MORPH_GLITCH);
    wait(state, MORPH_GLITCH + TICK);
    const copy = state.participants[goose.disguise!]!;
    expect(copy.role).toBe('chick');
    expect(copy.alive).toBe(true);
    // Others see the copy's look on the Goose; the Goose sees its own.
    const other = chick(state, 2);
    expect(viewFor(state, other.id).seats[LOCAL_PLAYER]).toMatchObject({ color: copy.color, accessory: copy.accessory });
    expect(viewFor(state, LOCAL_PLAYER).seats[LOCAL_PLAYER]).toMatchObject({ color: goose.color, accessory: goose.accessory });
    // The cooldown waits for the trick to end.
    expect(goose.skillCooldown).toBe(GOOSE_SKILL_COOLDOWN);
    const back = wait(state, MORPH_TIME);
    expect(back.some((e) => e.type === 'morphed')).toBe(true);
    // The first feather is gone by now (FEATHER_TIME < MORPH_TIME); a fresh one lies where it ends.
    expect(state.feathers).toHaveLength(1);
    expect(state.feathers[0]).toMatchObject({ x: goose.x, z: goose.z });
    expect(state.feathers[0]!.left).toBeGreaterThan(FEATHER_TIME - 1);
    wait(state, MORPH_GLITCH + TICK);
    expect(goose.disguise).toBeNull();
    expect(goose.skillCooldown).toBeLessThan(GOOSE_SKILL_COOLDOWN);
    wait(state, FEATHER_TIME);
    expect(state.feathers).toHaveLength(0);
  });

  it('pressed again in a borrowed look, the mask comes off at once', () => {
    const state = gooseMatch(5);
    const goose = me(state);
    goose.gooseNext = 'morph';
    applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    wait(state, MORPH_GLITCH + 1);
    expect(goose.disguise).not.toBeNull();
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'skill' })).toHaveLength(1);
    wait(state, MORPH_GLITCH + TICK);
    expect(goose.disguise).toBeNull();
  });

  it('a pack in a borrowed look is blamed on the copy', () => {
    const state = gooseMatch(6);
    const goose = me(state);
    goose.gooseNext = 'morph';
    applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    wait(state, MORPH_GLITCH + TICK);
    const copy = goose.disguise!;
    const victim = state.participants.find((p) => p.role === 'chick' && p.id !== copy)!;
    const witness = state.participants.find((p) => p.role === 'chick' && p.id !== copy && p !== victim)!;
    witness.brain = createBrain(createRng(1));
    victim.x = goose.x + 0.6;
    victim.z = goose.z;
    witness.x = goose.x;
    witness.z = goose.z + 1.5;
    witness.facing = Math.PI;
    step(state, TICK);
    goose.packCooldown = 0;
    state.tick = alertTick(witness, goose.x, goose.z, SEEN.pack, state.tick);
    applyCommand(state, LOCAL_PLAYER, { type: 'pack' });
    expect(witness.brain.suspicion).toMatchObject({ who: copy, level: 2, deed: 'pack' });
  });

  it('Incognito: unseen and faster for VANISH_TIME, no packing, a modem squeal and a shimmer to come back', () => {
    const state = gooseMatch(8);
    const goose = me(state);
    goose.gooseNext = 'vanish';
    const other = chick(state);
    applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    expect(goose.vanish).toBe(VANISH_TIME);
    expect(seesBody(state, other, goose)).toBe(false);
    expect(viewFor(state, other.id).seats[LOCAL_PLAYER]!.body).toBeNull();
    other.x = goose.x + 0.5;
    other.z = goose.z;
    goose.packCooldown = 0;
    step(state, TICK);
    expect(goose.canPack).toBeNull();
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'pack' })).toEqual([]);
    // Faster on foot.
    goose.moveX = 1;
    goose.moveZ = 0;
    const x = goose.x;
    step(state, TICK);
    if (goose.x !== x) expect(goose.x - x).toBeCloseTo(PLAYER_SPEED * VANISH_SPEED * TICK, 5);
    goose.moveX = 0;
    const events = wait(state, VANISH_TIME);
    expect(events.some((e) => e.type === 'modem')).toBe(true);
    expect(goose.shimmer).toBeGreaterThan(0);
    // Back in view, flickering for a moment.
    expect(goose.vanish).toBe(0);
    wait(state, VANISH_SHIMMER + TICK);
    expect(goose.shimmer).toBe(0);
  });

  it('an invisible Goose brushing past a potted plant makes it shake', () => {
    const state = gooseMatch(9);
    const goose = me(state);
    goose.gooseNext = 'vanish';
    applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    const plant = state.level.props.findIndex((p) => p.kind === 'ficus' || p.kind === 'monstera');
    const prop = state.level.props[plant]!;
    goose.x = prop.x + prop.w / 2 + 0.3;
    goose.z = prop.z;
    const events = wait(state, TICK * 2);
    expect(events).toContainEqual({ type: 'rustled', prop: plant, x: prop.x, z: prop.z });
    expect(state.rustles.some((r) => r.prop === plant)).toBe(true);
  });

  it('tells others only where a glitch happened, not who', () => {
    const state = gooseMatch(4);
    me(state).gooseNext = 'morph';
    const other = chick(state);
    other.x = me(state).x + 1;
    other.z = me(state).z;
    step(state, TICK);
    const events = applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    // Human seats get their sight computed; make the other one a person for the check.
    other.isBot = false;
    applyCommand(state, other.id, { type: 'move', x: 0.01, z: 0 });
    wait(state, TICK);
    const heard = eventsFor(state, other.id, events);
    for (const e of heard) if (e.type === 'morphed') expect(e.who).toBe(-1);
  });

  it('a bot that sees the Goose vanish knows who it was', () => {
    const state = gooseMatch(10);
    const goose = me(state);
    goose.gooseNext = 'vanish';
    const witness = chick(state);
    witness.brain = createBrain(createRng(2));
    witness.x = goose.x + 1.5;
    witness.z = goose.z;
    witness.facing = -Math.PI / 2;
    step(state, TICK);
    state.tick = alertTick(witness, goose.x, goose.z, SEEN.vanish, state.tick);
    applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    expect(witness.brain.suspicion).toMatchObject({ who: LOCAL_PLAYER, level: 2, deed: 'vanish' });
  });

  it('a meeting ends every trick and clears the clues', () => {
    const state = gooseMatch(11);
    const goose = me(state);
    goose.gooseNext = 'morph';
    applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    wait(state, MORPH_GLITCH + TICK);
    const caller = chick(state);
    state.buttonCooldown = 0;
    const table = meetingTable(state)!;
    caller.x = table.x + table.radius + 0.5;
    caller.z = table.z;
    step(state, TICK);
    applyCommand(state, caller.id, { type: 'interact' });
    expect(state.phase).toBe('meeting');
    expect(goose.disguise).toBeNull();
    expect(state.feathers).toHaveLength(0);
  });
});

describe('bot attention', () => {
  const bot = (facing: number, busy = false): Participant =>
    ({ id: 1, x: 0, z: 0, facing, activeTask: busy ? 0 : null, watching: false, brain: null }) as unknown as Participant;

  it('notices what is ahead, less to the side, rarely behind, less when busy', () => {
    // Heading 0 faces +z.
    const ahead = attentionChance(bot(0), 0, 5);
    const side = attentionChance(bot(0), 5, 0.5);
    const behind = attentionChance(bot(0), 0, -5);
    expect(ahead).toBe(ATTN_FOCUS_CHANCE);
    expect(side).toBeLessThan(ahead);
    expect(side).toBeGreaterThan(behind);
    expect(behind).toBe(ATTN_BEHIND_CHANCE);
    expect(attentionChance(bot(0, true), 0, 5)).toBeCloseTo(ATTN_FOCUS_CHANCE * ATTN_BUSY);
  });

  it('misses some of what is right ahead, over many moments', () => {
    const p = bot(0);
    let seen = 0;
    for (let tick = 0; tick < 2000; tick++) if (alertTick(p, 0, 5, SEEN.pack, tick) === tick) seen++;
    expect(seen / 2000).toBeGreaterThan(ATTN_FOCUS_CHANCE - 0.05);
    expect(seen).toBeLessThan(2000);
  });
});
