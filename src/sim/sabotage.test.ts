import { describe, expect, it } from 'vitest';
import { CALL_TIME, INTERACT_RANGE, OVERHEAT_TIME, SABOTAGE_COOLDOWN, TICK } from '../config';
import { cellCentre, findPath, fitsIn } from './nav';
import { propDistance } from './sabotage';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type Participant, type Role, type SimEvent, type WorldState } from './world';

function started(seed: number, role: Role, bots = false): WorldState {
  const state = createWorld(seed, undefined, role);
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  if (!bots) for (const p of state.participants) p.brain = null;
  return state;
}

function wait(state: WorldState, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += TICK) events.push(...step(state, TICK));
  return events;
}

const seen = (state: WorldState): number => state.visible.reduce((a, b) => a + b, 0);

/** A free nav cell within reach of the prop, or -1. */
function standCell(state: WorldState, point: number): number {
  const prop = state.level.props[point]!;
  for (let cell = 0; cell < state.nav.free.length; cell++) {
    if (state.nav.free[cell] !== 1) continue;
    const c = cellCentre(state.nav, cell);
    if (propDistance(prop, c.x, c.z) <= INTERACT_RANGE - 0.3) return cell;
  }
  return -1;
}

/** Puts a participant next to a fix point and lets the sim notice. */
function standAt(state: WorldState, p: Participant, point: number): void {
  const c = cellCentre(state.nav, standCell(state, point));
  p.x = c.x;
  p.z = c.z;
  step(state, TICK);
}

/** Player Goose with the cooldown over; bots frozen. */
function ready(seed: number): WorldState {
  const state = started(seed, 'goose');
  wait(state, SABOTAGE_COOLDOWN + 0.1);
  return state;
}

const sabotage = (state: WorldState, kind: 'overheat' | 'call', who = LOCAL_PLAYER): SimEvent[] =>
  applyCommand(state, who, { type: 'sabotage', kind });

describe('sabotage fix points', () => {
  it('exist in every office and can be walked to', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createWorld(seed);
      expect(state.fixPoints.overheat.length, `seed ${seed}`).toBe(2);
      expect(state.fixPoints.call.length, `seed ${seed}`).toBe(1);
      const fits = fitsIn(state.level, state.buckets);
      for (const point of [...state.fixPoints.overheat, ...state.fixPoints.call]) {
        const cell = standCell(state, point);
        expect(cell, `seed ${seed} point ${point}`).toBeGreaterThanOrEqual(0);
        expect(findPath(state.nav, fits, state.level.spawn.x, state.level.spawn.z, cell), `seed ${seed} point ${point}`).not.toBeNull();
      }
    }
  });
});

describe('sabotages', () => {
  it('only the Goose starts one, after the cooldown, one at a time', () => {
    const state = started(7, 'goose');
    expect(sabotage(state, 'overheat')).toEqual([]);
    wait(state, SABOTAGE_COOLDOWN + 0.1);
    expect(sabotage(state, 'overheat', 1)).toEqual([]);
    expect(sabotage(state, 'overheat')).toEqual([{ type: 'sabotageStarted', who: LOCAL_PLAYER, kind: 'overheat' }]);
    expect(sabotage(state, 'call')).toEqual([]);
    expect(state.sabotage?.kind).toBe('overheat');
  });

  it('overheat narrows the sight until both fan points are restarted', () => {
    const state = ready(7);
    const before = seen(state);
    sabotage(state, 'overheat');
    expect(seen(state)).toBeLessThan(before);
    const [a, b] = state.fixPoints.overheat as [number, number];
    const chick = state.participants[1]!;
    standAt(state, chick, a);
    expect(chick.prompt).toEqual({ kind: 'fix', point: a });
    applyCommand(state, chick.id, { type: 'interact' });
    step(state, TICK);
    expect(chick.prompt).not.toEqual({ kind: 'fix', point: a });
    expect(state.sabotage).not.toBeNull();
    standAt(state, chick, b);
    const events = applyCommand(state, chick.id, { type: 'interact' });
    expect(events).toContainEqual({ type: 'sabotageEnded', kind: 'overheat', fixed: true });
    expect(state.sabotage).toBeNull();
    expect(state.sabotageCooldown).toBe(SABOTAGE_COOLDOWN);
    expect(seen(state)).toBe(before);
  });

  it('the call needs two different signatures', () => {
    const state = ready(11);
    sabotage(state, 'call');
    const tablet = state.fixPoints.call[0]!;
    const first = state.participants[1]!;
    const second = state.participants[2]!;
    standAt(state, first, tablet);
    applyCommand(state, first.id, { type: 'interact' });
    step(state, TICK);
    expect(first.prompt?.kind).not.toBe('fix');
    expect(state.sabotage?.done).toEqual([first.id]);
    standAt(state, second, tablet);
    expect(second.prompt).toEqual({ kind: 'fix', point: tablet });
    applyCommand(state, second.id, { type: 'interact' });
    expect(state.sabotage).toBeNull();
    expect(state.phase).toBe('play');
  });

  it('wins the match for the Goose when the time runs out', () => {
    for (const [kind, time] of [['overheat', OVERHEAT_TIME], ['call', CALL_TIME]] as const) {
      const state = ready(5);
      sabotage(state, kind);
      wait(state, time - 1);
      expect(state.phase).toBe('play');
      const events = wait(state, 1.2);
      expect(events).toContainEqual({ type: 'gameOver', winner: 'goose' });
      expect(state.lostTo).toBe(kind);
    }
  });

  it('blocks the red button, and a report cuts the sabotage short', () => {
    const state = ready(9);
    const chick = state.participants[1]!;
    const table = state.level.props.find((p) => p.kind === 'meetingTable')!;
    chick.x = table.x;
    chick.z = table.z + table.d / 2 + 0.8;
    step(state, TICK);
    expect(chick.prompt).toEqual({ kind: 'button' });
    sabotage(state, 'overheat');
    step(state, TICK);
    expect(chick.prompt).toBeNull();
    // The Goose packs someone next to it; a third chick reports the box.
    const victim = state.participants[2]!;
    const goose = me(state);
    goose.packCooldown = 0;
    victim.x = goose.x + 0.5;
    victim.z = goose.z;
    step(state, TICK);
    applyCommand(state, LOCAL_PLAYER, { type: 'pack' });
    const witness = state.participants[3]!;
    witness.x = goose.x;
    witness.z = goose.z;
    step(state, TICK);
    const events = applyCommand(state, witness.id, { type: 'report' });
    expect(events).toContainEqual({ type: 'sabotageEnded', kind: 'overheat', fixed: false });
    expect(state.phase).toBe('meeting');
    expect(state.sabotage).toBeNull();
  });
});

describe('bots and sabotages', () => {
  it('bot chicks fix most sabotages by themselves', () => {
    let fixed = 0;
    let runs = 0;
    for (let seed = 1; seed <= 6; seed++) {
      for (const kind of ['overheat', 'call'] as const) {
        const state = started(seed, 'goose', true);
        wait(state, SABOTAGE_COOLDOWN + 0.1);
        if (state.phase !== 'play') continue;
        runs++;
        sabotage(state, kind);
        const events = wait(state, Math.max(OVERHEAT_TIME, CALL_TIME) + 1);
        if (events.some((e) => e.type === 'sabotageEnded' && e.fixed)) fixed++;
      }
    }
    expect(runs).toBeGreaterThanOrEqual(10);
    expect(fixed / runs).toBeGreaterThanOrEqual(0.5);
  });

  it('the bot Goose starts sabotages', () => {
    let startedCount = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const state = started(seed, 'chick', true);
      const events = wait(state, 150);
      if (events.some((e) => e.type === 'sabotageStarted')) startedCount++;
    }
    expect(startedCount).toBeGreaterThanOrEqual(3);
  });
});
