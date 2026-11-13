import {
  ACCESSORIES,
  CARPET_COOLDOWN,
  CARPET_DIVE,
  CARPET_VISION,
  BORED_AFTER,
  BUTTON_COOLDOWN,
  BUTTON_USES,
  GOOSE_GRACE,
  BOT_IDLE_NOTE,
  INTERACT_RANGE,
  NEWS_BUTTON_TIME,
  CHICK_COLORS,
  DIZZY_COOLDOWN,
  DIZZY_TIME,
  NEWS_BROADCAST_TIME,
  PACK_COOLDOWN,
  PACK_FIRST_COOLDOWN,
  PACK_RANGE,
  PARTICIPANTS,
  REPORT_RANGE,
  TELL_BUBBLE_RANGE,
  TELL_MAX,
  TELL_MIN,
  TELL_SABOTAGE_RATE,
  SABOTAGE_COOLDOWN,
  TELL_TIME,
  THOUGHT_TIME,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SPAWN_SPACING,
  SURPRISED_TIME,
  PLAYER_MET_EVERY,
} from '../config';
import { createBrain, thinkBot, type Brain } from './bots';
import { boxInReach, carryBox, rollSlip, vacationInReach, type Box } from './cargo';
import { blocked, buildBuckets, generateLevel, roomAt, type Buckets, type Level } from './level';
import { buildNav, type NavGrid } from './nav';
import { createRng } from './rng';
import {
  assignCargoTargets,
  assignTasks,
  findStations,
  taskInReach,
  takeBadge,
  WINDOW_TASKS,
  type Station,
  type Task,
  type TaskKind,
} from './tasks';
import { castVote, meetingTable, noteDeed, noteTell, sayLine, startMeeting, stepMeeting, type ChatKind, type Meeting } from './meeting';
import { carpetInReach, placeCarpets, type Carpet } from './carpets';
import { noteMet, noteSeen, type Seen } from './notes';
import type { RoomType } from './prefabs';
import { computeVisibility } from './vision';
import {
  findFixPoints,
  fixInReach,
  fixSabotage,
  propDistance,
  sightRadius,
  startSabotage,
  type FixPoints,
  type Sabotage,
  type SabotageKind,
} from './sabotage';

/** What the chick's face shows; driven by what just happened to it. */
export type Emotion = 'calm' | 'happy' | 'dizzy' | 'surprised' | 'bored';

/** A short thought bubble over a participant's head; the text lives in i18n. */
export type Thought = 'doubt' | 'meh' | 'heart' | 'busy';

/** What `interact` would do right now; drives the on-screen hint. */
export type Prompt =
  | { kind: 'task'; task: number }
  | { kind: 'pickup'; box: number }
  | { kind: 'deliver'; task: number }
  /** The red «ТЕРМІНОВИЙ СОЗВОН» button on the meeting table. */
  | { kind: 'button' }
  /** Goose: dive under this rug. */
  | { kind: 'carpet'; carpet: number }
  /** Restart a fan or sign the NDA while a sabotage runs; `point` is a prop index. */
  | { kind: 'fix'; point: number }
  /** Security desk: watch the cameras. */
  | { kind: 'cameras' }
  /** The Giant Green Button, while the participant's news edit waits for it. */
  | { kind: 'greenButton'; task: number };

/** A chick, or the Goose disguised as one. */
export type Role = 'chick' | 'goose';

/** One chick in the match: a person's seat or a bot. */
export interface Participant {
  id: number;
  /** False for a seat a person holds, even while a bot covers for them (see `isAway`). */
  isBot: boolean;
  role: Role;
  /** False once packed into a «ГАРЯЧА ВІДПУСТКА» box or voted out. */
  alive: boolean;
  /** Voted out at a meeting (rather than packed). */
  ejected: boolean;
  /** Red button presses left this match. */
  buttonUses: number;
  /** Goose only: the rug it hides under, or null. Hidden participants are not seen by anyone. */
  under: number | null;
  /** Seconds before the next carpet action. */
  carpetCooldown: number;
  /** Goose only: seconds until the next pack is allowed. */
  packCooldown: number;
  /** Goose only: seconds left of the neck stretch, and until the next one. */
  tell: number;
  tellIn: number;
  /** Goose only: someone stands close enough to see «га-га?». */
  tellBubble: boolean;
  /** Goose only: chick that `pack` would take right now. */
  canPack: number | null;
  /** Vacation box that `report` would report right now. */
  canReport: number | null;
  /** Thought bubble shown now, and its seconds left. */
  thought: Thought | null;
  thoughtTime: number;
  /** Index into CHICK_COLORS. */
  color: number;
  /** Index into ACCESSORIES. */
  accessory: number;
  x: number;
  z: number;
  /** Heading in radians; 0 faces south (+z). */
  facing: number;
  moving: boolean;
  moveX: number;
  moveZ: number;
  emotion: Emotion;
  /** Seconds left of a timed emotion (dizzy, surprised). */
  emotionTime: number;
  idleTime: number;
  /** Seconds of unobstructed movement; a bump only counts after a run-up. */
  runTime: number;
  bumpCooldown: number;
  /** Box id held in the wings, or null. */
  carrying: number | null;
  /** Room the participant stands in, or null in a corridor. */
  roomId: number | null;
  /** Rooms this participant has walked into this match, in order; drives the minimap. */
  visited: number[];
  prompt: Prompt | null;
  /** Task whose mini-game is open; the chick stands still meanwhile, the office does not. */
  activeTask: number | null;
  /** Watching the security cameras; stands still meanwhile, like during a mini-game. */
  watching: boolean;
  /** Human players: what they saw since the last meeting, newest first. Empty for bots. */
  seen: Seen[];
  /** Bot plan; null while a person plays this seat. */
  brain: Brain | null;
}

/** Match phase. The lobby is where the player picks a look before the start. */
export type Phase = 'lobby' | 'play' | 'meeting' | 'over';
export type Winner = 'chicks' | 'goose';

export interface WorldState {
  level: Level;
  buckets: Buckets;
  /** Walkability grid bots plan their routes on. */
  nav: NavGrid;
  phase: Phase;
  participants: Participant[];
  /** Per participant: what it sees. Kept up to date for human seats only. */
  sight: Sight[];
  stations: Station[];
  tasks: Task[];
  boxes: Box[];
  /** Rugs the Goose can hide under and crawl between. */
  carpets: Carpet[];
  /** Seconds left of «Екстрені Новини» on the Lobby screen; 0 when off. */
  broadcast: number;
  winner: Winner | null;
  /** The meeting in progress, or null. */
  meeting: Meeting | null;
  /** Seconds until the red button can be pressed again. */
  buttonCooldown: number;
  /** Where sabotages are fixed. */
  fixPoints: FixPoints;
  /** The sabotage in progress, or null. */
  sabotage: Sabotage | null;
  /** Seconds until the Goose may start the next sabotage. */
  sabotageCooldown: number;
  /** The sabotage that ran out and won the match for the Goose, or null. */
  lostTo: SabotageKind | null;
  /** Online browser copy only: the shared task progress as told by the server; null where the match itself runs. */
  sharedProgress: number | null;
  /** Debug/testing: the local player's role at the start instead of a random one. */
  forcedRole: Role | null;
  tick: number;
}

export type Command =
  | { type: 'move'; x: number; z: number }
  | { type: 'interact' }
  | { type: 'finishTask' }
  | { type: 'cancelTask' }
  /** Step away from the security cameras. */
  | { type: 'stopWatching' }
  /** Lobby only: pick a look. Bots take the colours left over. */
  | { type: 'setLook'; color: number; accessory: number }
  | { type: 'start' }
  /** Sent by the transport, not by a player: a person takes this seat, or lets go of it. */
  | { type: 'join' }
  | { type: 'leave' }
  /** Goose: pack the chick within reach into a «ГАРЯЧА ВІДПУСТКА» box. */
  | { type: 'pack' }
  /** Report the vacation box within reach. Meetings follow in stage 4. */
  | { type: 'report' }
  /** Show a short thought bubble for THOUGHT_TIME seconds. */
  | { type: 'think'; thought: Thought }
  /** At a meeting: vote for a participant id, or SKIP_VOTE. */
  | { type: 'vote'; target: number }
  /** At a meeting: a quick report, built from a phrase, a participant and a room. */
  | { type: 'say'; kind: ChatKind; about: number | null; room: RoomType | null; text?: string }
  /** Goose under a rug: crawl to a linked rug. */
  | { type: 'crawl'; to: number }
  /** Goose: start a sabotage. */
  | { type: 'sabotage'; kind: SabotageKind };

export type SimEvent =
  | { type: 'rushStarted'; who: number; taskId: number }
  /** The Giant Green Button was not reached in time: the edit must be redone. */
  | { type: 'rushFailed'; who: number; taskId: number }
  /** The Giant Green Button was pressed: confetti at (x, z). */
  | { type: 'newsLaunched'; who: number; x: number; z: number }
  | { type: 'badgeTaken'; who: number; taskId: number }
  | { type: 'camerasOpened'; who: number }
  | { type: 'camerasClosed'; who: number }
  | { type: 'roomChanged'; who: number; roomId: number | null }
  | { type: 'bumped'; who: number }
  | { type: 'promptChanged'; who: number }
  | { type: 'taskDone'; who: number; taskId: number }
  | { type: 'boxPicked'; who: number; boxId: number }
  /** The box slipped out of the wings: «Куд-кудах-ай!» */
  | { type: 'boxSlipped'; who: number; boxId: number }
  | { type: 'broadcastStarted' }
  /** `seed` feeds the mini-game's own RNG so a round is reproducible. */
  | { type: 'taskOpened'; who: number; taskId: number; kind: TaskKind; seed: number }
  | { type: 'taskClosed'; who: number; taskId: number; done: boolean }
  | { type: 'looksChanged' }
  /** A seat changed hands between a person and a bot. */
  | { type: 'seatChanged'; who: number }
  | { type: 'started' }
  | { type: 'packed'; who: number; victim: number; boxId: number }
  | { type: 'reported'; who: number; boxId: number; victim: number }
  | { type: 'carpet'; who: number; carpet: number; action: 'in' | 'out' | 'crawl' }
  | { type: 'meetingStarted'; who: number; victim: number | null }
  /** The meeting moved to voting or to the result card. */
  | { type: 'meetingStage' }
  | { type: 'chat'; who: number }
  | { type: 'voted'; who: number }
  | { type: 'meetingEnded'; ejected: number | null }
  | { type: 'sabotageStarted'; who: number; kind: SabotageKind }
  | { type: 'sabotageFixed'; who: number; kind: SabotageKind; point: number }
  /** `fixed` is false when a meeting cut the sabotage short. */
  | { type: 'sabotageEnded'; kind: SabotageKind; fixed: boolean }
  | { type: 'gameOver'; winner: Winner };

/** The participant this browser controls. */
/** What one participant sees: 1 for every floor cell in sight; `version` is bumped on every recompute. */
export interface Sight {
  cells: Uint8Array;
  version: number;
}

/**
 * The seat of the human on this device: 0 in a local match. Online, the browser
 * sets it to the seat the server gave it; the server itself never reads it.
 */
export let LOCAL_PLAYER = 0;

export function setLocalSeat(seat: number): void {
  LOCAL_PLAYER = seat;
}

export function me(state: WorldState): Participant {
  return state.participants[LOCAL_PLAYER]!;
}

/**
 * The player stands on the spawn; bots line up in arcs behind it (away from
 * the camera, which looks from +x +z) so nobody hides the player's chick.
 */
function spawnPoints(level: Level, buckets: Buckets): { x: number; z: number }[] {
  const points = [{ x: level.spawn.x, z: level.spawn.z }];
  const candidates: { x: number; z: number; rank: number }[] = [];
  for (let ring = 1; ring <= 4; ring++) {
    const steps = ring * 6;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const dx = Math.cos(a) * ring * SPAWN_SPACING;
      const dz = Math.sin(a) * ring * SPAWN_SPACING;
      const x = level.spawn.x + dx;
      const z = level.spawn.z + dz;
      if (!blocked(level, buckets, x, z, PLAYER_RADIUS)) {
        // Spots in front of the player (towards the camera) are a last resort.
        candidates.push({ x, z, rank: (dx + dz > 0.1 ? 100 : 0) + ring * 10 + (dx + dz) / SPAWN_SPACING });
      }
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  for (const c of candidates) {
    if (points.length >= PARTICIPANTS) break;
    if (points.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < SPAWN_SPACING * 0.9)) continue;
    points.push({ x: c.x, z: c.z });
  }
  while (points.length < PARTICIPANTS) points.push({ ...points[0]! });
  return points;
}

/** Bots take every colour the humans did not pick, in a seeded order, and random accessories. */
function dressBots(state: WorldState): void {
  const rng = createRng(state.level.seed ^ 0x10b5);
  const taken = new Set(state.participants.filter((p) => !p.isBot).map((p) => p.color));
  const colors = rng.shuffle(CHICK_COLORS.map((_, i) => i).filter((i) => !taken.has(i)));
  let n = 0;
  for (const p of state.participants) {
    if (!p.isBot) continue;
    p.color = colors[n++ % colors.length]!;
    p.accessory = rng.int(ACCESSORIES.length);
  }
}

/** A human seat is one a person holds; while that person is away, a bot plays it (`brain` is set). */
export const isAway = (p: Participant): boolean => !p.isBot && p.brain !== null;

const freshBrain = (state: WorldState, p: Participant): Brain =>
  createBrain(createRng(((state.level.seed * 31 + p.id * 977 + state.tick) >>> 0) || 1));

/** A person takes a bot seat in the lobby, or comes back to their own seat mid-match. */
function join(state: WorldState, actor: Participant): SimEvent[] {
  if (actor.isBot) {
    if (state.phase !== 'lobby') return [];
    actor.isBot = false;
    // The first colour no other human wears.
    const taken = new Set(state.participants.filter((p) => !p.isBot && p !== actor).map((p) => p.color));
    actor.color = CHICK_COLORS.findIndex((_, i) => !taken.has(i));
    dressBots(state);
  } else if (!actor.brain) return [];
  actor.brain = null;
  actor.moveX = 0;
  actor.moveZ = 0;
  refreshVision(state, actor);
  return [{ type: 'seatChanged', who: actor.id }, { type: 'looksChanged' }];
}

/** A person leaves: in the lobby the seat goes back to the bots; mid-match a bot plays it until they return. */
function leave(state: WorldState, actor: Participant): SimEvent[] {
  if (actor.isBot || actor.brain) return [];
  const events: SimEvent[] = [];
  if (actor.activeTask !== null) events.push(...applyCommand(state, actor.id, { type: 'cancelTask' }));
  if (actor.watching) events.push(...stopWatching(actor));
  actor.moveX = 0;
  actor.moveZ = 0;
  actor.seen = [];
  actor.brain = freshBrain(state, actor);
  if (state.phase === 'lobby') {
    actor.isBot = true;
    dressBots(state);
    events.push({ type: 'looksChanged' });
  }
  events.push({ type: 'seatChanged', who: actor.id });
  return events;
}

export function createWorld(
  seed: number,
  look: { color: number; accessory: number } = { color: 0, accessory: 0 },
  forcedRole: Role | null = null,
): WorldState {
  const level = generateLevel(seed);
  const buckets = buildBuckets(level);
  const stations = findStations(level);
  const spots = spawnPoints(level, buckets);
  const botRng = createRng(seed ^ 0xb075);
  const participants: Participant[] = spots.map((spot, id) => ({
    id,
    isBot: id !== LOCAL_PLAYER,
    role: 'chick',
    alive: true,
    ejected: false,
    buttonUses: BUTTON_USES,
    under: null,
    carpetCooldown: 0,
    packCooldown: 0,
    tell: 0,
    tellIn: 0,
    tellBubble: false,
    canPack: null,
    canReport: null,
    thought: null,
    thoughtTime: 0,
    color: 0,
    accessory: 0,
    x: spot.x,
    z: spot.z,
    facing: 0,
    moving: false,
    moveX: 0,
    moveZ: 0,
    emotion: 'calm',
    emotionTime: 0,
    idleTime: 0,
    runTime: 0,
    bumpCooldown: 0,
    carrying: null,
    roomId: roomAt(level, spot.x, spot.z)?.id ?? null,
    visited: [],
    prompt: null,
    activeTask: null,
    watching: false,
    seen: [],
    brain: id === LOCAL_PLAYER ? null : createBrain(botRng),
  }));
  // Everyone gets a full task list; ids are global so boxes and events stay unambiguous.
  const tasks: Task[] = [];
  for (const p of participants) {
    for (const task of assignTasks(stations, seed, p.id)) tasks.push({ ...task, id: tasks.length });
  }
  const state: WorldState = {
    level,
    buckets,
    nav: buildNav(level, buckets),
    phase: 'lobby',
    participants,
    sight: participants.map(() => ({ cells: new Uint8Array(level.size * level.size), version: 1 })),
    stations,
    tasks,
    boxes: [],
    carpets: placeCarpets(level, buckets),
    broadcast: 0,
    winner: null,
    meeting: null,
    buttonCooldown: BUTTON_COOLDOWN,
    fixPoints: findFixPoints(level),
    sabotage: null,
    sabotageCooldown: SABOTAGE_COOLDOWN,
    lostTo: null,
    sharedProgress: null,
    forcedRole,
    tick: 0,
  };
  me(state).color = clampIndex(look.color, CHICK_COLORS.length);
  me(state).accessory = clampIndex(look.accessory, ACCESSORIES.length);
  dressBots(state);
  assignCargoTargets(level, state.tasks, seed);
  refreshVision(state);
  return state;
}

const clampIndex = (value: number, length: number): number =>
  Number.isInteger(value) && value >= 0 && value < length ? value : 0;

/** Applies a command from one participant; returns events it caused immediately. */
export function applyCommand(state: WorldState, who: number, command: Command): SimEvent[] {
  const actor = state.participants[who];
  if (!actor) return [];
  switch (command.type) {
    case 'move': {
      const length = Math.hypot(command.x, command.z);
      actor.moveX = length > 1e-6 ? command.x / length : 0;
      actor.moveZ = length > 1e-6 ? command.z / length : 0;
      return [];
    }
    case 'setLook': {
      if (state.phase !== 'lobby' || actor.isBot) return [];
      // Two humans never wear the same colour.
      if (state.participants.some((p) => p !== actor && !p.isBot && p.color === clampIndex(command.color, CHICK_COLORS.length))) return [];
      actor.color = clampIndex(command.color, CHICK_COLORS.length);
      actor.accessory = clampIndex(command.accessory, ACCESSORIES.length);
      dressBots(state);
      return [{ type: 'looksChanged' }];
    }
    case 'start': {
      if (state.phase !== 'lobby' || actor.isBot) return [];
      state.phase = 'play';
      dealRoles(state);
      // Everyone starts in the lobby: that room is known from the first second.
      for (const p of state.participants) p.visited = p.roomId === null ? [] : [p.roomId];
      return [{ type: 'started' }];
    }
    case 'join':
      return join(state, actor);
    case 'leave':
      return leave(state, actor);
    case 'interact':
      return state.phase === 'play' && actor.alive ? interact(state, actor) : [];
    case 'pack':
      return state.phase === 'play' ? pack(state, actor) : [];
    case 'report':
      return state.phase === 'play' ? report(state, actor) : [];
    case 'crawl':
      return state.phase === 'play' ? crawl(state, actor, command.to) : [];
    case 'sabotage': {
      if (state.phase !== 'play') return [];
      const events = startSabotage(state, actor, command.kind);
      if (events.length > 0) refreshVision(state);
      return events;
    }
    case 'vote':
      return state.phase === 'meeting' ? castVote(state, actor, command.target) : [];
    case 'say':
      return state.phase === 'meeting' ? sayLine(state, actor, command.kind, command.about, command.room, command.text) : [];
    case 'think':
      if (state.phase !== 'play' || !actor.alive) return [];
      actor.thought = command.thought;
      actor.thoughtTime = THOUGHT_TIME;
      return [];
    case 'stopWatching':
      return stopWatching(actor);
    case 'finishTask':
    case 'cancelTask': {
      if (actor.activeTask === null) return [];
      const task = state.tasks[actor.activeTask]!;
      const done = command.type === 'finishTask';
      actor.activeTask = null;
      const events: SimEvent[] = [{ type: 'taskClosed', who: actor.id, taskId: task.id, done }];
      if (done && task.kind === 'news') {
        // The edit is cut; it only airs once the Giant Green Button in the room is pressed in time.
        task.rush = NEWS_BUTTON_TIME;
        events.push({ type: 'rushStarted', who: actor.id, taskId: task.id });
      } else if (done) events.push(...completeTask(state, actor, task));
      return events;
    }
  }
}

/** One random Goose (or the player's forced role); everyone else is a chick. */
function dealRoles(state: WorldState): void {
  const rng = createRng(state.level.seed ^ 0x6005e);
  let goose = rng.int(state.participants.length);
  if (state.forcedRole === 'goose') goose = LOCAL_PLAYER;
  else if (state.forcedRole === 'chick' && goose === LOCAL_PLAYER) goose = 1 + rng.int(state.participants.length - 1);
  for (const p of state.participants) {
    p.role = p.id === goose ? 'goose' : 'chick';
    p.packCooldown = p.role === 'goose' ? PACK_FIRST_COOLDOWN : 0;
    p.tellIn = TELL_MIN + rng.next() * (TELL_MAX - TELL_MIN);
  }
}

function pack(state: WorldState, actor: Participant): SimEvent[] {
  if (actor.role !== 'goose' || !actor.alive || actor.packCooldown > 0 || actor.canPack === null) return [];
  const victim = state.participants[actor.canPack]!;
  if (!victim.alive || victim.role === 'goose') return [];
  noteDeed(state, actor, victim, 'pack');
  victim.alive = false;
  victim.moving = false;
  victim.moveX = 0;
  victim.moveZ = 0;
  victim.activeTask = null;
  const closed = stopWatching(victim);
  victim.prompt = null;
  // Whatever the victim carried falls where it stood.
  if (victim.carrying !== null) {
    const held = state.boxes.find((b) => b.id === victim.carrying);
    if (held) held.carrier = null;
    victim.carrying = null;
  }
  const box: Box = {
    id: VACATION_BOX_BASE + victim.id,
    kind: 'vacation',
    x: victim.x,
    z: victim.z,
    carrier: null,
    task: -1,
    inside: victim.id,
    reported: false,
    travelled: 0,
    slipAt: -1,
  };
  state.boxes.push(box);
  actor.packCooldown = PACK_COOLDOWN;
  actor.canPack = null;
  return [...closed, { type: 'packed', who: actor.id, victim: victim.id, boxId: box.id }];
}

function report(state: WorldState, actor: Participant): SimEvent[] {
  if (!actor.alive || actor.canReport === null) return [];
  const box = state.boxes.find((b) => b.id === actor.canReport);
  if (!box || box.reported) return [];
  box.reported = true;
  actor.canReport = null;
  const events: SimEvent[] = [{ type: 'reported', who: actor.id, boxId: box.id, victim: box.inside! }];
  events.push(...startMeeting(state, actor, box.inside!));
  refreshVision(state);
  return events;
}

/** Vacation box ids sit above every task id. */
const VACATION_BOX_BASE = 10_000;

/**
 * Shared bar: chick tasks only (the Goose's list is a cover). Unfinished tasks
 * of packed chicks drop out, so the bar can still be filled by the rest.
 */
export function progress(state: WorldState): number {
  if (state.sharedProgress !== null) return state.sharedProgress;
  let done = 0;
  let total = 0;
  for (const task of state.tasks) {
    const owner = state.participants[task.owner]!;
    if (owner.role !== 'chick') continue;
    if (task.done) done++;
    if (task.done || owner.alive) total++;
  }
  return total === 0 ? 0 : done / total;
}

function checkWin(state: WorldState, events: SimEvent[]): void {
  if (state.phase !== 'play') return;
  const chicks = state.participants.filter((p) => p.alive && p.role === 'chick').length;
  const geese = state.participants.filter((p) => p.alive && p.role === 'goose').length;
  let winner: Winner | null = null;
  if (geese === 0) winner = 'chicks';
  else if (chicks <= geese) winner = 'goose';
  else if (state.sabotage && state.sabotage.left <= 0) {
    winner = 'goose';
    state.lostTo = state.sabotage.kind;
  }
  else if (progress(state) >= 1) winner = 'chicks';
  if (!winner) return;
  state.phase = 'over';
  state.winner = winner;
  for (const p of state.participants) {
    p.moveX = 0;
    p.moveZ = 0;
    p.moving = false;
    p.activeTask = null;
  }
  events.push({ type: 'gameOver', winner });
}

function completeTask(state: WorldState, actor: Participant, task: Task): SimEvent[] {
  task.done = true;
  noteSeen(state, 'task', actor);
  const events: SimEvent[] = [{ type: 'taskDone', who: actor.id, taskId: task.id }];
  // A visual task: everyone in the Lobby sees the news, which vouches for the editor.
  if (task.kind === 'news') {
    state.broadcast = NEWS_BROADCAST_TIME;
    events.push({ type: 'broadcastStarted' });
  }
  return events;
}

/** Recomputes sight for one human seat, or for all of them; shorter while hiding under a rug. */
function refreshVision(state: WorldState, only: Participant | null = null): void {
  for (const self of only ? [only] : state.participants) {
    if (self.isBot) continue;
    const radius = self.under !== null ? Math.min(CARPET_VISION, sightRadius(state)) : sightRadius(state);
    const sight = state.sight[self.id]!;
    computeVisibility(state.level, self.x, self.z, sight.cells, radius);
    sight.version++;
  }
}

/** Dive under a rug or climb out of it; anyone who sees it will remember. */
function carpetAction(state: WorldState, actor: Participant, carpet: Carpet, action: 'in' | 'out' | 'crawl'): SimEvent[] {
  if (action !== 'crawl') noteDeed(state, actor, null, 'carpet');
  actor.under = action === 'out' ? null : carpet.id;
  actor.x = carpet.x;
  actor.z = carpet.z;
  actor.moveX = 0;
  actor.moveZ = 0;
  actor.moving = false;
  actor.carpetCooldown = CARPET_COOLDOWN;
  if (action !== 'crawl') carpet.lift = CARPET_DIVE;
  refreshVision(state, actor);
  return [{ type: 'carpet', who: actor.id, carpet: carpet.id, action }];
}

function crawl(state: WorldState, actor: Participant, to: number): SimEvent[] {
  if (actor.under === null || actor.carpetCooldown > 0) return [];
  const from = state.carpets[actor.under]!;
  if (!from.links.includes(to)) return [];
  return carpetAction(state, actor, state.carpets[to]!, 'crawl');
}

function interact(state: WorldState, actor: Participant): SimEvent[] {
  if (actor.under !== null) {
    return actor.carpetCooldown > 0 ? [] : carpetAction(state, actor, state.carpets[actor.under]!, 'out');
  }
  const prompt = actor.prompt;
  if (actor.activeTask !== null || actor.watching || prompt === null) return [];
  if (prompt.kind === 'greenButton') {
    const task = state.tasks[prompt.task]!;
    task.rush = 0;
    const button = greenButton(state)!;
    return [...completeTask(state, actor, task), { type: 'newsLaunched', who: actor.id, x: button.x, z: button.z }];
  }
  if (prompt.kind === 'cameras') {
    actor.watching = true;
    return [{ type: 'camerasOpened', who: actor.id }];
  }
  if (prompt.kind === 'fix') {
    const events = fixSabotage(state, actor, prompt.point);
    if (events.length > 0) noteSeen(state, 'fixed', actor);
    if (!state.sabotage) refreshVision(state);
    return events;
  }
  if (prompt.kind === 'carpet') {
    return actor.carpetCooldown > 0 ? [] : carpetAction(state, actor, state.carpets[prompt.carpet]!, 'in');
  }
  if (prompt.kind === 'button') {
    actor.buttonUses--;
    const events = startMeeting(state, actor, null);
    refreshVision(state);
    return events;
  }
  if (prompt.kind === 'deliver') {
    const task = state.tasks[prompt.task]!;
    state.boxes = state.boxes.filter((b) => b.id !== actor.carrying);
    actor.carrying = null;
    return completeTask(state, actor, task);
  }
  if (prompt.kind === 'pickup') {
    const box = state.boxes.find((b) => b.id === prompt.box)!;
    box.carrier = actor.id;
    actor.carrying = box.id;
    rollSlip(box, state.level.seed, state.tick);
    return [{ type: 'boxPicked', who: actor.id, boxId: box.id }];
  }
  const task = state.tasks[prompt.task]!;
  if (task.kind === 'cargo') {
    task.started = true;
    const box: Box = {
      id: task.id,
      kind: 'cargo',
      x: actor.x,
      z: actor.z,
      carrier: actor.id,
      task: task.id,
      travelled: 0,
      slipAt: -1,
      inside: null,
      reported: false,
    };
    rollSlip(box, state.level.seed, state.tick);
    state.boxes.push(box);
    actor.carrying = box.id;
    return [{ type: 'boxPicked', who: actor.id, boxId: box.id }];
  }
  if (!WINDOW_TASKS.includes(task.kind)) return [];
  // The key card is picked up first and swiped at the reader by the door.
  if (takeBadge(state.stations, task)) return [{ type: 'badgeTaken', who: actor.id, taskId: task.id }];
  actor.activeTask = task.id;
  const seed = ((state.level.seed * 31 + task.id * 997 + state.tick) >>> 0) || 1;
  return [{ type: 'taskOpened', who: actor.id, taskId: task.id, kind: task.kind, seed }];
}

function computePrompt(state: WorldState, actor: Participant): Prompt | null {
  if (actor.under !== null) return null;
  // A sabotage comes before everything else, box in the wings or not.
  const fix = fixInReach(state, actor);
  if (fix !== null) return { kind: 'fix', point: fix };
  if (actor.carrying !== null) {
    const box = state.boxes.find((b) => b.id === actor.carrying)!;
    const task = state.tasks[box.task]!;
    return actor.roomId !== null && actor.roomId === task.target ? { kind: 'deliver', task: task.id } : null;
  }
  const box = boxInReach(state.boxes, actor.x, actor.z);
  if (box) return { kind: 'pickup', box: box.id };
  const rushing = rushTask(state, actor.id);
  if (rushing) {
    const button = greenButton(state);
    if (button && propDistance(button, actor.x, actor.z) <= INTERACT_RANGE) return { kind: 'greenButton', task: rushing.id };
  }
  const task = taskInReach(state.level, state.stations, state.tasks, actor.id, actor.x, actor.z);
  if (task) return { kind: 'task', task: task.id };
  if (cameraDeskInReach(state, actor)) return { kind: 'cameras' };
  if (actor.role === 'goose') {
    const carpet = carpetInReach(state.carpets, actor.x, actor.z);
    if (carpet) return { kind: 'carpet', carpet: carpet.id };
  }
  return canPressButton(state, actor) ? { kind: 'button' } : null;
}

/** The participant's news edit that waits for the Giant Green Button, if any. */
export function rushTask(state: WorldState, owner: number): Task | null {
  return state.tasks.find((t) => t.owner === owner && t.rush > 0 && !t.done) ?? null;
}

/** The Giant Green Button of the news room. */
export function greenButton(state: WorldState): Level['props'][number] | null {
  return state.level.props.find((prop) => prop.hub && prop.kind === 'greenButton') ?? null;
}

/** Next to the security desk. Anyone alive may watch, the Goose too. */
function cameraDeskInReach(state: WorldState, actor: Participant): boolean {
  if (!actor.alive) return false;
  return state.level.props.some((prop) => prop.hub && prop.kind === 'cameraDesk' && propDistance(prop, actor.x, actor.z) <= INTERACT_RANGE);
}

/** Leaves the camera screen; returns the close event or nothing. */
export function stopWatching(actor: Participant): SimEvent[] {
  if (!actor.watching) return [];
  actor.watching = false;
  return [{ type: 'camerasClosed', who: actor.id }];
}

/** Next to the meeting table, with a press left and the button cooled down. */
function canPressButton(state: WorldState, actor: Participant): boolean {
  // No calling a meeting to dodge a sabotage: fix it first.
  if (!actor.alive || actor.buttonUses <= 0 || state.buttonCooldown > 0 || state.sabotage) return false;
  const table = meetingTable(state);
  return table !== null && Math.hypot(actor.x - table.x, actor.z - table.z) <= table.radius + INTERACT_RANGE;
}

const samePrompt = (a: Prompt | null, b: Prompt | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Nearest living chick within packing reach of the Goose, or null. Cooldown does not matter here. */
function packTarget(state: WorldState, goose: Participant): number | null {
  let best: number | null = null;
  let bestDistance = PACK_RANGE;
  for (const o of state.participants) {
    if (o === goose || !o.alive || o.role !== 'chick') continue;
    const distance = Math.hypot(o.x - goose.x, o.z - goose.z);
    if (distance <= bestDistance) {
      best = o.id;
      bestDistance = distance;
    }
  }
  return best;
}

/** Moves one participant and updates its face, box and prompt. */
/**
 * One step of walking in a unit direction; true when something was in the way.
 * Axes are resolved separately so the chick slides along walls. The browser
 * uses the same step to move its own chick ahead of the server's answer.
 */
export function walk(level: Level, buckets: Buckets, p: { x: number; z: number }, dirX: number, dirZ: number, dt: number): boolean {
  const nextX = p.x + dirX * PLAYER_SPEED * dt;
  const hitX = dirX !== 0 && blocked(level, buckets, nextX, p.z, PLAYER_RADIUS);
  if (!hitX) p.x = nextX;
  const nextZ = p.z + dirZ * PLAYER_SPEED * dt;
  const hitZ = dirZ !== 0 && blocked(level, buckets, p.x, nextZ, PLAYER_RADIUS);
  if (!hitZ) p.z = nextZ;
  return hitX || hitZ;
}

function stepParticipant(state: WorldState, p: Participant, dt: number, events: SimEvent[]): void {
  const { level, buckets } = state;
  p.moving = state.phase === 'play' && p.alive && p.activeTask === null && !p.watching && p.under === null && (p.moveX !== 0 || p.moveZ !== 0);
  p.carpetCooldown = Math.max(0, p.carpetCooldown - dt);
  p.bumpCooldown = Math.max(0, p.bumpCooldown - dt);
  p.emotionTime = Math.max(0, p.emotionTime - dt);
  p.thoughtTime = Math.max(0, p.thoughtTime - dt);
  if (p.thoughtTime === 0 || !p.alive) p.thought = null;

  if (p.moving) {
    p.facing = Math.atan2(p.moveX, p.moveZ);
    p.idleTime = 0;
    const fromX = p.x;
    const fromZ = p.z;
    const hit = walk(level, buckets, p, p.moveX, p.moveZ, dt);

    if (hit) {
      // Running into something at speed leaves the chick dizzy.
      if (p.runTime > 0.3 && p.bumpCooldown === 0) {
        p.emotion = 'dizzy';
        p.emotionTime = DIZZY_TIME;
        p.bumpCooldown = DIZZY_COOLDOWN;
        events.push({ type: 'bumped', who: p.id });
      }
      p.runTime = 0;
    } else {
      p.runTime += dt;
    }

    const crossed = Math.floor(fromX * 4) !== Math.floor(p.x * 4) || Math.floor(fromZ * 4) !== Math.floor(p.z * 4);
    if (crossed) refreshVision(state, p);
  } else {
    // Standing around in plain sight for a while is something bot chicks remember.
    if (p.idleTime < BOT_IDLE_NOTE && p.idleTime + dt >= BOT_IDLE_NOTE && p.alive && p.under === null && p.activeTask === null && !p.watching && state.phase === 'play') {
      noteSeen(state, 'idle', p);
    }
    p.idleTime += dt;
    p.runTime = 0;
  }

  const roomId = roomAt(level, p.x, p.z)?.id ?? null;
  if (roomId !== p.roomId) {
    p.roomId = roomId;
    if (roomId !== null && !p.visited.includes(roomId)) p.visited.push(roomId);
    events.push({ type: 'roomChanged', who: p.id, roomId });
    if (roomId !== null && p.emotion !== 'dizzy') {
      p.emotion = 'surprised';
      p.emotionTime = SURPRISED_TIME;
    }
  }

  if (p.carrying !== null) {
    const box = state.boxes.find((b) => b.id === p.carrying)!;
    if (carryBox(box, p.x, p.z)) {
      p.carrying = null;
      p.emotion = 'surprised';
      p.emotionTime = SURPRISED_TIME;
      events.push({ type: 'boxSlipped', who: p.id, boxId: box.id });
    }
  }

  const playing = state.phase === 'play' && p.alive;
  const exposed = playing && p.under === null;
  const prompt = playing ? computePrompt(state, p) : null;
  const canReport = exposed ? (vacationInReach(state.boxes, p.x, p.z, REPORT_RANGE)?.id ?? null) : null;
  const canPack = exposed && p.role === 'goose' ? packTarget(state, p) : null;
  if (!samePrompt(prompt, p.prompt) || canReport !== p.canReport || canPack !== p.canPack) {
    p.prompt = prompt;
    p.canReport = canReport;
    p.canPack = canPack;
    events.push({ type: 'promptChanged', who: p.id });
  }

  if (p.role === 'goose' && state.phase === 'play') {
    p.packCooldown = Math.max(0, p.packCooldown - dt);
    if (p.tell > 0) p.tell = Math.max(0, p.tell - dt);
    else {
      // A sabotage makes the Goose nervous: the neck gives it away more often.
      p.tellIn -= dt * (state.sabotage ? TELL_SABOTAGE_RATE : 1);
      if (p.tellIn <= 0) {
        p.tell = TELL_TIME;
        noteTell(state, p);
        p.tellIn = TELL_MIN + ((state.tick * 7919 + p.id * 31) % 1000) / 1000 * (TELL_MAX - TELL_MIN);
      }
    }
    p.tellBubble =
      p.tell > 0 && p.under === null && state.participants.some((o) => o !== p && o.alive && Math.hypot(o.x - p.x, o.z - p.z) <= TELL_BUBBLE_RANGE);
  }

  if (p.emotionTime === 0) {
    p.emotion = p.moving ? 'happy' : p.idleTime > BORED_AFTER ? 'bored' : 'calm';
  }
}

/** Back to work: a fresh grace period for the Goose and a button cooldown for everyone. */
function endMeeting(state: WorldState, events: SimEvent[]): void {
  const ejected = state.meeting!.ejected;
  state.meeting = null;
  state.phase = 'play';
  state.buttonCooldown = BUTTON_COOLDOWN;
  state.sabotageCooldown = SABOTAGE_COOLDOWN;
  for (const p of state.participants) {
    if (p.role !== 'goose') continue;
    p.packCooldown = Math.max(p.packCooldown, PACK_COOLDOWN);
    if (p.brain) {
      p.brain.calm = GOOSE_GRACE;
      p.brain.alibi = 0;
    }
  }
  refreshVision(state);
  events.push({ type: 'meetingEnded', ejected });
}

export function step(state: WorldState, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  const send = (who: number, command: Command): SimEvent[] => applyCommand(state, who, command);
  if (state.phase === 'meeting') {
    const vote = (who: number, target: number): SimEvent[] => applyCommand(state, who, { type: 'vote', target });
    if (stepMeeting(state, dt, vote, events)) endMeeting(state, events);
  }
  for (const p of state.participants) if (p.brain) events.push(...thinkBot(state, state.nav, p, dt, send));
  for (const p of state.participants) stepParticipant(state, p, dt, events);
  state.broadcast = Math.max(0, state.broadcast - dt);
  for (const c of state.carpets) c.lift = Math.max(0, c.lift - dt);
  if (state.phase === 'play') {
    if (state.tick % PLAYER_MET_EVERY === 0) noteMet(state);
    for (const task of state.tasks) {
      if (task.rush <= 0) continue;
      task.rush -= dt;
      // A packed editor's button rush just lapses.
      if (task.rush <= 0) {
        task.rush = 0;
        if (state.participants[task.owner]!.alive) events.push({ type: 'rushFailed', who: task.owner, taskId: task.id });
      }
    }
    state.buttonCooldown = Math.max(0, state.buttonCooldown - dt);
    if (state.sabotage) state.sabotage.left -= dt;
    else state.sabotageCooldown = Math.max(0, state.sabotageCooldown - dt);
  }
  checkWin(state, events);
  state.tick++;
  return events;
}
