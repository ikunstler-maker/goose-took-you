import { describe, expect, it } from 'vitest';
import {
  DUCT_COOLDOWN,
  DUCT_TIME,
  PROFESSIONS_PER_MATCH,
  SIREN_TIME,
  SKILL_FIRST_COOLDOWN,
  TABLET_FRESH,
  TABLET_RECENT,
  TABLET_TIME,
  TAG_COOLDOWN,
  TAG_RANGE,
  TAG_TIME,
  TICK,
} from '../config';
import { createBrain } from './bots';
import { tabletStatus, type Profession } from './professions';
import { createRng } from './rng';
import { viewFor } from './view';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type Participant, type SimEvent, type WorldState } from './world';

function started(seed: number, job: Profession | null, role: 'chick' | 'goose' = 'chick'): WorldState {
  const state = createWorld(seed, undefined, role, job);
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

function wait(state: WorldState, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += TICK) events.push(...step(state, TICK));
  return events;
}

/** Bots stand still; skill timers are spent. */
function frozen(state: WorldState): WorldState {
  for (const p of state.participants) {
    if (p.id !== LOCAL_PLAYER) p.brain = null;
    p.skillCooldown = 0;
  }
  return state;
}

const place = (p: Participant, x: number, z: number): void => {
  p.x = x;
  p.z = z;
};

const goose = (state: WorldState): Participant => state.participants.find((p) => p.role === 'goose')!;
const other = (state: WorldState): Participant => state.participants.find((p) => p.id !== LOCAL_PLAYER && p.role === 'chick')!;

describe('dealing professions', () => {
  it('gives PROFESSIONS_PER_MATCH chicks one each, all different, the same for a seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = started(seed, null);
      const jobs = state.participants.filter((p) => p.profession !== null);
      expect(jobs.length).toBe(PROFESSIONS_PER_MATCH);
      expect(new Set(jobs.map((p) => p.profession)).size).toBe(PROFESSIONS_PER_MATCH);
      expect(jobs.every((p) => p.role === 'chick')).toBe(true);
      expect(started(seed, null).participants.map((p) => p.profession)).toEqual(state.participants.map((p) => p.profession));
      expect(state.participants.every((p) => p.skillCooldown === SKILL_FIRST_COOLDOWN)).toBe(true);
    }
  });

  it('honours the testing switch, and never gives the Goose one', () => {
    for (const job of ['analyst', 'lead', 'sysadmin', 'streamer'] as const) expect(me(started(5, job)).profession).toBe(job);
    expect(me(started(5, 'analyst', 'goose')).profession).toBeNull();
  });

  it('keeps the rest of the match as it was: same Goose for the same seed', () => {
    expect(goose(started(9, null)).id).toBe(goose(started(9, 'lead')).id);
  });

  it('shows a seat only its own profession until the match is over', () => {
    const state = started(3, 'lead');
    const view = viewFor(state, LOCAL_PLAYER);
    expect(view.self.profession).toBe('lead');
    expect(view.seats.filter((s) => s.id !== LOCAL_PLAYER).every((s) => s.profession === null)).toBe(true);
    state.phase = 'over';
    expect(viewFor(state, LOCAL_PLAYER).seats.filter((s) => s.profession !== null).length).toBe(PROFESSIONS_PER_MATCH);
  });
});

describe('Tracker Analyst', () => {
  it('tags whoever stands close, keeps a trail for TAG_TIME, then cools down', () => {
    const state = frozen(started(11, 'analyst'));
    const self = me(state);
    const target = other(state);
    // Everyone else steps well away from the spawn.
    for (const p of state.participants) if (p !== self) place(p, state.level.spawn.x + 30, state.level.spawn.z + 30);
    place(target, self.x + TAG_RANGE + 1, self.z);
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'skill' })).toEqual([]);
    place(target, self.x + TAG_RANGE - 0.3, self.z);
    const events = applyCommand(state, LOCAL_PLAYER, { type: 'skill' });
    expect(events).toEqual([{ type: 'tagged', who: LOCAL_PLAYER, target: target.id }]);
    expect(self.skillCooldown).toBe(TAG_COOLDOWN);
    // Only the Analyst hears of it.
    expect(viewFor(state, target.id).self.tag).toBeNull();
    target.brain = null;
    wait(state, 3);
    expect(self.tag!.trail.length).toBeGreaterThan(4);
    wait(state, TAG_TIME);
    expect(self.tag).toBeNull();
    expect(self.skillCooldown).toBeGreaterThan(0);
  });

  it('turns a pack by the tagged one into an eyewitness-grade suspicion for a bot Analyst', () => {
    const state = frozen(started(12, null));
    const analyst = state.participants.find((p) => p.profession === 'analyst' && p.isBot);
    if (!analyst) throw new Error('seed 12 has no bot Analyst');
    analyst.brain = createBrain(createRng(1));
    const g = goose(state);
    const victim = state.participants.find((p) => p.role === 'chick' && p !== analyst && p.id !== LOCAL_PLAYER)!;
    analyst.tag = { target: g.id, left: TAG_TIME, every: 1, trail: [g.x, g.z] };
    place(victim, g.x + 0.5, g.z);
    // Far away: it could not have seen the pack itself.
    place(analyst, g.x + 40, g.z + 40);
    step(state, TICK);
    g.packCooldown = 0;
    applyCommand(state, g.id, { type: 'pack' });
    expect(analyst.brain!.suspicion).toMatchObject({ who: g.id, level: 2, deed: 'pixel' });
  });
});

describe('Motion Team Lead', () => {
  it('opens the tablet once per charge; a finished task recharges it', () => {
    const state = frozen(started(13, 'lead'));
    const self = me(state);
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'skill' })).toEqual([{ type: 'tabletOpened', who: LOCAL_PLAYER }]);
    expect(self.tablet).toBe(TABLET_TIME);
    expect(viewFor(state, LOCAL_PLAYER).self.outAt).not.toBeNull();
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'skill' })).toEqual([]);
    wait(state, TABLET_TIME + 0.1);
    expect(self.tablet).toBe(0);
    expect(viewFor(state, LOCAL_PLAYER).self.outAt).toBeNull();
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'skill' })).toEqual([]);
    // Any task done charges it again.
    const task = state.tasks.find((t) => t.owner === LOCAL_PLAYER && t.kind !== 'cargo' && t.kind !== 'news')!;
    self.activeTask = task.id;
    applyCommand(state, LOCAL_PLAYER, { type: 'finishTask' });
    expect(self.charged).toBe(true);
  });

  it('tells fresh, recent and old holidays apart, and the fired', () => {
    const p = { alive: false, ejected: false, outAt: 0 } as Participant;
    const at = (seconds: number): string => tabletStatus(p, Math.round(seconds / TICK), TICK, TABLET_FRESH, TABLET_RECENT);
    expect(at(TABLET_FRESH - 1)).toBe('fresh');
    expect(at(TABLET_FRESH + 1)).toBe('recent');
    expect(at(TABLET_RECENT + 1)).toBe('long');
    expect(tabletStatus({ ...p, ejected: true }, 0, TICK, TABLET_FRESH, TABLET_RECENT)).toBe('fired');
    expect(tabletStatus({ ...p, alive: true }, 0, TICK, TABLET_FRESH, TABLET_RECENT)).toBe('working');
  });
});

describe('SysAdmin', () => {
  it('may dive under a rug like the Goose, sneezes out after DUCT_TIME and then waits', () => {
    const state = frozen(started(14, 'sysadmin'));
    const self = me(state);
    const rug = state.carpets[0]!;
    place(self, rug.x, rug.z);
    step(state, TICK);
    expect(self.prompt).toEqual({ kind: 'carpet', carpet: rug.id });
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(self.under).toBe(rug.id);
    const events = wait(state, DUCT_TIME + 0.2);
    expect(self.under).toBeNull();
    expect(events.some((e) => e.type === 'sneezed' && e.who === LOCAL_PLAYER)).toBe(true);
    expect(self.skillCooldown).toBeGreaterThan(DUCT_COOLDOWN - 1);
    step(state, TICK);
    expect(self.prompt?.kind).not.toBe('carpet');
  });

  it('is the only chick who gets the rug prompt', () => {
    const state = frozen(started(14, 'lead'));
    const rug = state.carpets[0]!;
    place(me(state), rug.x, rug.z);
    step(state, TICK);
    expect(me(state).prompt?.kind).not.toBe('carpet');
  });
});

describe('Casino Streamer', () => {
  it('sets off the siren with the box position for SIREN_TIME when packed', () => {
    const state = frozen(started(15, 'streamer'));
    const g = goose(state);
    place(me(state), g.x + 0.5, g.z);
    step(state, TICK);
    g.packCooldown = 0;
    const events = applyCommand(state, g.id, { type: 'pack' });
    const siren = events.find((e) => e.type === 'siren');
    expect(siren).toMatchObject({ type: 'siren', victim: LOCAL_PLAYER });
    expect(state.siren).not.toBeNull();
    // Everyone's snapshot carries it.
    expect(viewFor(state, g.id).siren).not.toBeNull();
    wait(state, SIREN_TIME + 0.1);
    expect(state.siren).toBeNull();
  });

  it('a plain chick packed makes no siren', () => {
    const state = frozen(started(15, 'lead'));
    const g = goose(state);
    const victim = state.participants.find((p) => p.role === 'chick' && p.profession === null)!;
    place(victim, g.x + 0.5, g.z);
    step(state, TICK);
    g.packCooldown = 0;
    expect(applyCommand(state, g.id, { type: 'pack' }).some((e) => e.type === 'siren')).toBe(false);
  });
});

describe('SysAdmin at meetings', () => {
  it('a bot SysAdmin calls out a false «I am the SysAdmin»', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = started(seed, null);
      if (me(state).profession === 'sysadmin') continue;
      const admin = state.participants.find((p) => p.profession === 'sysadmin');
      if (!admin) continue;
      const table = state.level.props.find((p) => p.kind === 'meetingTable')!;
      place(me(state), table.x + 1.5, table.z);
      me(state).buttonUses = 1;
      state.buttonCooldown = 0;
      step(state, TICK);
      if (me(state).prompt?.kind !== 'button') continue;
      applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
      applyCommand(state, LOCAL_PLAYER, { type: 'say', kind: 'sysadmin', about: null, room: null });
      wait(state, 4);
      expect(state.meeting!.chat.some((l) => l.kind === 'sysadminLie' && l.who === admin.id && l.about === LOCAL_PLAYER)).toBe(true);
      return;
    }
    throw new Error('no seed with a bot SysAdmin');
  });
});
