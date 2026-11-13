import { PLAYER_SAY_COOLDOWN } from '../config';
import { createWorld, setLocalSeat, type WorldState } from '../sim/world';
import { unpackSight, type WireView } from './protocol';

/** Where the server last saw each visible seat; the browser glides its copy there. */
export type Targets = Map<number, { x: number; z: number }>;

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
export function applyView(world: WorldState, view: WireView, changed: Partial<WireView>, targets: Targets): void {
  const you = view.you;
  world.phase = view.phase;
  world.winner = view.winner;
  world.lostTo = view.lostTo;
  world.tick = view.tick;
  world.sharedProgress = view.progress;
  world.broadcast = view.broadcast;
  world.buttonCooldown = view.buttonCooldown;
  world.sabotage = view.sabotage;

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
      const body = seat.body;
      if (!body) {
        p.x = p.z = NOWHERE;
        p.moving = false;
        p.carrying = null;
        p.tell = 0;
        p.tellBubble = false;
        targets.delete(seat.id);
        continue;
      }
      const jump = Math.hypot(body.x - p.x, body.z - p.z);
      if (jump > SNAP_DISTANCE || view.phase !== 'play') {
        p.x = body.x;
        p.z = body.z;
      }
      targets.set(seat.id, { x: body.x, z: body.z });
      p.facing = body.facing;
      p.moving = body.moving;
      p.emotion = body.emotion;
      p.thought = body.thought;
      p.carrying = body.carrying;
      p.tell = body.tell;
      p.tellBubble = body.tellBubble;
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

/** Every frame: visible seats glide to where the server last put them. */
export function glide(world: WorldState, targets: Targets, dt: number): void {
  const k = 1 - Math.exp(-dt * GLIDE);
  for (const [id, target] of targets) {
    const p = world.participants[id]!;
    p.x += (target.x - p.x) * k;
    p.z += (target.z - p.z) * k;
  }
}
