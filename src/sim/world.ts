import {
  ACCESSORIES,
  BORED_AFTER,
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
  TELL_TIME,
  THOUGHT_TIME,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SPAWN_SPACING,
  SURPRISED_TIME,
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
  WINDOW_TASKS,
  type Station,
  type Task,
  type TaskKind,
} from './tasks';
import { computeVisibility } from './vision';

/** What the chick's face shows; driven by what just happened to it. */
export type Emotion = 'calm' | 'happy' | 'dizzy' | 'surprised' | 'bored';

/** A short thought bubble over a participant's head; the text lives in i18n. */
export type Thought = 'doubt' | 'meh' | 'heart' | 'busy';

/** What `interact` would do right now; drives the on-screen hint. */
export type Prompt =
  | { kind: 'task'; task: number }
  | { kind: 'pickup'; box: number }
  | { kind: 'deliver'; task: number };

/** A chick, or the Goose disguised as one. */
export type Role = 'chick' | 'goose';

/** One chick in the match: the local player or a bot. */
export interface Participant {
  id: number;
  isBot: boolean;
  role: Role;
  /** False once packed into a «ГАРЯЧА ВІДПУСТКА» box. */
  alive: boolean;
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
  prompt: Prompt | null;
  /** Task whose mini-game is open; the chick stands still meanwhile, the office does not. */
  activeTask: number | null;
  /** Bot plan; null for the local player. */
  brain: Brain | null;
}

/** Match phase. The lobby is where the player picks a look before the start. */
export type Phase = 'lobby' | 'play' | 'over';
export type Winner = 'chicks' | 'goose';

export interface WorldState {
  level: Level;
  buckets: Buckets;
  /** Walkability grid bots plan their routes on. */
  nav: NavGrid;
  phase: Phase;
  participants: Participant[];
  /** 1 for every floor cell the local player currently sees. */
  visible: Uint8Array;
  /** Bumped whenever `visible` is recomputed. */
  visibleVersion: number;
  stations: Station[];
  tasks: Task[];
  boxes: Box[];
  /** Seconds left of «Екстрені Новини» on the Lobby screen; 0 when off. */
  broadcast: number;
  winner: Winner | null;
  /** Debug/testing: the local player's role at the start instead of a random one. */
  forcedRole: Role | null;
  tick: number;
}

export type Command =
  | { type: 'move'; x: number; z: number }
  | { type: 'interact' }
  | { type: 'finishTask' }
  | { type: 'cancelTask' }
  /** Lobby only: pick a look. Bots take the colours left over. */
  | { type: 'setLook'; color: number; accessory: number }
  | { type: 'start' }
  /** Goose: pack the chick within reach into a «ГАРЯЧА ВІДПУСТКА» box. */
  | { type: 'pack' }
  /** Report the vacation box within reach. Meetings follow in stage 4. */
  | { type: 'report' }
  /** Show a short thought bubble for THOUGHT_TIME seconds. */
  | { type: 'think'; thought: Thought };

export type SimEvent =
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
  | { type: 'started' }
  | { type: 'packed'; who: number; victim: number; boxId: number }
  | { type: 'reported'; who: number; boxId: number; victim: number }
  | { type: 'gameOver'; winner: Winner };

/** The participant this browser controls. */
export const LOCAL_PLAYER = 0;

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

/** Bots take every colour the player did not pick, in a seeded order, and random accessories. */
function dressBots(state: WorldState): void {
  const rng = createRng(state.level.seed ^ 0x10b5);
  const player = me(state);
  const colors = rng.shuffle(CHICK_COLORS.map((_, i) => i).filter((i) => i !== player.color));
  for (const p of state.participants) {
    if (!p.isBot) continue;
    p.color = colors[(p.id - 1) % colors.length]!;
    p.accessory = rng.int(ACCESSORIES.length);
  }
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
    prompt: null,
    activeTask: null,
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
    visible: new Uint8Array(level.size * level.size),
    visibleVersion: 1,
    stations,
    tasks,
    boxes: [],
    broadcast: 0,
    winner: null,
    forcedRole,
    tick: 0,
  };
  me(state).color = clampIndex(look.color, CHICK_COLORS.length);
  me(state).accessory = clampIndex(look.accessory, ACCESSORIES.length);
  dressBots(state);
  assignCargoTargets(level, state.tasks, seed);
  computeVisibility(level, me(state).x, me(state).z, state.visible);
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
      actor.color = clampIndex(command.color, CHICK_COLORS.length);
      actor.accessory = clampIndex(command.accessory, ACCESSORIES.length);
      dressBots(state);
      return [{ type: 'looksChanged' }];
    }
    case 'start': {
      if (state.phase !== 'lobby' || actor.isBot) return [];
      state.phase = 'play';
      dealRoles(state);
      return [{ type: 'started' }];
    }
    case 'interact':
      return state.phase === 'play' && actor.alive ? interact(state, actor) : [];
    case 'pack':
      return state.phase === 'play' ? pack(state, actor) : [];
    case 'report':
      return state.phase === 'play' ? report(state, actor) : [];
    case 'think':
      if (state.phase !== 'play' || !actor.alive) return [];
      actor.thought = command.thought;
      actor.thoughtTime = THOUGHT_TIME;
      return [];
    case 'finishTask':
    case 'cancelTask': {
      if (actor.activeTask === null) return [];
      const task = state.tasks[actor.activeTask]!;
      const done = command.type === 'finishTask';
      actor.activeTask = null;
      const events: SimEvent[] = [{ type: 'taskClosed', who: actor.id, taskId: task.id, done }];
      if (done) events.push(...completeTask(state, actor, task));
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
  victim.alive = false;
  victim.moving = false;
  victim.moveX = 0;
  victim.moveZ = 0;
  victim.activeTask = null;
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
  return [{ type: 'packed', who: actor.id, victim: victim.id, boxId: box.id }];
}

function report(state: WorldState, actor: Participant): SimEvent[] {
  if (!actor.alive || actor.canReport === null) return [];
  const box = state.boxes.find((b) => b.id === actor.canReport);
  if (!box || box.reported) return [];
  box.reported = true;
  actor.canReport = null;
  return [{ type: 'reported', who: actor.id, boxId: box.id, victim: box.inside! }];
}

/** Vacation box ids sit above every task id. */
const VACATION_BOX_BASE = 10_000;

/**
 * Shared bar: chick tasks only (the Goose's list is a cover). Unfinished tasks
 * of packed chicks drop out, so the bar can still be filled by the rest.
 */
export function progress(state: WorldState): number {
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
  if (geese > 0 && chicks <= geese) winner = 'goose';
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
  const events: SimEvent[] = [{ type: 'taskDone', who: actor.id, taskId: task.id }];
  // A visual task: everyone in the Lobby sees the news, which vouches for the editor.
  if (task.kind === 'news') {
    state.broadcast = NEWS_BROADCAST_TIME;
    events.push({ type: 'broadcastStarted' });
  }
  return events;
}

function interact(state: WorldState, actor: Participant): SimEvent[] {
  const prompt = actor.prompt;
  if (actor.activeTask !== null || prompt === null) return [];
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
  actor.activeTask = task.id;
  const seed = ((state.level.seed * 31 + task.id * 997 + state.tick) >>> 0) || 1;
  return [{ type: 'taskOpened', who: actor.id, taskId: task.id, kind: task.kind, seed }];
}

function computePrompt(state: WorldState, actor: Participant): Prompt | null {
  if (actor.carrying !== null) {
    const box = state.boxes.find((b) => b.id === actor.carrying)!;
    const task = state.tasks[box.task]!;
    return actor.roomId !== null && actor.roomId === task.target ? { kind: 'deliver', task: task.id } : null;
  }
  const box = boxInReach(state.boxes, actor.x, actor.z);
  if (box) return { kind: 'pickup', box: box.id };
  const task = taskInReach(state.level, state.stations, state.tasks, actor.id, actor.x, actor.z);
  return task ? { kind: 'task', task: task.id } : null;
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
function stepParticipant(state: WorldState, p: Participant, dt: number, events: SimEvent[]): void {
  const { level, buckets } = state;
  p.moving = state.phase === 'play' && p.alive && p.activeTask === null && (p.moveX !== 0 || p.moveZ !== 0);
  p.bumpCooldown = Math.max(0, p.bumpCooldown - dt);
  p.emotionTime = Math.max(0, p.emotionTime - dt);
  p.thoughtTime = Math.max(0, p.thoughtTime - dt);
  if (p.thoughtTime === 0 || !p.alive) p.thought = null;

  if (p.moving) {
    p.facing = Math.atan2(p.moveX, p.moveZ);
    p.idleTime = 0;
    const fromX = p.x;
    const fromZ = p.z;
    // Axes are resolved separately so the chick slides along walls.
    const nextX = p.x + p.moveX * PLAYER_SPEED * dt;
    const hitX = p.moveX !== 0 && blocked(level, buckets, nextX, p.z, PLAYER_RADIUS);
    if (!hitX) p.x = nextX;
    const nextZ = p.z + p.moveZ * PLAYER_SPEED * dt;
    const hitZ = p.moveZ !== 0 && blocked(level, buckets, p.x, nextZ, PLAYER_RADIUS);
    if (!hitZ) p.z = nextZ;

    if (hitX || hitZ) {
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
    if (p.id === LOCAL_PLAYER && crossed) {
      computeVisibility(level, p.x, p.z, state.visible);
      state.visibleVersion++;
    }
  } else {
    p.idleTime += dt;
    p.runTime = 0;
  }

  const roomId = roomAt(level, p.x, p.z)?.id ?? null;
  if (roomId !== p.roomId) {
    p.roomId = roomId;
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
  const prompt = playing ? computePrompt(state, p) : null;
  const canReport = playing ? (vacationInReach(state.boxes, p.x, p.z, REPORT_RANGE)?.id ?? null) : null;
  const canPack = playing && p.role === 'goose' ? packTarget(state, p) : null;
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
      p.tellIn -= dt;
      if (p.tellIn <= 0) {
        p.tell = TELL_TIME;
        p.tellIn = TELL_MIN + ((state.tick * 7919 + p.id * 31) % 1000) / 1000 * (TELL_MAX - TELL_MIN);
      }
    }
    p.tellBubble =
      p.tell > 0 && state.participants.some((o) => o !== p && o.alive && Math.hypot(o.x - p.x, o.z - p.z) <= TELL_BUBBLE_RANGE);
  }

  if (p.emotionTime === 0) {
    p.emotion = p.moving ? 'happy' : p.idleTime > BORED_AFTER ? 'bored' : 'calm';
  }
}

export function step(state: WorldState, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  const send = (who: number, command: Command): SimEvent[] => applyCommand(state, who, command);
  for (const p of state.participants) if (p.brain) events.push(...thinkBot(state, state.nav, p, dt, send));
  for (const p of state.participants) stepParticipant(state, p, dt, events);
  state.broadcast = Math.max(0, state.broadcast - dt);
  checkWin(state, events);
  state.tick++;
  return events;
}
