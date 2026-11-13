import { PLAYER_SAY_COOLDOWN, PLAYER_SPEED } from '../config';
import { createWorld, setLocalSeat, walk, type WorldState } from '../sim/world';
import { unpackSight, type WireView } from './protocol';

/** Where the server last saw each visible seat; the browser glides its copy there. */
export type Targets = Map<number, { x: number; z: number }>;

/** The direction this browser's player is pushing right now (unit vector or zero), and seconds since they let go. */
export interface OwnInput {
  x: number;
  z: number;
  still: number;
}

/** The server's word about our own chick is this old at worst, seconds: no correction within that much walking. */
const LAG_ALLOWANCE = 0.4;
/** After letting go the own chick stays where it stopped this long before settling on the server's spot, seconds. */
const SETTLE_AFTER = 0.5;

/** Seats out of sight are parked far outside the office, where nothing draws them. */
const NOWHERE = -1000;
/** A jump longer than this is a teleport (a rug, a meeting seat), not a walk, metres. */
const SNAP_DISTANCE = 3;
/** How eagerly the copy closes the gap to the server's position, per second. */
const GLIDE = 14;
/** «Voted, but for whom is not known yet». */
const HIDDEN_VOTE = -2;

/**
 * The browser's copy of an online match: a normal world built from the same
 * seed (so the office, the stations and the task list match the server's),
 * which is then only ever written from snapshots and never stepped.
 */
export function createMirror(view: WireView): WorldState {
  setLocalSeat(view.you);
  const world = createWorld(view.seed);
  world.sharedProgress = 0;
  for (const p of world.participants) {
    if (p.id !== view.you) p.x = p.z = NOWHERE;
  }
  return world;
}

/** Writes the merged snapshot into the copy. `changed` names the parts that just arrived. */
export function applyView(world: WorldState, view: WireView, changed: Partial<WireView>, targets: Targets, own: OwnInput | null = null): void {
  const you = view.you;
  world.phase = view.phase;
  world.winner = view.winner;
  world.lostTo = view.lostTo;
  world.tick = view.tick;
  world.sharedProgress = view.progress;
  world.broadcast = view.broadcast;
  world.buttonCooldown = view.buttonCooldown;
  world.sabotage = view.sabotage;
  world.siren = view.siren;

  if (changed.seats || changed.self) {
    for (const seat of view.seats) {
      const p = world.participants[seat.id]!;
      p.color = seat.color;
      p.accessory = seat.accessory;
      p.alive = seat.alive;
      p.ejected = seat.ejected;
      p.isBot = !seat.human;
      // Unknown roles read as chicks: that is all anyone can tell by looking.
      p.role = seat.role ?? 'chick';
      p.profession = seat.profession;
      const body = seat.body;
      if (!body) {
        p.x = p.z = NOWHERE;
        p.moving = false;
        p.carrying = null;
        p.tell = 0;
        p.honk = 0;
        targets.delete(seat.id);
        continue;
      }
      const jump = Math.hypot(body.x - p.x, body.z - p.z);
      if (jump > SNAP_DISTANCE || view.phase !== 'play') {
        p.x = body.x;
        p.z = body.z;
      }
      targets.set(seat.id, { x: body.x, z: body.z });
      // While the player pushes, their own chick is walked here, ahead of the server.
      if (!(seat.id === you && own && (own.x !== 0 || own.z !== 0))) {
        p.facing = body.facing;
        p.moving = body.moving;
      }
      p.emotion = body.emotion;
      p.thought = body.thought;
      p.carrying = body.carrying;
      p.tell = body.tell;
      p.honk = body.honk;
    }
    const self = world.participants[you]!;
    const mine = view.self;
    self.role = mine.role;
    self.buttonUses = mine.buttonUses;
    self.packCooldown = mine.packCooldown;
    self.carpetCooldown = mine.carpetCooldown;
    self.under = mine.under;
    self.canPack = mine.canPack;
    self.canReport = mine.canReport;
    self.prompt = mine.prompt;
    self.activeTask = mine.activeTask;
    self.watching = mine.watching;
    self.visited = mine.visited;
    self.roomId = mine.roomId;
    self.profession = mine.profession;
    self.skillCooldown = mine.skillCooldown;
    self.tag = mine.tag;
    self.tablet = mine.tablet;
    self.charged = mine.charged;
    self.ductLeft = mine.ductLeft;
    if (mine.outAt) mine.outAt.forEach((at, id) => (world.participants[id]!.outAt = at));
    world.sabotageCooldown = mine.sabotageCooldown;
  }
  if (changed.tasks) for (const task of view.tasks) world.tasks[task.id] = { ...task };
  if (changed.sight) {
    const sight = world.sight[you]!;
    unpackSight(view.sight, sight.cells);
    sight.version++;
  }
  if (changed.boxes) world.boxes = view.boxes.map((box) => ({ ...box }));
  if (changed.carpets) world.carpets = view.carpets.map((carpet) => ({ ...carpet }));

  const m = view.meeting;
  if (!m) world.meeting = null;
  else if (changed.meeting) {
    const seats = world.participants;
    world.meeting = {
      caller: m.caller,
      victim: m.victim,
      stage: m.stage,
      elapsed: 0,
      timeLeft: m.timeLeft,
      chat: m.chat,
      votes: m.votes ?? m.voted.map((voted, id) => (id === you ? m.myVote : voted ? HIDDEN_VOTE : null)),
      plan: [],
      ejected: m.ejected,
      tie: m.tie,
      rooms: seats.map(() => null),
      hints: seats.map((p) => (p.id === you ? m.hints : [])),
      said: seats.map((p) => (p.id === you ? m.said : 0)),
      // The window only asks «may I speak yet?»: elapsed − saidAt < cooldown.
      saidAt: seats.map((p) => (p.id === you ? m.sayIn - PLAYER_SAY_COOLDOWN : -PLAYER_SAY_COOLDOWN)),
      swayed: seats.map(() => false),
    };
  }
}

/** May this browser walk its own chick right now, without asking? The same conditions the match uses. */
const canWalk = (world: WorldState, you: number): boolean => {
  const p = world.participants[you]!;
  return world.phase === 'play' && p.alive && p.activeTask === null && !p.watching && p.under === null;
};

/**
 * Every frame: visible seats glide to where the server last put them. The
 * player's own chick walks at once by the same rules the server uses, and is
 * corrected only when the two disagree by more than the connection delay explains.
 */
export function glide(world: WorldState, targets: Targets, dt: number, you = -1, own: OwnInput | null = null): void {
  const k = 1 - Math.exp(-dt * GLIDE);
  for (const [id, target] of targets) {
    const p = world.participants[id]!;
    if (id === you && own && canWalk(world, you)) {
      const pushing = own.x !== 0 || own.z !== 0;
      own.still = pushing ? 0 : own.still + dt;
      if (pushing) {
        p.facing = Math.atan2(own.x, own.z);
        p.moving = true;
        walk(world.level, world.buckets, p, own.x, own.z, dt);
      }
      const off = Math.hypot(target.x - p.x, target.z - p.z);
      if (own.still < SETTLE_AFTER && off < PLAYER_SPEED * LAG_ALLOWANCE + 0.3) continue;
    }
    p.x += (target.x - p.x) * k;
    p.z += (target.z - p.z) * k;
  }
}
