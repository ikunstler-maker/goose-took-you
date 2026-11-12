import { describe, expect, it } from 'vitest';
import { BUTTON_COOLDOWN, MEETING_RESULT, MEETING_TALK, MEETING_VOTE, PACK_COOLDOWN, TICK } from '../config';
import { meetingTable, SKIP_VOTE, tally } from './meeting';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type Role, type SimEvent, type WorldState } from './world';

function started(seed: number, role: Role): WorldState {
  const state = createWorld(seed, undefined, role);
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

function run(state: WorldState, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += TICK) events.push(...step(state, TICK));
  return events;
}

/** The player walks up to the red button once it has cooled down. */
function atButton(state: WorldState): void {
  state.buttonCooldown = 0;
  const table = meetingTable(state)!;
  me(state).x = table.x + table.radius + 0.5;
  me(state).z = table.z;
  step(state, TICK);
}

describe('tally', () => {
  it('ejects a single leader, keeps everyone on a tie or a skip majority', () => {
    expect(tally([3, 3, 2, SKIP_VOTE, null])).toEqual({ ejected: 3, tie: false });
    expect(tally([3, 3, 2, 2, SKIP_VOTE])).toEqual({ ejected: null, tie: true });
    expect(tally([3, SKIP_VOTE, SKIP_VOTE, null])).toEqual({ ejected: null, tie: false });
    expect(tally([3, 3, SKIP_VOTE, SKIP_VOTE])).toEqual({ ejected: null, tie: true });
    expect(tally([null, null])).toEqual({ ejected: null, tie: false });
  });
});

describe('meetings', () => {
  it('start from the red button once per participant, seating everyone at the table', () => {
    const state = started(42, 'chick');
    expect(state.buttonCooldown).toBe(BUTTON_COOLDOWN);
    atButton(state);
    expect(me(state).prompt).toEqual({ kind: 'button' });
    const events = applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(events).toContainEqual({ type: 'meetingStarted', who: LOCAL_PLAYER, victim: null });
    expect(state.phase).toBe('meeting');
    expect(me(state).buttonUses).toBe(0);
    const table = meetingTable(state)!;
    for (const p of state.participants) expect(Math.hypot(p.x - table.x, p.z - table.z)).toBeLessThan(6);

    // Nobody moves during a meeting.
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 1, z: 0 });
    const { x } = me(state);
    run(state, 1);
    expect(me(state).x).toBe(x);

    run(state, MEETING_TALK + MEETING_VOTE + MEETING_RESULT);
    expect(state.phase).toBe('play');
    expect(state.buttonCooldown).toBeGreaterThan(BUTTON_COOLDOWN - 2);
    atButton(state);
    expect(me(state).prompt).toBeNull();
  });

  it('start from a report and clear the vacation boxes', () => {
    const state = started(42, 'goose');
    const victim = state.participants[3]!;
    me(state).packCooldown = 0;
    me(state).x = victim.x + 0.6;
    me(state).z = victim.z;
    victim.brain = null;
    step(state, TICK);
    applyCommand(state, LOCAL_PLAYER, { type: 'pack' });
    const reporter = state.participants[4]!;
    reporter.brain = null;
    reporter.x = victim.x;
    reporter.z = victim.z + 0.8;
    step(state, TICK);
    const events = applyCommand(state, reporter.id, { type: 'report' });
    expect(events).toContainEqual({ type: 'meetingStarted', who: reporter.id, victim: victim.id });
    expect(state.boxes.some((b) => b.kind === 'vacation')).toBe(false);
  });

  it('let the player vote out the Goose, and the chicks win', () => {
    const state = started(7, 'chick');
    for (const p of state.participants) if (p.id !== LOCAL_PLAYER) p.brain = null;
    atButton(state);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    const goose = state.participants.find((p) => p.role === 'goose')!;
    // No voting while people talk.
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'vote', target: goose.id })).toEqual([]);
    run(state, MEETING_TALK + 0.1);
    expect(state.meeting!.stage).toBe('vote');
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'vote', target: goose.id })).toEqual([{ type: 'voted', who: LOCAL_PLAYER }]);
    // One vote each.
    expect(applyCommand(state, LOCAL_PLAYER, { type: 'vote', target: SKIP_VOTE })).toEqual([]);
    const events = run(state, MEETING_VOTE + MEETING_RESULT + 0.5);
    expect(goose.alive).toBe(false);
    expect(goose.ejected).toBe(true);
    expect(events).toContainEqual({ type: 'gameOver', winner: 'chicks' });
  });

  it('keep everyone when the player skips alone', () => {
    const state = started(7, 'chick');
    for (const p of state.participants) if (p.id !== LOCAL_PLAYER) p.brain = null;
    atButton(state);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    run(state, MEETING_TALK + 0.1);
    applyCommand(state, LOCAL_PLAYER, { type: 'vote', target: SKIP_VOTE });
    run(state, MEETING_VOTE + MEETING_RESULT + 0.5);
    expect(state.phase).toBe('play');
    expect(state.participants.every((p) => p.alive)).toBe(true);
  });

  it('let a bot that saw the pack say so and vote for the Goose', () => {
    const state = started(42, 'goose');
    const victim = state.participants[3]!;
    const witness = state.participants[4]!;
    victim.brain = null;
    me(state).packCooldown = 0;
    me(state).x = victim.x + 0.6;
    me(state).z = victim.z;
    witness.x = victim.x;
    witness.z = victim.z + 1.5;
    step(state, TICK);
    applyCommand(state, LOCAL_PLAYER, { type: 'pack' });
    expect(witness.brain!.suspicion).toMatchObject({ who: LOCAL_PLAYER, level: 2 });

    state.buttonCooldown = 0;
    applyCommand(state, witness.id, { type: 'report' });
    witness.canReport = state.boxes.find((b) => b.kind === 'vacation')!.id;
    applyCommand(state, witness.id, { type: 'report' });
    expect(state.phase).toBe('meeting');
    run(state, MEETING_TALK + MEETING_VOTE);
    const m = state.meeting!;
    expect(m.chat).toContainEqual(expect.objectContaining({ who: witness.id, kind: 'saw', about: LOCAL_PLAYER }));
    expect(m.votes[witness.id]).toBe(LOCAL_PLAYER);
  });

  it('give the Goose a fresh pack cooldown after the meeting', () => {
    const state = started(42, 'goose');
    me(state).packCooldown = 0;
    atButton(state);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    run(state, MEETING_TALK + MEETING_VOTE + MEETING_RESULT + 0.1);
    if (state.phase === 'play') expect(me(state).packCooldown).toBeGreaterThan(PACK_COOLDOWN - 1);
  });
});
