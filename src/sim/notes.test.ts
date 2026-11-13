import { describe, expect, it } from 'vitest';
import { BOT_IDLE_NOTE, BOT_NOTES_MAX, MEETING_TALK, TICK } from '../config';
import { meetingTable } from './meeting';
import { noteSeen } from './notes';
import { applyCommand, createWorld, LOCAL_PLAYER, me, step, type WorldState } from './world';

function started(seed: number): WorldState {
  const state = createWorld(seed, undefined, 'chick');
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

/** Freezes every bot where it stands so sightings are predictable. */
function freezeBots(state: WorldState): void {
  for (const p of state.participants) if (p.brain) p.brain.wait = 1e9;
}

const lines = (state: WorldState) => state.meeting!.plan.filter((p) => p.line).map((p) => p.line!);

describe('bot notes', () => {
  it('remember a task done in plain sight', () => {
    const state = started(42);
    const bot = state.participants.find((p) => p.brain && p.role === 'chick')!;
    noteSeen(state, 'task', me(state));
    expect(bot.brain!.notes[0]).toMatchObject({ kind: 'task', who: LOCAL_PLAYER });
  });

  it('remember someone idling long enough, once', () => {
    const state = started(42);
    freezeBots(state);
    for (let t = 0; t < BOT_IDLE_NOTE + 1; t += TICK) step(state, TICK);
    const watcher = state.participants.find((p) => p.brain && p.role === 'chick')!;
    const notes = watcher.brain!.notes;
    expect(notes.some((n) => n.kind === 'idle')).toBe(true);
    expect(notes.length).toBeLessThanOrEqual(BOT_NOTES_MAX);
    expect(new Set(notes.map((n) => `${n.kind}:${n.who}`)).size).toBe(notes.length);
    expect(notes.some((n) => n.who === watcher.id && n.kind === 'idle')).toBe(false);
  });

  it('turn into meeting lines and are spent there', () => {
    const state = started(42);
    freezeBots(state);
    noteSeen(state, 'task', me(state));
    state.buttonCooldown = 0;
    const table = meetingTable(state)!;
    me(state).x = table.x + table.radius + 0.5;
    me(state).z = table.z;
    step(state, TICK);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    expect(state.phase).toBe('meeting');
    expect(lines(state).some((l) => l.kind === 'sawTask' && l.about === LOCAL_PLAYER)).toBe(true);
    expect(state.participants.every((p) => !p.brain || p.brain.notes.length === 0)).toBe(true);
    expect(MEETING_TALK).toBeGreaterThan(0);
  });

  it('make a witness vouch for an accused chick it saw working', () => {
    const state = started(42);
    freezeBots(state);
    const bots = state.participants.filter((p) => p.brain && p.role === 'chick');
    const [accuser, witness] = bots;
    accuser!.brain!.suspicion = { who: LOCAL_PLAYER, level: 2, room: null, deed: 'pack' };
    witness!.brain!.notes = [{ kind: 'task', who: LOCAL_PLAYER, room: 'motion' }];
    state.buttonCooldown = 0;
    const table = meetingTable(state)!;
    me(state).x = table.x + table.radius + 0.5;
    me(state).z = table.z;
    step(state, TICK);
    applyCommand(state, LOCAL_PLAYER, { type: 'interact' });
    const said = lines(state).find((l) => l.who === witness!.id)!;
    expect(said).toMatchObject({ kind: 'vouch', about: LOCAL_PLAYER, room: 'motion' });
    const vote = state.meeting!.plan.find((p) => p.vote !== null && p.who === witness!.id)!;
    expect(vote.vote).toBe(-1);
  });
});
