import {
  BOT_FOLLOW_CHANCE,
  BOT_HUNCH_CHANCE,
  BOT_RANDOM_VOTE,
  BOX_SUSPECT_RANGE,
  MEETING_RESULT,
  MEETING_SEAT_RADIUS,
  MEETING_TALK,
  MEETING_VOTE,
} from '../config';
import { fitsIn } from './nav';
import type { RoomType } from './prefabs';
import { createRng, type Rng } from './rng';
import { canSee } from './vision';
import type { Participant, SimEvent, WorldState } from './world';

/** A vote for nobody. */
export const SKIP_VOTE = -1;

export type MeetingStage = 'talk' | 'vote' | 'result';

/** What a bot can say; the UI turns it into text via `chat.<kind>`. */
export type ChatKind = 'found' | 'button' | 'saw' | 'sawCarpet' | 'sus' | 'where' | 'with' | 'agree' | 'defend' | 'nothing';

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
    if (!p.brain || p === goose || p === victim || !p.alive || p.role !== 'chick') continue;
    if (!canSee(state.level, p.x, p.z, goose.x, goose.z)) continue;
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
    if (!canSee(state.level, bot.x, bot.z, o.x, o.z)) continue;
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
  const events: SimEvent[] = [];
  const rng = createRng(((state.level.seed * 6151 + state.tick * 31 + caller.id) >>> 0) || 1);
  // Where everyone was before the teleport: alibis are built from it.
  const roomsBefore = state.participants.map((p) => roomType(state, p.roomId));
  const buddies = state.participants.map((p) => buddyOf(state, p));

  for (const p of state.participants) {
    if (p.activeTask !== null) {
      events.push({ type: 'taskClosed', who: p.id, taskId: p.activeTask, done: false });
      p.activeTask = null;
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
    timeLeft: MEETING_TALK,
    chat: [],
    votes: state.participants.map(() => null),
    plan: planBots(state, caller, victim, roomsBefore, buddies, rng),
    ejected: null,
    tie: false,
  };
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
    if (d < bestD && canSee(state.level, p.x, p.z, o.x, o.z)) {
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
    plan.push({ at, who, line: { who, kind, about, room }, vote: null });
  };
  const vote = (who: number, target: number): void => {
    plan.push({ at: MEETING_TALK + between(rng, 1, MEETING_VOTE * 0.75), who, line: null, vote: target });
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
    const t = Math.min(at, MEETING_TALK + MEETING_VOTE * 0.5);
    at += between(rng, 1.8, 3.4);
    if (b.role === 'goose') {
      if (accused === b.id) {
        say(t, b.id, 'defend', null, room);
        vote(b.id, accuser!);
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
      vote(b.id, s.who);
    } else if (s && s.level === 1 && state.participants[s.who]!.alive) {
      say(t, b.id, 'sus', s.who, s.room);
      vote(b.id, rng.next() < BOT_HUNCH_CHANCE ? s.who : SKIP_VOTE);
    } else if (accused !== null && accused !== b.id && rng.next() < BOT_FOLLOW_CHANCE) {
      say(t, b.id, 'agree', accused);
      vote(b.id, accused);
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
    m.timeLeft = MEETING_VOTE;
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
