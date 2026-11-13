import { describe, expect, it } from 'vitest';
import { BOT_WARY_TIME, MEETING_TALK, TICK } from '../config';
import { meetingTable } from './meeting';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type WorldState } from './world';

/** The player is the Goose; every other seat is a bot chick. */
function gooseMatch(seed: number): WorldState {
  const state = createWorld(seed, undefined, 'goose');
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

/** Forces the next neck stretch right now. */
function stretch(state: WorldState): void {
  const goose = me(state);
  goose.tell = 0;
  goose.tellIn = TICK / 2;
  step(state, TICK);
}

describe('bots and the neck', () => {
  it('notice a stretch now and then when close and looking, never from afar', () => {
    const state = gooseMatch(7);
    const near = state.participants[3]!;
    const far = state.participants[4]!;
    const goose = me(state);
    let first = 0;
    for (let i = 1; i <= 60; i++) {
      // Hold the two bots in place: one beside the Goose, one across the office.
      near.brain!.wait = 5;
      far.brain!.wait = 5;
      near.x = goose.x + 1.5;
      near.z = goose.z;
      far.x = goose.x > 60 ? 8.5 : state.level.size - 8.5;
      far.z = goose.z;
      stretch(state);
      const s = near.brain!.suspicion;
      if (s && !first) first = i;
      if (s && (s.times ?? 0) >= 2) break;
    }
    // Not at the first glance every time, but well within a few stretches.
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(20);
    expect(near.brain!.suspicion).toMatchObject({ who: LOCAL_PLAYER, deed: 'tell', level: 1 });
    expect(near.brain!.suspicion!.times).toBeGreaterThanOrEqual(2);
    expect(far.brain!.suspicion).toBeNull();
  });

  it('do not notice a Goose under a rug', () => {
    const state = gooseMatch(7);
    const near = state.participants[3]!;
    const goose = me(state);
    goose.under = 0;
    for (let i = 0; i < 40; i++) {
      near.brain!.wait = 5;
      near.x = goose.x + 1.5;
      near.z = goose.z;
      stretch(state);
    }
    expect(state.participants.every((p) => !p.brain?.suspicion)).toBe(true);
  });

  it('bring the neck up at the meeting', () => {
    const state = gooseMatch(7);
    const bot = state.participants[3]!;
    bot.brain!.suspicion = { who: LOCAL_PLAYER, level: 1, room: 'lobby', deed: 'tell', times: 2 };
    state.buttonCooldown = 0;
    const table = meetingTable(state)!;
    me(state).x = table.x + table.radius + 0.5;
    me(state).z = table.z;
    step(state, TICK);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(state.phase).toBe('meeting');
    for (let t = 0; t < MEETING_TALK; t += TICK) step(state, TICK);
    expect(state.meeting!.chat).toContainEqual({ who: bot.id, kind: 'neck', about: LOCAL_PLAYER, room: 'lobby' });
  });

  it('walk off to the others when left alone with their suspect', () => {
    const state = gooseMatch(7);
    const goose = me(state);
    const bot = state.participants[3]!;
    for (let t = 0; t < 14; t += TICK) step(state, TICK);
    // Everyone has scattered; put the Goose next to the bot, with nobody else around.
    const others = state.participants.filter((p) => p !== bot && p !== goose);
    expect(others.every((o) => Math.hypot(o.x - bot.x, o.z - bot.z) > 0)).toBe(true);
    bot.brain!.suspicion = { who: LOCAL_PLAYER, level: 1, room: null, deed: 'tell', times: 1 };
    let fled = false;
    for (let t = 0; t < 40 && !fled; t += TICK) {
      // The Goose shadows the bot from two metres, always in its sight.
      goose.x = bot.x;
      goose.z = bot.z;
      step(state, TICK);
      if (bot.brain!.wary > 0) fled = true;
    }
    expect(fled).toBe(true);
    expect(bot.brain!.wary).toBeLessThanOrEqual(BOT_WARY_TIME);
    step(state, TICK);
    expect(bot.brain!.goal).toMatchObject({ kind: 'flee' });
    expect(bot.brain!.goal).not.toMatchObject({ to: LOCAL_PLAYER });
    // A bot without a suspect stays calm in the same spot.
    const calm = state.participants[5]!;
    calm.brain!.suspicion = null;
    for (let t = 0; t < 10; t += TICK) {
      // No stretch meanwhile: nothing to notice.
      goose.tellIn = 100;
      goose.x = calm.x;
      goose.z = calm.z;
      step(state, TICK);
    }
    expect(calm.brain!.wary).toBe(0);
  });
});
