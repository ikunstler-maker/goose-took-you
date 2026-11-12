import { describe, expect, it } from 'vitest';
import {
  GOOSE_ALIBI_MIN,
  GOOSE_GRACE,
  GOOSE_MEMORY,
  GOOSE_PACK_FREEZE,
  PACK_COOLDOWN,
  PARTICIPANTS,
  TELL_MAX,
  TELL_TIME,
  THOUGHT_TIME,
  TICK,
} from '../config';
import { gooseSees } from './bots';
import { applyCommand, createWorld, LOCAL_PLAYER, me, progress, step, type Participant, type Role, type SimEvent, type WorldState } from './world';

function started(seed: number, role: Role | null = null): WorldState {
  const state = createWorld(seed, undefined, role);
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

/** Puts the local player right next to another participant and lets the sim notice. */
function standBy(state: WorldState, id: number): void {
  const other = state.participants[id]!;
  other.brain = null;
  me(state).x = other.x + 0.6;
  me(state).z = other.z;
  step(state, TICK);
}

describe('roles', () => {
  it('deals exactly one Goose, at random but fixed per seed', () => {
    const geese = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const state = started(seed);
      const g = state.participants.filter((p) => p.role === 'goose');
      expect(g).toHaveLength(1);
      geese.add(g[0]!.id);
      expect(started(seed).participants.map((p) => p.role)).toEqual(state.participants.map((p) => p.role));
    }
    expect(geese.size).toBeGreaterThan(4);
    expect(geese.has(LOCAL_PLAYER)).toBe(true);
  });

  it('honours a forced role for the player', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(me(started(seed, 'goose')).role).toBe('goose');
      expect(me(started(seed, 'chick')).role).toBe('chick');
    }
  });
});

describe('packing and reporting', () => {
  it('lets the Goose pack a chick in reach, then waits out the cooldown', () => {
    const state = started(42, 'goose');
    me(state).packCooldown = 0;
    standBy(state, 3);
    expect(me(state).canPack).toBe(3);
    const events = applyCommand(state, LOCAL_PLAYER, { type: 'pack' });
    expect(events[0]).toMatchObject({ type: 'packed', who: LOCAL_PLAYER, victim: 3 });
    const victim = state.participants[3]!;
    expect(victim.alive).toBe(false);
    const box = state.boxes.find((b) => b.inside === 3)!;
    expect(box.kind).toBe('vacation');
    expect(me(state).packCooldown).toBe(PACK_COOLDOWN);

    standBy(state, 4);
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'pack' })).toEqual([]);
    // The dead do not walk, and cargo-pickup ignores vacation boxes.
    applyCommand(state, 3, { type: 'move', x: 1, z: 0 });
    const { x } = victim;
    for (let i = 0; i < 30; i++) step(state, TICK);
    expect(victim.x).toBe(x);
  });

  it('does not let a chick pack anyone', () => {
    const state = started(42, 'chick');
    standBy(state, state.participants.find((p) => p.id !== LOCAL_PLAYER && p.role === 'chick')!.id);
    expect(me(state).canPack).toBeNull();
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'pack' })).toEqual([]);
  });

  it('lets anyone nearby report a vacation box once, which calls a meeting', () => {
    const state = started(42, 'chick');
    const goose = state.participants.find((p) => p.role === 'goose')!;
    const victim = state.participants.find((p) => p.role === 'chick' && p.id !== LOCAL_PLAYER)!;
    goose.brain = null;
    victim.brain = null;
    goose.packCooldown = 0;
    goose.x = victim.x + 0.5;
    goose.z = victim.z;
    step(state, TICK);
    applyCommand(state, goose.id, { type: 'pack' });
    const box = state.boxes.find((b) => b.kind === 'vacation')!;
    me(state).x = box.x + 1;
    me(state).z = box.z;
    step(state, TICK);
    expect(me(state).canReport).toBe(box.id);
    expect(me(state).prompt).toBeNull();
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'report' })).toEqual([
      { type: 'reported', who: LOCAL_PLAYER, boxId: box.id, victim: victim.id },
      { type: 'meetingStarted', who: LOCAL_PLAYER, victim: victim.id },
    ]);
    step(state, TICK);
    expect(me(state).canReport).toBeNull();
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'report' })).toEqual([]);
  });
});

describe('Goose tell', () => {
  it('stretches the neck every 12–15 s and shows «га-га?» only with someone close', () => {
    const state = started(42, 'goose');
    for (const p of state.participants) p.brain = null;
    let stretched = 0;
    let bubbles = 0;
    for (let t = 0; t < TELL_MAX * 2 + 1; t += TICK) {
      step(state, TICK);
      if (me(state).tell === TELL_TIME - TICK || Math.abs(me(state).tell - (TELL_TIME - TICK)) < 1e-9) stretched++;
      if (me(state).tellBubble) bubbles++;
    }
    expect(stretched).toBeGreaterThanOrEqual(2);
    // Bots stand at the spawn right next to the player.
    expect(bubbles).toBeGreaterThan(0);
    me(state).x += 20;
    for (let t = 0; t < TELL_MAX * 2 + 1; t += TICK) {
      step(state, TICK);
      expect(me(state).tellBubble).toBe(false);
    }
  });
});

describe('winning', () => {
  it('gives the Goose the win when chicks are no more than geese', () => {
    const state = started(7, 'goose');
    const events: SimEvent[] = [];
    for (const victim of state.participants.filter((p) => p.role === 'chick')) {
      if (state.phase !== 'play') break;
      me(state).packCooldown = 0;
      standBy(state, victim.id);
      events.push(...applyCommand(state, LOCAL_PLAYER, { type: 'pack' }));
      events.push(...step(state, TICK));
    }
    expect(events.filter((e) => e.type === 'packed')).toHaveLength(PARTICIPANTS - 2);
    expect(state.phase).toBe('over');
    expect(state.winner).toBe('goose');
  });

  it('gives the chicks the win when every chick task is done; the Goose list does not count', () => {
    const state = started(7, 'goose');
    for (const p of state.participants) p.brain = null;
    for (const task of state.tasks) if (task.owner !== LOCAL_PLAYER) task.done = true;
    expect(progress(state)).toBe(1);
    const events = step(state, TICK);
    expect(events).toContainEqual({ type: 'gameOver', winner: 'chicks' });
    expect(me(state).moving).toBe(false);
  });

  it('plays a whole bot match to a winner with an idle chick player', () => {
    const winners: string[] = [];
    let packs = 0;
    for (const seed of [3, 42, 99]) {
      const state = started(seed, 'chick');
      const goose = state.participants.find((p) => p.role === 'goose')!;
      for (let t = 0; t < 900 && state.phase !== 'over'; t += TICK) {
        const packed = step(state, TICK).filter((e) => e.type === 'packed').length;
        if (packed > 0) {
          // Never during the grace period; then a freeze and a model-worker spell.
          expect(t).toBeGreaterThanOrEqual(GOOSE_GRACE);
          expect(goose.brain!.wait).toBeCloseTo(GOOSE_PACK_FREEZE, 5);
          expect(goose.brain!.alibi).toBeGreaterThan(GOOSE_ALIBI_MIN - 1);
        }
        packs += packed;
      }
      expect(state.phase, `seed ${seed}`).toBe('over');
      winners.push(state.winner!);
    }
    expect(packs).toBeGreaterThan(0);
  }, 120_000);
});

/** A started match with a bot Goose, every other bot frozen in place. */
function quietGoose(seed: number): { state: WorldState; goose: Participant } {
  const state = started(seed, 'chick');
  for (const p of state.participants) if (p.role !== 'goose') p.brain = null;
  const goose = state.participants.find((p) => p.role === 'goose')!;
  return { state, goose };
}

describe('bot Goose', () => {
  it('does not hunt during the grace period', () => {
    for (const seed of [3, 42]) {
      const state = started(seed, 'chick');
      const goose = state.participants.find((p) => p.role === 'goose')!;
      for (let t = 0; t < GOOSE_GRACE - 0.5; t += TICK) {
        expect(step(state, TICK).some((e) => e.type === 'packed')).toBe(false);
        expect(goose.brain!.prey).toBeNull();
      }
    }
  });

  it('sees only ahead, and less while posing at a desk', () => {
    const { state, goose } = quietGoose(42);
    const chick = state.participants.find((p) => p.role === 'chick' && p.id !== LOCAL_PLAYER)!;
    goose.x = state.level.spawn.x;
    goose.z = state.level.spawn.z;
    goose.facing = 0;
    chick.x = goose.x;
    chick.z = goose.z + 2;
    expect(gooseSees(state, goose, chick)).toBe(true);
    chick.z = goose.z - 2;
    expect(gooseSees(state, goose, chick)).toBe(false);
    // 40° off its heading: inside the 100° cone, outside the 45° tunnel.
    chick.x = goose.x + 2 * Math.sin((40 * Math.PI) / 180);
    chick.z = goose.z + 2 * Math.cos((40 * Math.PI) / 180);
    expect(gooseSees(state, goose, chick)).toBe(true);
    goose.brain!.fake = 3;
    expect(gooseSees(state, goose, chick)).toBe(false);
  });

  it('forgets prey it has not seen for a while', () => {
    const { state, goose } = quietGoose(42);
    const brain = goose.brain!;
    brain.calm = 0;
    const prey = state.participants.find((p) => p.role === 'chick' && p.id !== LOCAL_PLAYER)!;
    brain.prey = prey.id;
    brain.preyX = goose.x;
    brain.preyZ = goose.z;
    // Everyone huddles far away, out of sight: no lone chick to switch to either.
    const far = state.level.rooms.reduce((a, b) =>
      Math.hypot(b.cx - goose.x, b.cz - goose.z) > Math.hypot(a.cx - goose.x, a.cz - goose.z) ? b : a,
    );
    for (const p of state.participants) {
      if (p === goose) continue;
      p.x = far.cx;
      p.z = far.cz;
    }
    for (let t = 0; t < GOOSE_MEMORY - 1; t += TICK) step(state, TICK);
    expect(brain.prey).toBe(prey.id);
    for (let t = 0; t < 1.5; t += TICK) step(state, TICK);
    expect(brain.prey).toBeNull();
  });

  it('shows a thought bubble for a while', () => {
    const state = started(42, 'chick');
    applyCommand(state, 2, { type: 'think', thought: 'doubt' });
    expect(state.participants[2]!.thought).toBe('doubt');
    for (let t = 0; t < THOUGHT_TIME + 0.1; t += TICK) step(state, TICK);
    expect(state.participants[2]!.thought).toBeNull();
  });
});
