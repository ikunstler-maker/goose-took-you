import { describe, expect, it } from 'vitest';
import { CARPET_COOLDOWN, CARPET_HIDE_LIMIT, CARPET_HIDE_MAX, TICK } from '../config';
import { placeCarpets } from './carpets';
import { meetingTable } from './meeting';
import { findPath, fitsIn, nearestFree } from './nav';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type Role, type SimEvent, type WorldState } from './world';

function started(seed: number, role: Role): WorldState {
  const state = createWorld(seed, undefined, role);
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

function wait(state: WorldState, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += TICK) events.push(...step(state, TICK));
  return events;
}

const seen = (state: WorldState): number => state.visible.reduce((a, b) => a + b, 0);

/** Player Goose standing on rug 0, with the bots frozen. */
function onRug(seed: number): WorldState {
  const state = started(seed, 'goose');
  for (const p of state.participants) p.brain = null;
  const rug = state.carpets[0]!;
  me(state).x = rug.x;
  me(state).z = rug.z;
  step(state, TICK);
  return state;
}

describe('carpet layout', () => {
  it('puts 2–3 linked rugs per network on clear, reachable floor, the same for a seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createWorld(seed);
      const rugs = state.carpets;
      expect(rugs.length, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      expect(placeCarpets(state.level, state.buckets)).toEqual(rugs);
      const fits = fitsIn(state.level, state.buckets);
      for (const rug of rugs) {
        expect(state.level.zone[Math.floor(rug.z) * state.level.size + Math.floor(rug.x)]).toBe(rug.room);
        expect(fits(rug.x, rug.z)).toBe(true);
        const net = rugs.filter((r) => r.net === rug.net);
        expect(net.length).toBeGreaterThanOrEqual(2);
        expect(net.length).toBeLessThanOrEqual(3);
        expect([...rug.links].sort()).toEqual(net.filter((r) => r !== rug).map((r) => r.id).sort());
        const path = findPath(state.nav, fits, state.level.spawn.x, state.level.spawn.z, nearestFree(state.nav, rug.x, rug.z, 2));
        expect(path, `seed ${seed} rug ${rug.id}`).not.toBeNull();
      }
    }
  });
});

describe('carpets', () => {
  it('let the Goose dive, crawl to a linked rug and climb out', () => {
    const state = onRug(42);
    const rug = state.carpets[0]!;
    expect(me(state).prompt).toEqual({ kind: 'carpet', carpet: rug.id });
    const before = seen(state);
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'interact' })).toEqual([
      { type: 'carpet', who: LOCAL_PLAYER, carpet: rug.id, action: 'in' },
    ]);
    expect(me(state).under).toBe(rug.id);
    expect(seen(state)).toBeLessThan(before);

    // No walking, packing or reporting from under a rug.
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 1, z: 0 });
    wait(state, 0.3);
    expect(me(state).x).toBe(rug.x);
    expect(me(state).canPack).toBeNull();

    wait(state, CARPET_COOLDOWN);
    const stranger = state.carpets.find((c) => c.net !== rug.net);
    if (stranger) expect(applyCommand(state, LOCAL_PLAYER, { type: 'crawl', to: stranger.id })).toEqual([]);
    const next = state.carpets[rug.links[0]!]!;
    applyCommand(state, LOCAL_PLAYER, { type: 'crawl', to: next.id });
    expect(me(state).under).toBe(next.id);
    expect([me(state).x, me(state).z]).toEqual([next.x, next.z]);

    wait(state, CARPET_COOLDOWN);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(me(state).under).toBeNull();
    expect(seen(state)).toBeGreaterThan(0);
  });

  it('are for the Goose only', () => {
    const state = started(42, 'chick');
    const rug = state.carpets[0]!;
    me(state).x = rug.x;
    me(state).z = rug.z;
    step(state, TICK);
    expect(me(state).prompt?.kind).not.toBe('carpet');
  });

  it('are remembered by a chick that sees the dive', () => {
    const state = onRug(42);
    const witness = state.participants[3]!;
    witness.brain = createWitnessBrain(state, 3);
    witness.x = me(state).x + 1.5;
    witness.z = me(state).z;
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(witness.brain!.suspicion).toMatchObject({ who: LOCAL_PLAYER, level: 2, deed: 'carpet' });
  });

  it('give the Goose back when a meeting starts', () => {
    const state = onRug(42);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    const caller = state.participants[2]!;
    state.buttonCooldown = 0;
    const table = meetingTable(state)!;
    caller.x = table.x + table.radius + 0.5;
    caller.z = table.z;
    step(state, TICK);
    applyCommand(state, caller.id, { type: 'interact' });
    expect(state.phase).toBe('meeting');
    expect(me(state).under).toBeNull();
  });

  it('let the bot Goose escape under a rug in a bot match', () => {
    let dives = 0;
    for (const seed of [3, 42, 99, 7]) {
      const state = started(seed, 'chick');
      // Never left hiding forever; a sabotage may end the match while it still hides.
      let hidden = 0;
      let longest = 0;
      for (let t = 0; t < 600 && state.phase !== 'over'; t += TICK) {
        dives += step(state, TICK).filter((e) => e.type === 'carpet' && e.action === 'in').length;
        hidden = state.phase === 'play' && state.participants.some((p) => p.under !== null) ? hidden + TICK : 0;
        longest = Math.max(longest, hidden);
      }
      expect(longest, `seed ${seed}`).toBeLessThan(CARPET_HIDE_LIMIT + CARPET_HIDE_MAX + 3);
    }
    expect(dives).toBeGreaterThan(0);
  }, 120_000);
});

/** A brain for a frozen bot: it still remembers what it sees. */
function createWitnessBrain(state: WorldState, id: number) {
  const brain = createWorld(state.level.seed).participants[id]!.brain!;
  brain.wait = 1e9;
  return brain;
}
