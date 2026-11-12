import { describe, expect, it } from 'vitest';
import { ACCESSORIES, CHICK_COLORS, PARTICIPANTS, PLAYER_RADIUS, TICK } from '../config';
import { blocked } from './level';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step } from './world';

describe('participants', () => {
  it('seats the player and 7 bots at free spots around the spawn, each in its own colour', () => {
    for (const seed of [1, 9, 42]) {
      const state = createWorld(seed, { color: 3, accessory: 2 });
      expect(state.participants).toHaveLength(PARTICIPANTS);
      expect(state.participants.filter((p) => p.isBot)).toHaveLength(PARTICIPANTS - 1);
      expect(me(state).isBot).toBe(false);
      expect(me(state).color).toBe(3);
      expect(me(state).accessory).toBe(2);
      expect(new Set(state.participants.map((p) => p.color)).size).toBe(PARTICIPANTS);
      for (const p of state.participants) {
        expect(blocked(state.level, state.buckets, p.x, p.z, PLAYER_RADIUS)).toBe(false);
        expect(p.accessory).toBeGreaterThanOrEqual(0);
        expect(p.accessory).toBeLessThan(ACCESSORIES.length);
      }
    }
  });

  it('lets the player change look only in the lobby; bots give up the taken colour', () => {
    const state = createWorld(5);
    const holder = state.participants.find((p) => p.color === 6)!;
    applyCommand(state, LOCAL_PLAYER, { type: 'setLook', color: 6, accessory: 4 });
    expect(me(state).color).toBe(6);
    expect(holder.color).not.toBe(6);
    expect(new Set(state.participants.map((p) => p.color)).size).toBe(PARTICIPANTS);
    expect(applyCommand(state, 3, { type: 'setLook', color: 0, accessory: 0 })).toEqual([]);
    applyCommand(state, LOCAL_PLAYER, { type: 'setLook', color: 99, accessory: -1 });
    expect(me(state).color).toBeLessThan(CHICK_COLORS.length);

    applyCommand(state, LOCAL_PLAYER, { type: 'start' });
    expect(state.phase).toBe('play');
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'setLook', color: 1, accessory: 1 })).toEqual([]);
  });

  it('holds everyone still in the lobby and moves any participant by command in play', () => {
    const state = createWorld(7);
    const bot = state.participants[2]!;
    // Drive this one by hand: no brain overriding the command.
    bot.brain = null;
    const { x, z } = bot;
    applyCommand(state, bot.id, { type: 'move', x: 1, z: 0 });
    for (let i = 0; i < 20; i++) step(state, TICK);
    expect(bot.x).toBe(x);
    applyCommand(state, LOCAL_PLAYER, { type: 'start' });
    for (let i = 0; i < 20; i++) step(state, TICK);
    expect(Math.hypot(bot.x - x, bot.z - z)).toBeGreaterThan(0);
  });
});
