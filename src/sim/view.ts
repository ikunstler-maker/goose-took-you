import { PLAYER_SAY_COOLDOWN } from '../config';
import type { Box } from './cargo';
import { cameraSpots, cameraSees } from './cameras';
import type { Carpet } from './carpets';
import type { ChatLine, MeetingStage } from './meeting';
import type { Sabotage, SabotageKind } from './sabotage';
import type { Task } from './tasks';
import {
  isAway,
  progress,
  type Emotion,
  type Participant,
  type Phase,
  type Prompt,
  type Role,
  type SimEvent,
  type Thought,
  type Winner,
  type WorldState,
} from './world';

/**
 * What one seat is allowed to know: the snapshot a server sends to that
 * player's browser. Plain data only; the office itself is rebuilt from `seed`.
 * Nothing here may reveal another seat's role, plans, tasks or whereabouts
 * out of sight.
 */
export interface PlayerView {
  you: number;
  seed: number;
  tick: number;
  phase: Phase;
  winner: Winner | null;
  lostTo: SabotageKind | null;
  /** Share of all chick tasks done, 0..1. */
  progress: number;
  broadcast: number;
  buttonCooldown: number;
  sabotage: Sabotage | null;
  seats: SeatView[];
  self: SelfView;
  /** 1 for every floor cell in sight. */
  sight: Uint8Array;
  sightVersion: number;
  boxes: Box[];
  carpets: Carpet[];
  meeting: MeetingView | null;
}

/** A seat as others know it. */
export interface SeatView {
  id: number;
  color: number;
  accessory: number;
  alive: boolean;
  ejected: boolean;
  /** A person holds this seat; `away` while a bot covers for them. */
  human: boolean;
  away: boolean;
  /** Known only for yourself, for someone voted out, and for everyone once the match is over. */
  role: Role | null;
  /** Where it is and what it does; null when out of sight. */
  body: BodyView | null;
}

export interface BodyView {
  x: number;
  z: number;
  facing: number;
  moving: boolean;
  emotion: Emotion;
  thought: Thought | null;
  carrying: number | null;
  /** The Goose's neck stretch, seconds left; the one honest tell. */
  tell: number;
  tellBubble: boolean;
  /** Busy with a task or the cameras: stands still. */
  busy: boolean;
}

/** What only the seat's owner knows about itself. */
export interface SelfView {
  role: Role;
  buttonUses: number;
  packCooldown: number;
  carpetCooldown: number;
  /** Goose only: seconds until the next sabotage. */
  sabotageCooldown: number;
  under: number | null;
  roomId: number | null;
  canPack: number | null;
  canReport: number | null;
  prompt: Prompt | null;
  activeTask: number | null;
  watching: boolean;
  visited: number[];
  tasks: Task[];
}

export interface MeetingView {
  caller: number;
  victim: number | null;
  stage: MeetingStage;
  timeLeft: number;
  chat: ChatLine[];
  /** Who has voted; for whom stays secret until the result. */
  voted: boolean[];
  /** The result card only: every vote. */
  votes: (number | null)[] | null;
  myVote: number | null;
  /** Ready-made true lines for this seat. */
  hints: ChatLine[];
  /** Lines this seat has said, and seconds until it may speak again. */
  said: number;
  sayIn: number;
  ejected: number | null;
  tie: boolean;
}

const cellSeen = (state: WorldState, viewer: number, x: number, z: number): boolean =>
  state.sight[viewer]!.cells[Math.floor(z) * state.level.size + Math.floor(x)] === 1;

/** The spot is on a camera the viewer is watching right now. */
function onCamera(state: WorldState, viewer: Participant, x: number, z: number): boolean {
  if (!viewer.watching) return false;
  return cameraSpots(state.level).some((spot) => cameraSees(state.level, spot, x, z));
}

/** Can the viewer see this participant right now? Everyone is in plain view outside of play. */
export function seesBody(state: WorldState, viewer: Participant, p: Participant): boolean {
  if (p === viewer) return true;
  if (!p.alive || p.under !== null) return false;
  if (state.phase !== 'play') return true;
  return cellSeen(state, viewer.id, p.x, p.z) || onCamera(state, viewer, p.x, p.z);
}

function bodyOf(p: Participant): BodyView {
  return {
    x: p.x,
    z: p.z,
    facing: p.facing,
    moving: p.moving,
    emotion: p.emotion,
    thought: p.thought,
    carrying: p.carrying,
    tell: p.tell,
    tellBubble: p.tellBubble,
    busy: p.activeTask !== null || p.watching,
  };
}

/** The snapshot for one seat. Copies everything, so the result can be sent or kept as is. */
export function viewFor(state: WorldState, you: number): PlayerView {
  const viewer = state.participants[you]!;
  const over = state.phase === 'over';
  const m = state.meeting;
  const sight = state.sight[you]!;
  const seats = state.participants.map((p): SeatView => ({
    id: p.id,
    color: p.color,
    accessory: p.accessory,
    alive: p.alive,
    ejected: p.ejected,
    human: !p.isBot,
    away: isAway(p),
    role: p === viewer || over || p.ejected ? p.role : null,
    body: seesBody(state, viewer, p) ? bodyOf(p) : null,
  }));
  const boxes = state.boxes.filter((b) => {
    if (b.carrier !== null) return seats[b.carrier]!.body !== null;
    return cellSeen(state, you, b.x, b.z) || onCamera(state, viewer, b.x, b.z);
  });
  return {
    you,
    seed: state.level.seed,
    tick: state.tick,
    phase: state.phase,
    winner: state.winner,
    lostTo: state.lostTo,
    progress: progress(state),
    broadcast: state.broadcast,
    buttonCooldown: state.buttonCooldown,
    sabotage: state.sabotage ? { ...state.sabotage, done: [...state.sabotage.done] } : null,
    seats,
    self: {
      role: viewer.role,
      buttonUses: viewer.buttonUses,
      packCooldown: viewer.packCooldown,
      carpetCooldown: viewer.carpetCooldown,
      sabotageCooldown: viewer.role === 'goose' ? state.sabotageCooldown : 0,
      under: viewer.under,
      roomId: viewer.roomId,
      canPack: viewer.canPack,
      canReport: viewer.canReport,
      prompt: viewer.prompt ? { ...viewer.prompt } : null,
      activeTask: viewer.activeTask,
      watching: viewer.watching,
      visited: [...viewer.visited],
      tasks: state.tasks.filter((t) => t.owner === you).map((t) => ({ ...t })),
    },
    sight: sight.cells.slice(),
    sightVersion: sight.version,
    boxes: boxes.map((b) => ({ ...b })),
    carpets: state.carpets.map((c) => ({ ...c, links: [...c.links] })),
    meeting: m && {
      caller: m.caller,
      victim: m.victim,
      stage: m.stage,
      timeLeft: m.timeLeft,
      // The living do not read what those out of the match say among themselves.
      chat: m.chat.filter((line) => !line.ghost || !viewer.alive).map((line) => ({ ...line })),
      voted: m.votes.map((v) => v !== null),
      votes: m.stage === 'result' ? [...m.votes] : null,
      myVote: m.votes[you] ?? null,
      hints: m.hints[you]!.map((line) => ({ ...line })),
      said: m.said[you]!,
      sayIn: Math.max(0, m.saidAt[you]! + PLAYER_SAY_COOLDOWN - m.elapsed),
      ejected: m.ejected,
      tie: m.tie,
    },
  };
}

/** Events about the whole office: everyone hears them. */
const PUBLIC: ReadonlySet<SimEvent['type']> = new Set<SimEvent['type']>([
  'broadcastStarted', 'looksChanged', 'seatChanged', 'started', 'reported', 'meetingStarted',
  'meetingStage', 'chat', 'voted', 'meetingEnded', 'sabotageEnded', 'gameOver',
]);
/** Events only their own seat hears. */
const PRIVATE: ReadonlySet<SimEvent['type']> = new Set<SimEvent['type']>([
  'rushStarted', 'rushFailed', 'badgeTaken', 'camerasOpened', 'camerasClosed', 'roomChanged',
  'promptChanged', 'taskDone', 'taskOpened', 'taskClosed',
]);

/**
 * The events one seat may hear, right after the step that produced them.
 * A sabotage is heard by all but not who started it; the rest needs eyes on the doer.
 */
export function eventsFor(state: WorldState, you: number, events: readonly SimEvent[]): SimEvent[] {
  const viewer = state.participants[you]!;
  const out: SimEvent[] = [];
  for (const event of events) {
    // A line from someone out of the match is heard only by the others who are out.
    if (event.type === 'chat' && viewer.alive && !state.participants[event.who]!.alive) continue;
    if (PUBLIC.has(event.type) || !('who' in event)) {
      out.push(event);
      continue;
    }
    const who = state.participants[event.who]!;
    const mine = event.who === you || (event.type === 'packed' && event.victim === you);
    if (mine) out.push(event);
    else if (PRIVATE.has(event.type)) continue;
    else if (event.type === 'sabotageStarted') out.push({ ...event, who: -1 });
    // A packed chick or a diving Goose is gone from view by now: judge by the spot.
    else if (cellSeen(state, you, who.x, who.z) || onCamera(state, viewer, who.x, who.z)) out.push(event);
    else if (event.type === 'sabotageFixed') out.push({ ...event, who: -1 });
  }
  return out;
}
