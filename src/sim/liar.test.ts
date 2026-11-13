import { describe, expect, it } from 'vitest';
import { MEETING_TALK, MEETING_VOTE, SABOTAGE_FIRST, TICK } from '../config';
import { meetingTable } from './meeting';
import { propDistance } from './sabotage';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type SimEvent, type WorldState } from './world';

/** The player is a chick; the Goose is one of the bots. */
function chickMatch(seed: number): WorldState {
  const state = createWorld(seed, undefined, 'chick');
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

describe('the bot Goose', () => {
  it('often stands at a fix point during its own sabotage and never fixes anything', () => {
    let lurked = 0;
    let reached = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const state = chickMatch(seed);
      const goose = state.participants.find((p) => p.role === 'goose')!;
      // Chicks stay put, so the sabotage runs its full course and nobody is packed or reported.
      for (const p of state.participants) if (p !== goose) p.brain = null;
      goose.packCooldown = 9999;
      const events: SimEvent[] = [];
      let closest = Infinity;
      for (let t = 0; t < SABOTAGE_FIRST + 110 && state.phase === 'play'; t += TICK) {
        goose.packCooldown = 9999;
        events.push(...step(state, TICK));
        const point = goose.brain!.lurk;
        if (state.sabotage && point !== null) closest = Math.min(closest, propDistance(state.level.props[point]!, goose.x, goose.z));
      }
      expect(events.some((e) => e.type === 'sabotageStarted' && e.who === goose.id), `seed ${seed}`).toBe(true);
      expect(events.some((e) => e.type === 'sabotageFixed' && e.who === goose.id)).toBe(false);
      if (closest < Infinity) lurked++;
      if (closest < 2) reached++;
    }
    expect(lurked).toBeGreaterThanOrEqual(2);
    expect(reached).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it('makes things up at meetings: frames a chick or boasts of honest work', () => {
    const kinds = new Set<string>();
    let followers = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const state = chickMatch(seed);
      const goose = state.participants.find((p) => p.role === 'goose')!;
      state.buttonCooldown = 0;
      const table = meetingTable(state)!;
      me(state).x = table.x + table.radius + 0.5;
      me(state).z = table.z;
      step(state, TICK);
      applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
      expect(state.phase).toBe('meeting');
      for (let t = 0; t < MEETING_TALK + MEETING_VOTE - 0.5; t += TICK) step(state, TICK);
      const m = state.meeting!;
      const line = m.chat.find((l) => l.who === goose.id)!;
      kinds.add(line.kind);
      if (line.kind === 'idle' || line.kind === 'sus') {
        // The Goose votes for whoever it framed, and now and then a bot believes it.
        expect(m.votes[goose.id]).toBe(line.about);
        followers += m.votes.filter((v, id) => v === line.about && id !== goose.id).length;
      }
    }
    expect(kinds.has('idle') || kinds.has('sus')).toBe(true);
    expect(kinds.has('iFixed') || kinds.has('sawTask')).toBe(true);
    expect(kinds.has('where')).toBe(true);
    expect(followers).toBeGreaterThan(0);
  }, 120_000);
});
