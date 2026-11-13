import {
  BOT_AVOID_TIME,
  BOT_GIVE_UP,
  BOT_REPORT_SIGHT,
  HUNT_ALONE_RADIUS,
  BOT_IDLE_MAX,
  BOT_IDLE_MIN,
  BOT_START_DELAY,
  BOT_STUCK_DISTANCE,
  BOT_TASK_MAX,
  BOT_TASK_MIN,
  CARPET_ESCAPE_RANGE,
  CARPET_HIDE_LIMIT,
  CARPET_HIDE_MAX,
  CARPET_HIDE_MIN,
  GOOSE_ABORT_CHANCE,
  GOOSE_ALIBI_MAX,
  GOOSE_ALIBI_MIN,
  GOOSE_DROP_ALIBI_MAX,
  GOOSE_DROP_ALIBI_MIN,
  GOOSE_FAKE_MAX,
  GOOSE_FAKE_MIN,
  GOOSE_GRACE,
  GOOSE_MEMORY,
  GOOSE_PACK_FREEZE,
  GOOSE_PAUSE_EVERY,
  GOOSE_PAUSE_MAX,
  GOOSE_PAUSE_MIN,
  GOOSE_SIGHT_ANGLE,
  GOOSE_SIGHT_RANGE,
  GOOSE_SPOTTED_ANGLE,
  GOOSE_SPOTTED_RANGE,
  GOOSE_STALK_GAP,
  GOOSE_STALK_MAX,
  GOOSE_STALK_MIN,
  GOOSE_TRUST_CHANCE,
  GOOSE_TRUST_RANGE,
  GOOSE_TRUST_WINDOW,
  GOOSE_WHIM_CHANCE,
  GOOSE_WORK_SIGHT_ANGLE,
  BOT_FIX_CHANCE,
  GOOSE_SABOTAGE_MIN,
  GOOSE_SABOTAGE_MAX,
  INTERACT_RANGE,
  BOT_COMPANY_RANGE,
  BOT_WARY_RANGE,
  BOT_WARY_REST,
  BOT_WARY_TIME,
  BOT_DUCT_CHANCE,
  BOT_DUCT_FAR,
  BOT_DUCT_RANGE,
  BOT_TABLET_DELAY,
  TABLET_FRESH,
  TABLET_RECENT,
  TICK,
  GOOSE_BOT_SKILL_EVERY,
  GOOSE_MASK_MIN,
  MORPH_TIME,
} from '../config';
import { tabletStatus, tagTarget } from './professions';
import { skillActive, spotFeather, unseen } from './roulette';
import { cellCentre, findPath, fitsIn, nearestFree, type NavGrid } from './nav';
import { createRng, type Rng } from './rng';
import { WINDOW_TASKS } from './tasks';
import { meetingTable, noteBox, type Suspicion } from './meeting';
import type { Note } from './notes';
import type { RoomType } from './prefabs';
import { canSee } from './vision';
import { openFixPoints, propDistance, SABOTAGE_KINDS, sightRadius } from './sabotage';
import type { Command, Participant, SimEvent, Thought, WorldState } from './world';

/** What a bot is heading for. */
export type Goal =
  | { kind: 'task'; task: number }
  | { kind: 'deliver'; task: number }
  | { kind: 'pickup'; box: number }
  | { kind: 'wander' }
  /** Goose: stalk a lone chick. */
  | { kind: 'hunt'; target: number }
  /** Goose: stand at one of its own desks pretending to work. */
  | { kind: 'pose'; task: number }
  /** Chick alone with its suspect: walk over to this other participant. */
  | { kind: 'flee'; to: number }
  /** Chick that saw a pack: press the red meeting button. */
  | { kind: 'button' }
  /** Goose: get to this rug to escape under it. */
  | { kind: 'carpet'; carpet: number }
  /** Dash to the Giant Green Button after a news edit. */
  | { kind: 'green'; task: number }
  /** Chick: walk over to a vacation box it saw. */
  | { kind: 'report'; box: number }
  /** Chick: run to a sabotage fix point (prop index). */
  | { kind: 'fix'; point: number };

/** A bot's plan; plain data so the whole world stays serialisable. */
export interface Brain {
  goal: Goal | null;
  /** Remaining waypoints, metres. */
  path: { x: number; z: number }[];
  /** Seconds to stand still before thinking again. */
  wait: number;
  /** Seconds left at a window task before the bot reports it done. */
  work: number;
  /** Stuck detection: position one second ago and the time since. */
  checkX: number;
  checkZ: number;
  checkTime: number;
  /** The last waypoint was reached; now waiting for the goal's prompt. */
  arrived: boolean;
  /** Seconds spent at the goal without the matching prompt. */
  atGoal: number;
  /** A task given up on for a while (someone else's box in the way, etc.). */
  avoid: number | null;
  avoidLeft: number;
  /** Goose only. Seconds of play so far. */
  age: number;
  /** Seconds left before hunting is allowed (match start; meetings from stage 4). */
  calm: number;
  /** Seconds left of playing a model worker after a pack or a dropped hunt. */
  alibi: number;
  /** Seconds left standing at a desk; the Goose has tunnel vision meanwhile. */
  fake: number;
  /** Desk task the Goose poses at next. */
  poseTask: number | null;
  /** Chick being stalked, where the Goose last saw it, and seconds since. */
  prey: number | null;
  preyX: number;
  preyZ: number;
  preyUnseen: number;
  /** Seconds of keeping a distance left; 0 means closing in. */
  stalk: number;
  /** Seconds until the next hesitation stop. */
  pauseIn: number;
  /** `stalk` value at which the Goose drops the hunt for no reason; -1 for never. */
  abortAt: number;
  /** The prey turned or a third one came; the Goose rolled on it once already. */
  spooked: boolean;
  /** This stalk ends with a heart instead of a pack. */
  bait: boolean;
  /** Goose: rug to escape under after a pack, or null. */
  escape: number | null;
  /** Goose under a rug: seconds until it crawls on or climbs out, total time hidden, crawled yet. */
  hideLeft: number;
  hidden: number;
  crawled: boolean;
  /** Goose only: seconds it still waits, once allowed, before starting a sabotage; -1 until rolled. */
  sabotageIn: number;
  /** Chick only: what it saw that points at someone; brought up at the next meeting. */
  suspicion: Suspicion | null;
  /** Chick only: seconds left of walking away from its suspect, and until it may bolt again. */
  wary: number;
  waryRest: number;
  /** Sightings since the last meeting, newest first; turned into meeting lines. */
  notes: Note[];
  /** Chick: the Streamer's box whose siren it heard; it runs there to report. */
  heard: number | null;
  /** Team Lead: the chick its tablet showed freshly packed; told at the next meeting. */
  tabletSaw: number | null;
  /** SysAdmin under a rug: where it is really going, to crawl that way. */
  duct: { x: number; z: number } | null;
  /** Chick: a feather or a plant shaking by itself it noticed; told at the next meeting. */
  clue: { kind: 'feather' | 'rustle'; room: RoomType | null } | null;
}

export function createBrain(rng: Rng): Brain {
  return {
    goal: null,
    path: [],
    wait: rng.next() * BOT_START_DELAY,
    work: 0,
    checkX: 0,
    checkZ: 0,
    checkTime: 0,
    arrived: false,
    atGoal: 0,
    avoid: null,
    avoidLeft: 0,
    age: 0,
    calm: GOOSE_GRACE,
    alibi: 0,
    fake: 0,
    poseTask: null,
    prey: null,
    preyX: 0,
    preyZ: 0,
    preyUnseen: 0,
    stalk: 0,
    pauseIn: 0,
    abortAt: -1,
    spooked: false,
    bait: false,
    suspicion: null,
    wary: 0,
    waryRest: 0,
    notes: [],
    // Rolled on first use, so the brains' start-up rolls stay as they were.
    sabotageIn: -1,
    escape: null,
    hideLeft: 0,
    hidden: 0,
    crawled: false,
    heard: null,
    tabletSaw: null,
    duct: null,
    clue: null,
  };
}

type Send = (who: number, command: Command) => SimEvent[];

const between = (rng: Rng, a: number, b: number): number => a + rng.next() * (b - a);

/** Free cells next to a station, close enough to get its prompt, best first. */
function standCells(state: WorldState, nav: NavGrid, propIndex: number): number[] {
  const prop = state.level.props[propIndex]!;
  const found: { cell: number; d: number }[] = [];
  const reach = Math.ceil((Math.max(prop.w, prop.d) / 2 + INTERACT_RANGE) / nav.step) + 1;
  const cx = Math.floor(prop.x / nav.step);
  const cz = Math.floor(prop.z / nav.step);
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const gx = cx + dx;
      const gz = cz + dz;
      if (gx < 0 || gz < 0 || gx >= nav.cols || gz >= nav.cols) continue;
      const cell = gz * nav.cols + gx;
      if (nav.free[cell] !== 1) continue;
      const c = cellCentre(nav, cell);
      const d = propDistance(prop, c.x, c.z);
      if (d <= INTERACT_RANGE - 0.3) found.push({ cell, d });
    }
  }
  return found.sort((a, b) => a.d - b.d).map((f) => f.cell);
}

function roomCell(state: WorldState, nav: NavGrid, roomId: number, rng: Rng): number {
  const room = state.level.rooms[roomId]!;
  // A few tries at random spots inside the room's bounds; fall back to its centre.
  for (let i = 0; i < 6; i++) {
    const x = room.cx + (rng.next() - 0.5) * 8;
    const z = room.cz + (rng.next() - 0.5) * 8;
    const cell = nearestFree(nav, x, z, 4);
    if (cell >= 0 && state.level.zone[Math.floor(cellCentre(nav, cell).z) * state.level.size + Math.floor(cellCentre(nav, cell).x)] === roomId) {
      return cell;
    }
  }
  return nearestFree(nav, room.cx, room.cz, 12);
}

/** Nobody but the victim could see the Goose do it. */
function unwatched(state: WorldState, goose: Participant, victim: Participant): boolean {
  return state.participants.every(
    (o) => o === goose || o === victim || !o.alive || !canSee(state.level, o.x, o.z, goose.x, goose.z, sightRadius(state)),
  );
}

/** Angle between a heading and the direction from (ax, az) to (bx, bz), degrees. */
function offHeading(facing: number, ax: number, az: number, bx: number, bz: number): number {
  const along = Math.sin(facing) * (bx - ax) + Math.cos(facing) * (bz - az);
  const across = Math.cos(facing) * (bx - ax) - Math.sin(facing) * (bz - az);
  return Math.abs(Math.atan2(across, along)) * (180 / Math.PI);
}

/** The bot Goose sees someone: inside its cone (any direction for its tracked prey), close enough, no wall between. */
export function gooseSees(state: WorldState, goose: Participant, other: Participant, tracking = false): boolean {
  const cone = goose.brain && goose.brain.fake > 0 ? GOOSE_WORK_SIGHT_ANGLE : GOOSE_SIGHT_ANGLE;
  if (Math.hypot(other.x - goose.x, other.z - goose.z) > GOOSE_SIGHT_RANGE) return false;
  // Once it has picked its prey it keeps its eyes on it: only walls and distance lose it.
  if (!tracking && offHeading(goose.facing, goose.x, goose.z, other.x, other.z) > cone / 2) return false;
  return canSee(state.level, goose.x, goose.z, other.x, other.z, sightRadius(state));
}

/** Somebody besides the prey is near it, or the prey looks right at the Goose. */
function spooked(state: WorldState, goose: Participant, prey: Participant): boolean {
  const faces =
    Math.hypot(prey.x - goose.x, prey.z - goose.z) < GOOSE_SPOTTED_RANGE &&
    offHeading(prey.facing, prey.x, prey.z, goose.x, goose.z) < GOOSE_SPOTTED_ANGLE;
  return faces || crowded(state, goose, prey);
}

function crowded(state: WorldState, goose: Participant, c: Participant): boolean {
  return state.participants.some(
    (o) => o !== c && o !== goose && o.alive && Math.hypot(o.x - c.x, o.z - c.z) < HUNT_ALONE_RADIUS,
  );
}

/** A living chick the Goose sees with nobody else around it, nearest first; null when none. */
function loneChick(state: WorldState, goose: Participant): Participant | null {
  let best: Participant | null = null;
  let bestD = Infinity;
  for (const c of state.participants) {
    if (!c.alive || c.role !== 'chick' || !gooseSees(state, goose, c)) continue;
    if (crowded(state, goose, c)) continue;
    const d = Math.hypot(c.x - goose.x, c.z - goose.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** An unreported vacation box the chick can see nearby. */
function seenVacation(state: WorldState, bot: Participant): number | null {
  for (const box of state.boxes) {
    if (box.kind !== 'vacation' || box.reported) continue;
    if (Math.hypot(box.x - bot.x, box.z - bot.z) > BOT_REPORT_SIGHT) continue;
    if (canSee(state.level, bot.x, bot.z, box.x, box.z, sightRadius(state))) {
      noteBox(state, bot, box.x, box.z);
      return box.id;
    }
  }
  return null;
}

/**
 * The fix point this chick runs to, or null. Most chicks answer a sabotage, a few
 * keep working; which ones is fixed per sabotage, and they spread over the points.
 */
function fixGoal(state: WorldState, bot: Participant): number | null {
  const sabotage = state.sabotage;
  if (!sabotage) return null;
  const roll = (((sabotage.id + 1) * 2654435761 + bot.id * 40503) >>> 0) % 1000;
  if (roll >= BOT_FIX_CHANCE * 1000) return null;
  const open = openFixPoints(state, bot);
  return open.length > 0 ? open[bot.id % open.length]! : null;
}

/** The nearest living participant who is not the bot's suspect: someone to stand next to. */
function company(state: WorldState, bot: Participant): number | null {
  const suspect = bot.brain!.suspicion?.who ?? -1;
  let best: number | null = null;
  let bestD = Infinity;
  for (const o of state.participants) {
    if (o === bot || o.id === suspect || !o.alive || unseen(o)) continue;
    const d = Math.hypot(o.x - bot.x, o.z - bot.z);
    if (d < bestD) {
      best = o.id;
      bestD = d;
    }
  }
  return best;
}

/** A bot chick left alone in sight of its suspect gets nervous; true when it should walk off now. */
function aloneWithSuspect(state: WorldState, bot: Participant): boolean {
  const s = bot.brain!.suspicion;
  if (!s) return false;
  const suspect = state.participants[s.who]!;
  if (!suspect.alive || unseen(suspect)) return false;
  if (!canSee(state.level, bot.x, bot.z, suspect.x, suspect.z, Math.min(BOT_WARY_RANGE, sightRadius(state)))) return false;
  return !state.participants.some(
    (o) => o !== bot && o !== suspect && o.alive && !unseen(o) && canSee(state.level, bot.x, bot.z, o.x, o.z, Math.min(BOT_COMPANY_RANGE, sightRadius(state))),
  );
}

function chooseGoal(state: WorldState, bot: Participant, avoid: number | null): Goal {
  if (bot.role === 'goose') {
    // The Goose's task list is a cover: it only poses at its desks, strolls and stalks.
    const brain = bot.brain!;
    if (brain.escape !== null) return { kind: 'carpet', carpet: brain.escape };
    if (brain.prey !== null) return { kind: 'hunt', target: brain.prey };
    if ((brain.alibi > 0 || brain.calm > 0) && brain.poseTask !== null) return { kind: 'pose', task: brain.poseTask };
    return { kind: 'wander' };
  }
  const seen = seenVacation(state, bot);
  if (seen !== null) return { kind: 'report', box: seen };
  const brain = bot.brain;
  if (brain && brain.heard !== null) {
    // The Streamer's siren points at its box: everyone near runs there.
    if (state.boxes.some((b) => b.id === brain.heard && !b.reported)) return { kind: 'report', box: brain.heard };
    brain.heard = null;
  }
  const sure = (brain?.suspicion?.level === 2 && state.participants[brain.suspicion.who]!.alive) || (brain?.tabletSaw ?? null) !== null;
  if (brain && brain.escape !== null) return { kind: 'carpet', carpet: brain.escape };
  if (sure && bot.buttonUses > 0 && state.buttonCooldown === 0 && bot.carrying === null) return { kind: 'button' };
  const fix = fixGoal(state, bot);
  if (fix !== null) return { kind: 'fix', point: fix };
  if (bot.brain && bot.brain.wary > 0) {
    const friend = company(state, bot);
    if (friend !== null) return { kind: 'flee', to: friend };
  }
  if (bot.carrying !== null) {
    const box = state.boxes.find((b) => b.id === bot.carrying)!;
    return { kind: 'deliver', task: box.task };
  }
  const rushing = state.tasks.find((t) => t.owner === bot.id && t.rush > 0 && !t.done);
  if (rushing) return { kind: 'green', task: rushing.id };
  const dropped = state.boxes.find((b) => b.kind === 'cargo' && b.carrier === null && state.tasks[b.task]!.owner === bot.id);
  if (dropped) return { kind: 'pickup', box: dropped.id };
  const task = state.tasks.find((t) => t.owner === bot.id && !t.done && !t.started && t.id !== avoid);
  return task ? { kind: 'task', task: task.id } : { kind: 'wander' };
}

/** Candidate end cells for a goal; the first one with a route wins. */
function destinations(state: WorldState, nav: NavGrid, bot: Participant, goal: Goal, rng: Rng): number[] {
  switch (goal.kind) {
    case 'task': {
      // Spread the tries around the desk: some spots near it can be closed-in pockets.
      const cells = standCells(state, nav, state.stations[state.tasks[goal.task]!.station]!.prop);
      const picks: number[] = [];
      for (let i = 0; i < cells.length && picks.length < STAND_TRIES; i += Math.max(1, Math.floor(cells.length / STAND_TRIES))) {
        picks.push(cells[i]!);
      }
      return picks;
    }
    case 'deliver': {
      const target = state.tasks[goal.task]!.target;
      return target === null ? [] : [roomCell(state, nav, target, rng)];
    }
    case 'pickup': {
      const box = state.boxes.find((b) => b.id === goal.box);
      return box ? [nearestFree(nav, box.x, box.z, 4)] : [];
    }
    case 'wander': {
      if (bot.role === 'goose') {
        // The Goose prowls where chicks still have work to do: it knows the desks too.
        const open = state.tasks.filter((t) => !t.done && t.owner !== bot.id && state.participants[t.owner]!.alive);
        if (open.length > 0) return [roomCell(state, nav, state.stations[open[rng.int(open.length)]!.station]!.room, rng)];
      }
      return [roomCell(state, nav, rng.int(state.level.rooms.length), rng)];
    }
    case 'flee': {
      const friend = state.participants[goal.to]!;
      return [nearestFree(nav, friend.x, friend.z, 4)];
    }
    case 'hunt': {
      // Where the Goose last saw its prey, not where the prey really is.
      const brain = bot.brain!;
      return [nearestFree(nav, brain.preyX, brain.preyZ, 4)];
    }
    case 'button': {
      const table = meetingTable(state);
      if (!table) return [];
      const r = table.radius + 0.7;
      return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => nearestFree(nav, table.x + Math.sin(i * 0.785) * r, table.z + Math.cos(i * 0.785) * r, 2));
    }
    case 'carpet': {
      const c = state.carpets[goal.carpet]!;
      return [nearestFree(nav, c.x, c.z, 2)];
    }
    case 'pose': {
      const cells = standCells(state, nav, state.stations[state.tasks[goal.task]!.station]!.prop);
      return cells.slice(0, STAND_TRIES);
    }
    case 'report': {
      const box = state.boxes.find((b) => b.id === goal.box);
      return box ? [nearestFree(nav, box.x, box.z, 4)] : [];
    }
    case 'fix':
      return standCells(state, nav, goal.point).slice(0, STAND_TRIES);
    case 'green': {
      const index = state.level.props.findIndex((p) => p.hub && p.kind === 'greenButton');
      return index < 0 ? [] : standCells(state, nav, index).slice(0, STAND_TRIES);
    }
  }
}

const STAND_TRIES = 6;
/** How close counts as reaching a waypoint; small, so a bot really steps around corners. */
const WAYPOINT_REACH = 0.12;

/** True when the bot's current prompt is the one its goal needs. */
function promptFits(bot: Participant, goal: Goal): boolean {
  const p = bot.prompt;
  if (!p) return false;
  if (goal.kind === 'task') return p.kind === 'task' && p.task === goal.task;
  if (goal.kind === 'deliver') return p.kind === 'deliver';
  if (goal.kind === 'pickup') return p.kind === 'pickup' && p.box === goal.box;
  if (goal.kind === 'button') return p.kind === 'button';
  if (goal.kind === 'green') return p.kind === 'greenButton';
  if (goal.kind === 'carpet') return p.kind === 'carpet' && p.carpet === goal.carpet;
  if (goal.kind === 'fix') return p.kind === 'fix' && p.point === goal.point;
  return false;
}

/** A random desk task of the Goose's own cover list. */
function pickPose(state: WorldState, goose: Participant, rng: Rng): number | null {
  const own = state.tasks.filter((t) => t.owner === goose.id);
  return own.length > 0 ? own[rng.int(own.length)]!.id : null;
}

/** The hunt is over (packed or dropped): play a model worker for a while. */
/** The nearest rug within escape range, or null. */
function escapeCarpet(state: WorldState, goose: Participant): number | null {
  let best: number | null = null;
  let bestD = CARPET_ESCAPE_RANGE;
  for (const c of state.carpets) {
    const d = Math.hypot(c.x - goose.x, c.z - goose.z);
    if (d < bestD) {
      best = c.id;
      bestD = d;
    }
  }
  return best;
}

function endHunt(brain: Brain, rng: Rng, packed: boolean): void {
  brain.prey = null;
  brain.stalk = 0;
  brain.bait = false;
  brain.goal = null;
  brain.path = [];
  brain.alibi = packed
    ? between(rng, GOOSE_ALIBI_MIN, GOOSE_ALIBI_MAX)
    : between(rng, GOOSE_DROP_ALIBI_MIN, GOOSE_DROP_ALIBI_MAX);
}

/**
 * Bot Goose bookkeeping before the shared bot logic: timers, what it sees and remembers,
 * standing at a desk, spotting new prey. True when this tick is fully handled.
 */
function gooseMind(
  state: WorldState,
  bot: Participant,
  dt: number,
  rng: Rng,
  halt: () => void,
  send: Send,
  events: SimEvent[],
): boolean {
  const brain = bot.brain!;
  if (bot.under !== null) {
    // Hiding: crawl on once, then climb out when nobody would see it (or it gets bored).
    brain.hideLeft -= dt;
    brain.hidden += dt;
    if (brain.hideLeft > 0 || bot.carpetCooldown > 0) return true;
    const here = state.carpets[bot.under]!;
    if (!brain.crawled && here.links.length > 0) {
      brain.crawled = true;
      brain.hideLeft = between(rng, CARPET_HIDE_MIN, CARPET_HIDE_MAX);
      events.push(...send(bot.id, { type: 'crawl', to: here.links[rng.int(here.links.length)]! }));
    } else if (unwatched(state, bot, bot) || brain.hidden > CARPET_HIDE_LIMIT) {
      events.push(...send(bot.id, { type: 'interact' }));
    } else {
      brain.hideLeft = 0.5;
    }
    return true;
  }
  brain.age += dt;
  brain.calm = Math.max(0, brain.calm - dt);
  brain.alibi = Math.max(0, brain.alibi - dt);
  if (brain.poseTask === null) brain.poseTask = pickPose(state, bot, rng);
  // Sabotage whenever it is allowed, after a pause of its own.
  if (!state.sabotage && state.sabotageCooldown === 0) {
    if (brain.sabotageIn < 0) brain.sabotageIn = between(rng, GOOSE_SABOTAGE_MIN, GOOSE_SABOTAGE_MAX);
    brain.sabotageIn -= dt;
    if (brain.sabotageIn <= 0) {
      brain.sabotageIn = -1;
      events.push(...send(bot.id, { type: 'sabotage', kind: SABOTAGE_KINDS[rng.int(SABOTAGE_KINDS.length)]! }));
    }
  }

  // A borrowed look comes off where nobody sees the glitch, once it has served a while.
  if (bot.disguise !== null && bot.glitch === 0 && bot.disguiseLeft < MORPH_TIME - GOOSE_MASK_MIN && unwatched(state, bot, bot)) {
    events.push(...send(bot.id, { type: 'skill' }));
  }
  // Now and then, unseen, it spins the roulette just to stir things up.
  if (bot.skillCooldown === 0 && !skillActive(bot) && rng.next() < dt / GOOSE_BOT_SKILL_EVERY && unwatched(state, bot, bot)) {
    events.push(...send(bot.id, { type: 'skill' }));
  }

  if (brain.prey !== null) {
    const prey = state.participants[brain.prey]!;
    if (!prey.alive) {
      brain.prey = null;
    } else if (gooseSees(state, bot, prey, true)) {
      brain.preyX = prey.x;
      brain.preyZ = prey.z;
      brain.preyUnseen = 0;
    } else {
      // Out of sight: it only remembers the spot for a few seconds, then forgets.
      brain.preyUnseen += dt;
      if (brain.preyUnseen > GOOSE_MEMORY) {
        brain.prey = null;
        brain.bait = false;
        brain.stalk = 0;
      }
    }
  }

  if (brain.fake > 0) {
    brain.fake = Math.max(0, brain.fake - dt);
    halt();
    return true;
  }

  // Free to hunt: look for a lone chick, or switch to one when the current prey got company.
  const busyPrey = brain.prey !== null && crowded(state, bot, state.participants[brain.prey]!);
  if ((brain.prey === null || busyPrey) && brain.wait <= 0 && brain.alibi === 0 && brain.calm === 0 && bot.packCooldown < 3) {
    const chick = loneChick(state, bot);
    if (chick && chick.id !== brain.prey) {
      brain.prey = chick.id;
      brain.preyX = chick.x;
      brain.preyZ = chick.z;
      brain.preyUnseen = 0;
      brain.stalk = between(rng, GOOSE_STALK_MIN, GOOSE_STALK_MAX);
      brain.pauseIn = GOOSE_PAUSE_EVERY * between(rng, 0.5, 1);
      brain.abortAt = rng.next() < GOOSE_WHIM_CHANCE ? rng.next() * brain.stalk : -1;
      // Only a change counts: a chick already looking its way does not scare it off.
      brain.spooked = spooked(state, bot, chick);
      brain.bait = brain.age < GOOSE_TRUST_WINDOW && rng.next() < GOOSE_TRUST_CHANCE;
    }
  }
  return false;
}

/**
 * A bot chick's profession: the Analyst tags whoever comes close, the Team Lead
 * glances at its tablet, the SysAdmin crawls under rugs. True when this tick is fully handled.
 */
function chickSkills(state: WorldState, bot: Participant, dt: number, rng: Rng, send: Send, events: SimEvent[]): boolean {
  const brain = bot.brain!;
  if (bot.under !== null) {
    // Under a rug: crawl once towards where it is going, then climb out (the dust decides the rest).
    brain.hideLeft -= dt;
    if (brain.hideLeft > 0 || bot.carpetCooldown > 0) return true;
    const here = state.carpets[bot.under]!;
    const duct = brain.duct;
    if (!brain.crawled && duct && here.links.length > 0) {
      brain.crawled = true;
      brain.hideLeft = between(rng, 1, 2);
      const far = (id: number): number => Math.hypot(state.carpets[id]!.x - duct.x, state.carpets[id]!.z - duct.z);
      const best = here.links.reduce((a, b) => (far(b) < far(a) ? b : a));
      if (far(best) < far(here.id)) {
        events.push(...send(bot.id, { type: 'crawl', to: best }));
        return true;
      }
    }
    brain.duct = null;
    brain.goal = null;
    brain.path = [];
    events.push(...send(bot.id, { type: 'interact' }));
    return true;
  }
  spotFeather(state, bot);
  if (bot.profession === 'analyst' && bot.skillCooldown === 0 && tagTarget(state, bot) !== null) {
    events.push(...send(bot.id, { type: 'skill' }));
  } else if (bot.profession === 'lead' && bot.charged && bot.tablet === 0 && rng.next() < dt / BOT_TABLET_DELAY) {
    events.push(...send(bot.id, { type: 'skill' }));
    // A fresh holiday nobody has reported yet: that is worth a meeting.
    for (const o of state.participants) {
      if (tabletStatus(o, state.tick, TICK, TABLET_FRESH, TABLET_RECENT) !== 'fresh') continue;
      if (state.boxes.some((b) => b.inside === o.id && !b.reported)) brain.tabletSaw = o.id;
    }
  }
  return false;
}

/** SysAdmin heading far away: maybe take the cable duct, from a rug close by towards a rug near the goal. */
function planDuct(state: WorldState, bot: Participant, task: number, rng: Rng): void {
  const brain = bot.brain!;
  if (bot.skillCooldown > 0 || brain.escape !== null || bot.carrying !== null) return;
  const prop = state.level.props[state.stations[state.tasks[task]!.station]!.prop]!;
  const far = Math.hypot(prop.x - bot.x, prop.z - bot.z);
  if (far < BOT_DUCT_FAR) return;
  const near = state.carpets.find((c) => Math.hypot(c.x - bot.x, c.z - bot.z) <= BOT_DUCT_RANGE);
  if (!near || near.links.length === 0) return;
  const gain = Math.min(...near.links.map((id) => Math.hypot(state.carpets[id]!.x - prop.x, state.carpets[id]!.z - prop.z)));
  if (gain > far - BOT_DUCT_RANGE * 2 || rng.next() >= BOT_DUCT_CHANCE) return;
  brain.escape = near.id;
  brain.duct = { x: prop.x, z: prop.z };
}

/** One bot's decision for this tick. Bots act only through `send`, the same commands the player uses. */
export function thinkBot(state: WorldState, nav: NavGrid, bot: Participant, dt: number, send: Send): SimEvent[] {
  const brain = bot.brain;
  if (!brain || state.phase !== 'play' || !bot.alive) return [];
  const rng = createRng(((state.level.seed * 7919 + bot.id * 104729 + state.tick) >>> 0) || 1);
  const events: SimEvent[] = [];
  const halt = (): void => {
    if (bot.moveX !== 0 || bot.moveZ !== 0) events.push(...send(bot.id, { type: 'move', x: 0, z: 0 }));
  };

  if (bot.role === 'goose' && gooseMind(state, bot, dt, rng, halt, send, events)) return events;
  if (bot.role === 'chick' && chickSkills(state, bot, dt, rng, send, events)) return events;

  if (bot.activeTask !== null) {
    brain.work -= dt;
    if (brain.work <= 0) {
      events.push(...send(bot.id, { type: 'finishTask' }));
      brain.goal = null;
      // No dawdling when the Giant Green Button is waiting.
      brain.wait = state.tasks.some((t) => t.owner === bot.id && t.rush > 0) ? 0 : between(rng, 0.3, 1);
    }
    return events;
  }
  if (brain.wait > 0) {
    brain.wait -= dt;
    halt();
    return events;
  }

  brain.avoidLeft = Math.max(0, brain.avoidLeft - dt);
  if (brain.avoidLeft === 0) brain.avoid = null;
  if (bot.role === 'chick') {
    // Nobody likes to be left alone with the one they suspect.
    brain.waryRest = Math.max(0, brain.waryRest - dt);
    if (brain.wary > 0) brain.wary = Math.max(0, brain.wary - dt);
    else if (brain.waryRest === 0 && aloneWithSuspect(state, bot)) {
      brain.wary = BOT_WARY_TIME;
      brain.waryRest = BOT_WARY_TIME + BOT_WARY_REST;
      events.push(...send(bot.id, { type: 'think', thought: 'doubt' }));
    }
  }
  // Re-think when the goal is gone or no longer what matters most.
  const wanted = chooseGoal(state, bot, brain.avoid);
  const sameWander = brain.goal?.kind === 'wander' && wanted.kind === 'wander';
  if (!sameWander && JSON.stringify(brain.goal) !== JSON.stringify(wanted)) {
    brain.goal = wanted;
    brain.path = [];
    brain.arrived = false;
    brain.atGoal = 0;
  }
  const goal = brain.goal!;
  if (goal === wanted && goal.kind === 'task' && bot.profession === 'sysadmin') planDuct(state, bot, goal.task, rng);

  // Reporting and packing use their own keys, not the E prompt.
  if (bot.canReport !== null && bot.role === 'chick') {
    halt();
    events.push(...send(bot.id, { type: 'report' }));
    brain.goal = null;
    brain.path = [];
    return events;
  }
  if (goal.kind === 'hunt') {
    const prey = state.participants[goal.target]!;
    const distance = Math.hypot(prey.x - bot.x, prey.z - bot.z);
    const dropHunt = (thought: Thought | null): SimEvent[] => {
      halt();
      if (thought) events.push(...send(bot.id, { type: 'think', thought }));
      endHunt(brain, rng, false);
      return events;
    };
    if (brain.stalk > 0 || brain.bait) {
      // Follow at a distance, stopping now and then, maybe changing its mind.
      brain.stalk = Math.max(0, brain.stalk - dt);
      if (brain.bait) {
        if (distance <= GOOSE_TRUST_RANGE + 0.5 && brain.preyUnseen === 0) return dropHunt('heart');
      } else if (brain.abortAt >= 0 && brain.stalk <= brain.abortAt) {
        return dropHunt('meh');
      }
      if (!brain.spooked && spooked(state, bot, prey)) {
        brain.spooked = true;
        if (rng.next() < GOOSE_ABORT_CHANCE) return dropHunt('doubt');
      }
      brain.pauseIn -= dt;
      if (brain.pauseIn <= 0) {
        brain.pauseIn = GOOSE_PAUSE_EVERY * between(rng, 0.7, 1.3);
        brain.wait = between(rng, GOOSE_PAUSE_MIN, GOOSE_PAUSE_MAX);
        halt();
        return events;
      }
      if (distance < GOOSE_STALK_GAP && brain.preyUnseen === 0) {
        halt();
        return events;
      }
    } else if (bot.canPack === prey.id && bot.packCooldown === 0 && unwatched(state, bot, prey)) {
      halt();
      events.push(...send(bot.id, { type: 'pack' }));
      endHunt(brain, rng, true);
      // A moment of mock panic over the fresh box, then off to the nearest rug if there is one.
      brain.wait = GOOSE_PACK_FREEZE;
      brain.escape = escapeCarpet(state, bot);
      // The roulette right after a pack: vanish from the scene, or walk off in someone else's look.
      if (bot.skillCooldown === 0) {
        events.push(...send(bot.id, { type: 'skill' }));
        if (bot.vanish > 0) brain.escape = null;
      }
      return events;
    }
    // The prey moves: re-plan towards where the Goose last saw it.
    const end = brain.path[brain.path.length - 1];
    if (end && Math.hypot(end.x - brain.preyX, end.z - brain.preyZ) > 1.5) brain.path = [];
    brain.arrived = false;
  }

  if (goal.kind === 'carpet' && promptFits(bot, goal)) {
    halt();
    brain.escape = null;
    brain.goal = null;
    brain.path = [];
    // Dive only when nobody is looking; otherwise just walk on as if nothing happened.
    if (unwatched(state, bot, bot)) {
      events.push(...send(bot.id, { type: 'interact' }));
      brain.hideLeft = between(rng, CARPET_HIDE_MIN, CARPET_HIDE_MAX);
      brain.hidden = 0;
      brain.crawled = false;
    }
    return events;
  }
  if (promptFits(bot, goal)) {
    halt();
    events.push(...send(bot.id, { type: 'interact' }));
    const task = goal.kind === 'task' ? state.tasks[goal.task]! : null;
    if (task && WINDOW_TASKS.includes(task.kind)) brain.work = between(rng, BOT_TASK_MIN, BOT_TASK_MAX);
    brain.goal = null;
    brain.path = [];
    return events;
  }

  if (brain.path.length === 0) {
    if (brain.arrived) {
      // At the goal: wait for its prompt a moment, then let it go for a while.
      brain.atGoal += dt;
      halt();
      if (goal.kind === 'pose') {
        // At the desk: stare at the screen for a while, with a thought bubble.
        events.push(...send(bot.id, { type: 'think', thought: 'busy' }));
        brain.fake = between(rng, GOOSE_FAKE_MIN, GOOSE_FAKE_MAX);
        brain.poseTask = null;
        brain.goal = null;
        brain.arrived = false;
        brain.atGoal = 0;
        return events;
      }
      if (goal.kind === 'wander' || goal.kind === 'flee' || goal.kind === 'hunt' || brain.atGoal > BOT_GIVE_UP) {
        if (goal.kind === 'carpet') brain.escape = null;
        if (goal.kind === 'task') {
          brain.avoid = goal.task;
          brain.avoidLeft = BOT_AVOID_TIME;
        }
        brain.goal = null;
        brain.arrived = false;
        brain.atGoal = 0;
        brain.wait = between(rng, BOT_IDLE_MIN, BOT_IDLE_MAX);
      }
      return events;
    }
    let path: { x: number; z: number }[] | null = null;
    for (const target of destinations(state, nav, bot, goal, rng)) {
      path = target >= 0 ? findPath(nav, fitsIn(state.level, state.buckets), bot.x, bot.z, target) : null;
      if (path) break;
    }
    if (!path) {
      if (goal.kind === 'pose') brain.poseTask = null;
      if (goal.kind === 'carpet') brain.escape = null;
      if (goal.kind === 'task') {
        brain.avoid = goal.task;
        brain.avoidLeft = BOT_AVOID_TIME;
      }
      brain.goal = null;
      brain.wait = between(rng, BOT_IDLE_MIN, BOT_IDLE_MAX);
      return events;
    }
    brain.path = path;
    brain.checkX = bot.x;
    brain.checkZ = bot.z;
    brain.checkTime = 0;
  }

  const next = brain.path[0]!;
  const dx = next.x - bot.x;
  const dz = next.z - bot.z;
  if (Math.hypot(dx, dz) < WAYPOINT_REACH) {
    brain.path.shift();
    if (brain.path.length === 0) {
      // Arrival: the next ticks wait for the prompt instead of re-planning.
      brain.arrived = true;
      halt();
    }
    return events;
  }
  events.push(...send(bot.id, { type: 'move', x: dx, z: dz }));

  brain.checkTime += dt;
  if (brain.checkTime >= 1) {
    if (Math.hypot(bot.x - brain.checkX, bot.z - brain.checkZ) < BOT_STUCK_DISTANCE) brain.path = [];
    brain.checkX = bot.x;
    brain.checkZ = bot.z;
    brain.checkTime = 0;
  }
  return events;
}
