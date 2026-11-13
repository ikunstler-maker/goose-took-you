import {
  BOT_FOLLOW_CHANCE,
  BOT_HUNCH_CHANCE,
  BOT_IDLE_VOTE_CHANCE,
  BOT_RANDOM_VOTE,
  BOX_SUSPECT_RANGE,
  MEETING_RESULT,
  MEETING_SEAT_RADIUS,
  MEETING_TALK,
  MEETING_TALK_PEOPLE,
  MEETING_VOTE,
  MEETING_VOTE_PEOPLE,
  PLAYER_HINTS_MAX,
  PLAYER_HINTS_MET,
  PLAYER_SAY_COOLDOWN,
  PLAYER_SAY_MAX,
  PLAYER_SWAY_SAW,
  PLAYER_SWAY_SUS,
  PLAYER_SWAY_VOUCH,
} from '../config';
import { fitsIn } from './nav';
import { remember, type Note, type SeenKind } from './notes';
import type { RoomType } from './prefabs';
import { createRng, type Rng } from './rng';
import { canSee } from './vision';
import { endSabotage, sightRadius } from './sabotage';
import type { Participant, SimEvent, WorldState } from './world';

/** A vote for nobody. */
export const SKIP_VOTE = -1;

export type MeetingStage = 'talk' | 'vote' | 'result';

/** What a bot can say; the UI turns it into text via `chat.<kind>`. */
export type ChatKind =
  | 'found'
  | 'button'
  | 'saw'
  | 'sawCarpet'
  | 'sus'
  | 'where'
  | 'with'
  | 'agree'
  | 'defend'
  | 'nothing'
  /** From bot notes: someone idled in plain sight, did a task, fixed a sabotage; the bot itself fixed one; vouching for the accused. */
  | 'idle'
  | 'sawTask'
  | 'sawFix'
  | 'iFixed'
  | 'vouch'
  /** Quick reports only a human makes: met someone somewhere, a plain suspicion, a plain word for someone. */
  | 'sawIn'
  | 'suspect'
  | 'trust';

/** What each line needs filled in. Lines about someone never point at the speaker. */
export const CHAT_NEEDS: Record<ChatKind, { about: boolean; room: boolean }> = {
  found: { about: true, room: true },
  button: { about: false, room: false },
  saw: { about: true, room: true },
  sawCarpet: { about: true, room: true },
  sus: { about: true, room: true },
  where: { about: false, room: true },
  with: { about: true, room: false },
  agree: { about: true, room: false },
  defend: { about: false, room: true },
  nothing: { about: false, room: false },
  idle: { about: true, room: true },
  sawTask: { about: true, room: true },
  sawFix: { about: true, room: true },
  iFixed: { about: false, room: true },
  vouch: { about: true, room: true },
  sawIn: { about: true, room: true },
  suspect: { about: true, room: false },
  trust: { about: true, room: false },
};

/** Lines a human may send; the opening lines are added by the meeting itself. */
const SAYABLE: ReadonlySet<ChatKind> = new Set<ChatKind>([
  'saw', 'sawCarpet', 'sus', 'where', 'with', 'agree', 'defend', 'nothing',
  'idle', 'sawTask', 'sawFix', 'iFixed', 'vouch', 'sawIn', 'suspect', 'trust',
]);
/** Claims that pull bot votes towards the named participant, hard and soft; and away from it. */
const HARD_CLAIMS: ReadonlySet<ChatKind> = new Set<ChatKind>(['saw', 'sawCarpet']);
const SOFT_CLAIMS: ReadonlySet<ChatKind> = new Set<ChatKind>(['sus', 'suspect', 'idle']);
const VOUCHES: ReadonlySet<ChatKind> = new Set<ChatKind>(['trust', 'vouch', 'sawTask', 'sawFix', 'with']);

/** How a human's sighting reads as a chat line. */
const SEEN_LINE: Record<SeenKind, ChatKind> = {
  pack: 'saw',
  carpet: 'sawCarpet',
  idle: 'idle',
  fixed: 'sawFix',
  task: 'sawTask',
  met: 'sawIn',
};

export interface ChatLine {
  who: number;
  kind: ChatKind;
  /** Participant the line is about, if any. */
  about: number | null;
  /** Room the line mentions, if any. */
  room: RoomType | null;
}

/** A line or a vote waiting for its moment, seconds since the meeting started. */
interface Planned {
  at: number;
  line: ChatLine | null;
  vote: number | null;
  who: number;
  /** The vote rests on what the bot saw itself: nobody talks it out of it. */
  firm: boolean;
}

export interface Meeting {
  caller: number;
  /** The packed chick whose box was reported; null for the red button. */
  victim: number | null;
  stage: MeetingStage;
  /** Seconds since the meeting started, and left in the current stage. */
  elapsed: number;
  timeLeft: number;
  chat: ChatLine[];
  /** Per participant: who they voted for, SKIP_VOTE, or null (not yet / cannot). */
  votes: (number | null)[];
  /** Bot lines and votes still to come, sorted by time. */
  plan: Planned[];
  /** Set on the result card: who flies out of the office, or null (skip or tie). */
  ejected: number | null;
  tie: boolean;
  /** Per participant: the room it was in when the meeting was called. */
  rooms: (RoomType | null)[];
  /** Per participant: ready-made true lines from what a human saw; empty for bots. */
  hints: ChatLine[][];
  /** Per participant: lines said, and when the last one was (`elapsed`). */
  said: number[];
  saidAt: number[];
  /** Per participant: its word has already moved the bots once this meeting. */
  swayed: boolean[];
}

/** What a bot chick knows about who did it: 2 = saw it happen, 1 = saw someone near a box. */
export interface Suspicion {
  who: number;
  level: number;
  room: RoomType | null;
  /** What was seen: a pack, or the Goose diving under / climbing out of a rug. */
  deed: 'pack' | 'carpet' | 'box';
}

const roomType = (state: WorldState, roomId: number | null): RoomType | null =>
  roomId === null ? null : state.level.rooms[roomId]!.type;

/** Every bot chick that sees the Goose pack someone (or use a rug) remembers it for sure. */
export function noteDeed(state: WorldState, goose: Participant, victim: Participant | null, deed: 'pack' | 'carpet'): void {
  for (const p of state.participants) {
    if (p === goose || p === victim || !p.alive || p.role !== 'chick') continue;
    if (!canSee(state.level, p.x, p.z, goose.x, goose.z, sightRadius(state))) continue;
    if (!p.brain) {
      remember(p, deed, goose.id, roomType(state, goose.roomId));
      continue;
    }
    // A pack outweighs a rug sighting; never downgrade.
    if (p.brain.suspicion?.level === 2 && p.brain.suspicion.deed === 'pack' && deed === 'carpet') continue;
    p.brain.suspicion = { who: goose.id, level: 2, room: roomType(state, goose.roomId), deed };
  }
}

/** A bot chick spots a fresh vacation box: whoever stands near it looks suspicious. */
export function noteBox(state: WorldState, bot: Participant, boxX: number, boxZ: number): void {
  if (!bot.brain || (bot.brain.suspicion && bot.brain.suspicion.level >= 1)) return;
  for (const o of state.participants) {
    if (o === bot || !o.alive || o.under !== null || Math.hypot(o.x - boxX, o.z - boxZ) > BOX_SUSPECT_RANGE) continue;
    if (!canSee(state.level, bot.x, bot.z, o.x, o.z, sightRadius(state))) continue;
    bot.brain.suspicion = { who: o.id, level: 1, room: roomType(state, o.roomId), deed: 'box' };
    return;
  }
}

/** The meeting table: centre of the hub prop of the meeting room. */
export function meetingTable(state: WorldState): { x: number; z: number; radius: number } | null {
  const prop = state.level.props.find((p) => p.kind === 'meetingTable');
  return prop ? { x: prop.x, z: prop.z, radius: Math.max(prop.w, prop.d) / 2 } : null;
}

/** Everyone alive sits around the table, the caller first. */
function seat(state: WorldState): void {
  const table = meetingTable(state);
  const alive = state.participants.filter((p) => p.alive);
  const fits = fitsIn(state.level, state.buckets);
  const centre = table ?? state.level.spawn;
  alive.forEach((p, i) => {
    const angle = (i / alive.length) * Math.PI * 2;
    for (let r = table ? MEETING_SEAT_RADIUS : 1; r < MEETING_SEAT_RADIUS + 3; r += 0.3) {
      const x = centre.x + Math.sin(angle) * r;
      const z = centre.z + Math.cos(angle) * r;
      if (fits(x, z)) {
        p.x = x;
        p.z = z;
        // Face the table.
        p.facing = Math.atan2(centre.x - x, centre.z - z);
        return;
      }
    }
  });
}

/** Opens a meeting: the office freezes, boxes go away, everyone takes a seat. */
export function startMeeting(state: WorldState, caller: Participant, victim: number | null): SimEvent[] {
  // A meeting cuts the sabotage short; the Goose may start a new one afterwards.
  const events: SimEvent[] = endSabotage(state, false);
  const rng = createRng(((state.level.seed * 6151 + state.tick * 31 + caller.id) >>> 0) || 1);
  // Where everyone was before the teleport: alibis are built from it.
  const roomsBefore = state.participants.map((p) => roomType(state, p.roomId));
  const buddies = state.participants.map((p) => buddyOf(state, p));

  // A meeting cuts a button rush short: that edit is simply redone later.
  for (const task of state.tasks) task.rush = 0;
  for (const p of state.participants) {
    if (p.activeTask !== null) {
      events.push({ type: 'taskClosed', who: p.id, taskId: p.activeTask, done: false });
      p.activeTask = null;
    }
    if (p.watching) {
      p.watching = false;
      events.push({ type: 'camerasClosed', who: p.id });
    }
    p.moveX = 0;
    p.moveZ = 0;
    p.moving = false;
    p.thought = null;
    p.under = null;
    if (p.brain) {
      p.brain.goal = null;
      p.brain.path = [];
      p.brain.wait = 0;
      p.brain.work = 0;
      p.brain.fake = 0;
      p.brain.prey = null;
      p.brain.escape = null;
    }
  }
  // Vacation boxes are taken away; whatever someone carried stays in their wings.
  state.boxes = state.boxes.filter((b) => b.kind !== 'vacation');
  seat(state);

  state.phase = 'meeting';
  state.meeting = {
    caller: caller.id,
    victim,
    stage: 'talk',
    elapsed: 0,
    timeLeft: talkTime(state),
    chat: [],
    votes: state.participants.map(() => null),
    plan: planBots(state, caller, victim, roomsBefore, buddies, rng),
    ejected: null,
    tie: false,
    rooms: roomsBefore,
    hints: state.participants.map((p) => hintsFor(state, p, roomsBefore[p.id] ?? null)),
    said: state.participants.map(() => 0),
    saidAt: state.participants.map(() => -PLAYER_SAY_COOLDOWN),
    swayed: state.participants.map(() => false),
  };
  // A human caller opens too, with the plain facts.
  if (!caller.brain) {
    state.meeting.chat.push(
      victim !== null
        ? { who: caller.id, kind: 'found', about: victim, room: roomsBefore[caller.id] ?? null }
        : { who: caller.id, kind: 'button', about: null, room: null },
    );
  }
  // Sightings are spent at the meeting; the next one starts from a clean slate.
  for (const p of state.participants) {
    if (p.brain) p.brain.notes = [];
    p.seen = [];
  }
  events.push({ type: 'meetingStarted', who: caller.id, victim });
  return events;
}

/** Someone the participant could see nearby just before the meeting, for «I was with …». */
function buddyOf(state: WorldState, p: Participant): number | null {
  let best: number | null = null;
  let bestD = 6;
  for (const o of state.participants) {
    if (o === p || !o.alive || o.under !== null) continue;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d < bestD && canSee(state.level, p.x, p.z, o.x, o.z, sightRadius(state))) {
      best = o.id;
      bestD = d;
    }
  }
  return best;
}

const between = (rng: Rng, a: number, b: number): number => a + rng.next() * (b - a);

/** Decides up front what every bot says and how it votes; deterministic per seed and tick. */
function planBots(
  state: WorldState,
  caller: Participant,
  victim: number | null,
  roomsBefore: (RoomType | null)[],
  buddies: (number | null)[],
  rng: Rng,
): Planned[] {
  const plan: Planned[] = [];
  const say = (at: number, who: number, kind: ChatKind, about: number | null = null, room: RoomType | null = null): void => {
    plan.push({ at, who, line: { who, kind, about, room }, vote: null, firm: false });
  };
  const vote = (who: number, target: number, firm = false): void => {
    plan.push({ at: talkTime(state) + between(rng, 1, voteTime(state) * 0.75), who, line: null, vote: target, firm });
  };
  const living = state.participants.filter((p) => p.alive);
  const bots = living.filter((p) => p.brain);
  const randomOther = (self: Participant): number => {
    const others = living.filter((o) => o !== self);
    return others.length > 0 ? others[rng.int(others.length)]!.id : SKIP_VOTE;
  };

  // The strongest accusation in the room, which others may follow.
  let accused: number | null = null;
  let accuser: number | null = null;
  for (const b of bots) {
    const s = b.brain!.suspicion;
    if (b.role === 'chick' && s && s.level === 2 && state.participants[s.who]!.alive) {
      accused = s.who;
      accuser = b.id;
      break;
    }
  }

  // The caller opens.
  if (caller.brain) {
    if (victim !== null) say(1, caller.id, 'found', victim, roomsBefore[caller.id]);
    else say(1, caller.id, 'button');
  }

  let at = 3;
  const order = [...bots];
  // Shuffle with the seeded RNG so speaking order varies.
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (accuser !== null) order.unshift(...order.splice(order.findIndex((b) => b.id === accuser), 1));

  for (const b of order) {
    const s = b.brain!.suspicion;
    const room = roomsBefore[b.id] ?? null;
    const t = Math.min(at, talkTime(state) + voteTime(state) * 0.5);
    at += between(rng, 1.8, 3.4);
    if (b.role === 'goose') {
      if (accused === b.id) {
        say(t, b.id, 'defend', null, room);
        vote(b.id, accuser!, true);
      } else if (accused !== null) {
        say(t, b.id, 'agree', accused);
        vote(b.id, accused);
      } else if (rng.next() < 0.4) {
        // Point at a random chick to muddy the water.
        const chicks = living.filter((o) => o.role === 'chick');
        const target = chicks[rng.int(chicks.length)]!;
        say(t, b.id, 'sus', target.id, roomType(state, target.roomId) ?? room);
        vote(b.id, target.id);
      } else {
        // An alibi in a room it may never have been to.
        const rooms = state.level.rooms;
        say(t, b.id, 'where', null, rooms[rng.int(rooms.length)]!.type);
        vote(b.id, SKIP_VOTE);
      }
      continue;
    }
    if (s && s.level === 2 && state.participants[s.who]!.alive) {
      say(t, b.id, s.deed === 'carpet' ? 'sawCarpet' : 'saw', s.who, s.room);
      vote(b.id, s.who, true);
    } else if (s && s.level === 1 && state.participants[s.who]!.alive) {
      say(t, b.id, 'sus', s.who, s.room);
      vote(b.id, rng.next() < BOT_HUNCH_CHANCE ? s.who : SKIP_VOTE);
    } else if (accused !== null && b.brain!.notes.some((n) => n.kind === 'task' && n.who === accused)) {
      // It saw the accused do honest work: speaks up instead of piling on.
      const seen = b.brain!.notes.find((n) => n.kind === 'task' && n.who === accused)!;
      say(t, b.id, 'vouch', accused, seen.room);
      vote(b.id, SKIP_VOTE, true);
    } else if (accused !== null && accused !== b.id && rng.next() < BOT_FOLLOW_CHANCE) {
      say(t, b.id, 'agree', accused);
      vote(b.id, accused);
    } else if (noteLine(b, state) && (noteLine(b, state)!.who !== b.id || rng.next() < 0.5)) {
      const note = noteLine(b, state)!;
      const kind: ChatKind = note.who === b.id ? 'iFixed' : note.kind === 'idle' ? 'idle' : note.kind === 'task' ? 'sawTask' : 'sawFix';
      say(t, b.id, kind, note.who === b.id ? null : note.who, note.room);
      const hunch = note.kind === 'idle' && rng.next() < BOT_IDLE_VOTE_CHANCE;
      vote(b.id, hunch ? note.who : rng.next() < BOT_RANDOM_VOTE ? randomOther(b) : SKIP_VOTE);
    } else {
      const buddy = buddies[b.id];
      if (buddy !== null && buddy !== undefined && rng.next() < 0.5) say(t, b.id, 'with', buddy);
      else if (room) say(t, b.id, 'where', null, room);
      else say(t, b.id, 'nothing');
      vote(b.id, rng.next() < BOT_RANDOM_VOTE ? randomOther(b) : SKIP_VOTE);
    }
  }
  return plan.sort((a, b) => a.at - b.at);
}

/**
 * The sighting a bot chick brings up: about others first (idling, then a fixed
 * sabotage, then honest work), its own repair last; living subjects only.
 */
function noteLine(bot: Participant, state: WorldState): Note | null {
  const notes = bot.brain!.notes.filter((n) => state.participants[n.who]!.alive);
  for (const kind of ['idle', 'fixed', 'task'] as const) {
    const note = notes.find((n) => n.kind === kind && n.who !== bot.id);
    if (note) return note;
  }
  return notes.find((n) => n.kind === 'fixed') ?? null;
}

/** Ready-made lines for a human: the gravest sightings first, then its own whereabouts. */
function hintsFor(state: WorldState, p: Participant, room: RoomType | null): ChatLine[] {
  if (p.brain || !p.alive) return [];
  const order: SeenKind[] = ['pack', 'carpet', 'idle', 'fixed', 'task', 'met'];
  const lines: ChatLine[] = [];
  for (const kind of order) {
    for (const n of p.seen) {
      if (n.kind !== kind || !state.participants[n.who]!.alive) continue;
      // One line per subject: the gravest thing seen about it.
      if (lines.some((l) => l.about === n.who)) continue;
      if (kind === 'met' && lines.filter((l) => l.kind === 'sawIn').length >= PLAYER_HINTS_MET) break;
      lines.push({ who: p.id, kind: SEEN_LINE[kind], about: n.who, room: n.room });
    }
  }
  return [...lines.slice(0, PLAYER_HINTS_MAX), { who: p.id, kind: 'where', about: null, room }];
}

/**
 * A human's quick report. Anything may be said, true or not; the first claim
 * or vouch of each speaker moves the bots that have no eyewitness reason of their own.
 */
export function sayLine(state: WorldState, speaker: Participant, kind: ChatKind, about: number | null, room: RoomType | null): SimEvent[] {
  const m = state.meeting;
  if (!m || m.stage === 'result' || !speaker.alive || !SAYABLE.has(kind)) return [];
  const id = speaker.id;
  if (m.said[id]! >= PLAYER_SAY_MAX || m.elapsed - m.saidAt[id]! < PLAYER_SAY_COOLDOWN) return [];
  const needs = CHAT_NEEDS[kind];
  if (needs.about ? about === null || about === id || !Number.isInteger(about) || !state.participants[about] : about !== null) return [];
  if (needs.room ? room !== null && !state.level.rooms.some((r) => r.type === room) : room !== null) return [];
  m.said[id]!++;
  m.saidAt[id] = m.elapsed;
  m.chat.push({ who: id, kind, about, room });
  const events: SimEvent[] = [{ type: 'chat', who: id }];
  if (about === null || m.swayed[id] || !state.participants[about]!.alive) return events;

  const rng = createRng(((state.level.seed * 7919 + state.tick * 13 + id * 101 + m.chat.length) >>> 0) || 1);
  const pending = (bot: Participant): Planned | undefined => m.plan.find((p) => p.who === bot.id && p.vote !== null);
  const reply = (who: number, line: Omit<ChatLine, 'who'>): void => {
    m.plan.push({ at: m.elapsed + between(rng, 1.2, 2.8), who, line: { who, ...line }, vote: null, firm: false });
  };
  const bots = state.participants.filter((p) => p.brain && p.alive && p.id !== id);
  if (HARD_CLAIMS.has(kind) || SOFT_CLAIMS.has(kind)) {
    m.swayed[id] = true;
    const chance = HARD_CLAIMS.has(kind) ? PLAYER_SWAY_SAW : PLAYER_SWAY_SUS;
    let agreed = false;
    for (const b of bots) {
      const vote = pending(b);
      if (b.id === about) {
        // The accused answers; a Goose strikes back at whoever pointed at it.
        reply(b.id, { kind: 'defend', about: null, room: m.rooms[b.id] ?? null });
        if (vote && b.role === 'goose') {
          vote.vote = id;
          vote.firm = true;
        }
        continue;
      }
      if (!vote || vote.firm) continue;
      // A bot Goose is glad to pile on someone else.
      if (b.role !== 'goose' && rng.next() >= chance) continue;
      vote.vote = about;
      if (!agreed) reply(b.id, { kind: 'agree', about, room: null });
      agreed = true;
    }
  } else if (VOUCHES.has(kind)) {
    m.swayed[id] = true;
    for (const b of bots) {
      const vote = pending(b);
      if (!vote || vote.firm || vote.vote !== about || b.role === 'goose') continue;
      if (rng.next() < PLAYER_SWAY_VOUCH) vote.vote = SKIP_VOTE;
    }
  }
  m.plan.sort((a, b) => a.at - b.at);
  return events;
}

/** People need longer than bots to talk things over and to make up their minds. */
const people = (state: WorldState): number => state.participants.filter((p) => !p.isBot).length;
export const talkTime = (state: WorldState): number => (people(state) > 1 ? MEETING_TALK_PEOPLE : MEETING_TALK);
export const voteTime = (state: WorldState): number => (people(state) > 1 ? MEETING_VOTE_PEOPLE : MEETING_VOTE);

/** Records a vote; only in the voting stage, once, by the living, for the living or nobody. */
export function castVote(state: WorldState, voter: Participant, target: number): SimEvent[] {
  const m = state.meeting;
  if (!m || m.stage !== 'vote' || !voter.alive || m.votes[voter.id] !== null) return [];
  if (target !== SKIP_VOTE && !state.participants[target]?.alive) return [];
  m.votes[voter.id] = target;
  return [{ type: 'voted', who: voter.id }];
}

/** Counts the votes: the single top target flies out; a tie or a skip majority keeps everyone. */
export function tally(votes: (number | null)[]): { ejected: number | null; tie: boolean } {
  const counts = new Map<number, number>();
  for (const v of votes) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let top = 0;
  let leaders: number[] = [];
  for (const [target, n] of counts) {
    if (n > top) {
      top = n;
      leaders = [target];
    } else if (n === top) leaders.push(target);
  }
  if (leaders.length !== 1) return { ejected: null, tie: leaders.length > 1 };
  return { ejected: leaders[0] === SKIP_VOTE ? null : leaders[0]!, tie: false };
}

/** Advances the meeting. Returns true when it is over and play resumes. */
export function stepMeeting(state: WorldState, dt: number, send: (who: number, vote: number) => SimEvent[], events: SimEvent[]): boolean {
  const m = state.meeting!;
  m.elapsed += dt;
  m.timeLeft = Math.max(0, m.timeLeft - dt);

  while (m.plan.length > 0 && m.plan[0]!.at <= m.elapsed) {
    const next = m.plan.shift()!;
    if (!state.participants[next.who]!.alive) continue;
    if (next.line) {
      m.chat.push(next.line);
      events.push({ type: 'chat', who: next.who });
    }
    if (next.vote !== null && m.stage === 'vote') {
      const target = next.vote === SKIP_VOTE || state.participants[next.vote]?.alive ? next.vote : SKIP_VOTE;
      events.push(...send(next.who, target));
    }
  }

  if (m.stage === 'talk' && m.timeLeft === 0) {
    m.stage = 'vote';
    m.timeLeft = voteTime(state);
    events.push({ type: 'meetingStage' });
  } else if (m.stage === 'vote') {
    const everyone = state.participants.every((p) => !p.alive || m.votes[p.id] !== null);
    if (m.timeLeft === 0 || everyone) {
      const result = tally(m.votes);
      m.ejected = result.ejected;
      m.tie = result.tie;
      m.stage = 'result';
      m.timeLeft = MEETING_RESULT;
      m.plan = [];
      if (m.ejected !== null) {
        const out = state.participants[m.ejected]!;
        out.alive = false;
        out.ejected = true;
        out.canPack = null;
        out.canReport = null;
        out.prompt = null;
        if (out.carrying !== null) {
          state.boxes = state.boxes.filter((b) => b.id !== out.carrying);
          out.carrying = null;
        }
      }
      events.push({ type: 'meetingStage' });
    }
  } else if (m.stage === 'result' && m.timeLeft === 0) {
    return true;
  }
  return false;
}
