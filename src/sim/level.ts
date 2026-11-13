import {
  CORE,
  CORRIDOR_FILL_DENSITY,
  EXTRA_LINK_CHANCE,
  FACADE_CHANCE,
  MAP,
  NOOKS,
  PLAYER_RADIUS,
  ROOM_FILL_DENSITY,
  ROOM_MARGIN,
  ROOM_MAX,
  LOBBY_SECTOR,
  SECTORS,
} from '../config';
import {
  FILLERS,
  ISLAND_PIECES,
  PREFABS,
  SHUFFLED_ROOMS,
  type Filler,
  type PropKind,
  type RoomType,
  type Rot,
} from './prefabs';
import { createRng, type Rng } from './rng';

// The office is a grid of one-metre cells. Everything that is not carved out
// as a room or a corridor stays solid, which gives thick, irregular wall masses.

export const FLOOR = 0;
export const SOLID = 1;
/** Facade window: blocks movement, sits on the map border next to floor. */
export const GLASS = 2;

export const NO_ZONE = -2;
export const CORRIDOR = -1;

/** Axis-aligned rectangle: centre and full size. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Prop extends Rect {
  kind: PropKind;
  rot: Rot;
  solid: boolean;
  /** Room id, or -1 for corridor props. */
  room: number;
  /** Look variation (colour set); has no gameplay meaning. */
  variant: number;
  /** True for the fixed hub furniture, false for per-match filler. */
  hub: boolean;
}

export interface Room {
  id: number;
  type: RoomType;
  /** North-west cell of the hub core square. */
  x0: number;
  z0: number;
  /** Centre of the hub core, metres. */
  cx: number;
  cz: number;
  /** Floor cells in the room. */
  area: number;
}

export interface Level {
  seed: number;
  size: number;
  /** FLOOR, SOLID or GLASS per cell, row by row. */
  cells: Uint8Array;
  /** Room id, CORRIDOR or NO_ZONE per cell. */
  zone: Int16Array;
  /** For wall cells that enclose a room: that room's id, else -1. */
  wallOwner: Int16Array;
  rooms: Room[];
  props: Prop[];
  spawn: { x: number; z: number };
}

interface CellRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

interface Shape {
  rects: CellRect[];
  holes: CellRect[];
  w: number;
  d: number;
}

interface Door {
  /** Cells just outside the opening; corridors start here. */
  outs: number[];
  x: number;
  z: number;
  /** Room cells along the opening, and the unit step from the room out through the door. */
  ins: number[];
  dx: number;
  dz: number;
}

interface Build {
  n: number;
  rng: Rng;
  cells: Uint8Array;
  zone: Int16Array;
  owner: Int16Array;
  /** 0 free, 1 solid prop, 2 reserved walkway. */
  occ: Uint8Array;
  props: Prop[];
  doors: Door[][];
}

/** Wall directions: north, east, south, west. */
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
/** Rotation of a prop whose back is against the wall in DIRS[i]. */
const ROT_FOR_WALL: Rot[] = [0, 3, 2, 1];

function makeShape(rng: Rng, lobby: boolean): Shape {
  const w = (lobby ? 16 : 13) + rng.int(lobby ? 4 : 5);
  const d = (lobby ? 15 : 13) + rng.int(lobby ? 3 : 4);
  const rects: CellRect[] = [{ x: 0, z: 0, w, d }];
  const holes: CellRect[] = [];

  // Every variation stays outside the core square in the north-west corner.
  const notch = (): void => {
    const nw = 1 + rng.int(Math.min(4, w - CORE));
    const nd = 2 + rng.int(4);
    holes.push({ x: w - nw, z: d - nd, w: nw, d: nd });
  };
  const eastArm = (): boolean => {
    const aw = Math.min(4 + rng.int(4), ROOM_MAX - w);
    if (aw < 3) return false;
    const ad = 5 + rng.int(d - 6);
    rects.push({ x: w, z: rng.int(d - ad + 1), w: aw, d: ad });
    return true;
  };
  const southArm = (): void => {
    const ad = Math.min(4 + rng.int(4), ROOM_MAX - d);
    const aw = 5 + rng.int(w - 6);
    rects.push({ x: rng.int(w - aw + 1), z: d, w: aw, d: ad });
  };

  switch (rng.int(5)) {
    case 0:
      notch();
      break;
    case 1:
      if (!eastArm()) notch();
      break;
    case 2:
      southArm();
      notch();
      break;
    case 3:
      eastArm();
      southArm();
      break;
    default:
      notch();
      // A free-standing pillar east of the core.
      if (w >= 17) holes.push({ x: 14, z: 2 + rng.int(d - 8), w: 2, d: 2 });
      else southArm();
  }

  return {
    rects,
    holes,
    w: Math.max(...rects.map((r) => r.x + r.w)),
    d: Math.max(...rects.map((r) => r.z + r.d)),
  };
}

function placeRooms(b: Build): Room[] {
  const { n, rng } = b;
  const sector = Math.floor(n / SECTORS);
  const types = rng.shuffle(SHUFFLED_ROOMS);
  const rooms: Room[] = [];

  const offset = (slot: number, size: number): number => {
    const min = slot * sector + ROOM_MARGIN;
    const max = Math.max(min, slot * sector + sector - ROOM_MARGIN - size);
    let value = min + rng.int(max - min + 1);
    const pushed = rng.next() < FACADE_CHANCE;
    if (pushed && slot === 0) value = 1;
    if (pushed && slot === SECTORS - 1) value = n - 1 - size;
    return value;
  };

  for (let row = 0; row < SECTORS; row++) {
    for (let col = 0; col < SECTORS; col++) {
      const lobby = row * SECTORS + col === LOBBY_SECTOR;
      const type: RoomType = lobby ? 'lobby' : types.pop()!;
      const shape = makeShape(rng, lobby);
      const x0 = offset(col, shape.w);
      const z0 = offset(row, shape.d);
      const id = rooms.length;

      for (const r of shape.rects) fill(b, x0 + r.x, z0 + r.z, r.w, r.d, FLOOR, id);
      for (const r of shape.holes) fill(b, x0 + r.x, z0 + r.z, r.w, r.d, SOLID, NO_ZONE);

      let area = 0;
      for (let i = 0; i < b.zone.length; i++) if (b.zone[i] === id) area++;
      rooms.push({ id, type, x0, z0, cx: x0 + CORE / 2, cz: z0 + CORE / 2, area });
    }
  }

  // Wall cells that touch a room belong to it: corridors may not eat them.
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      if (b.zone[z * n + x]! >= 0) continue;
      for (let dz = -1; dz <= 1 && b.owner[z * n + x] === -1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
          const id = b.zone[nz * n + nx]!;
          if (id >= 0) {
            b.owner[z * n + x] = id;
            break;
          }
        }
      }
    }
  }
  return rooms;
}

function fill(b: Build, x: number, z: number, w: number, d: number, cell: number, zone: number): void {
  for (let cz = z; cz < z + d; cz++) {
    for (let cx = x; cx < x + w; cx++) {
      b.cells[cz * b.n + cx] = cell;
      b.zone[cz * b.n + cx] = zone;
    }
  }
}

function addProp(b: Build, prop: Prop): void {
  b.props.push(prop);
  if (!prop.solid) return;
  const eps = 0.01;
  for (let z = Math.floor(prop.z - prop.d / 2 + eps); z <= Math.floor(prop.z + prop.d / 2 - eps); z++) {
    for (let x = Math.floor(prop.x - prop.w / 2 + eps); x <= Math.floor(prop.x + prop.w / 2 - eps); x++) {
      if (x >= 0 && z >= 0 && x < b.n && z < b.n) b.occ[z * b.n + x] = 1;
    }
  }
}

function placeHubs(b: Build, rooms: Room[]): void {
  for (const room of rooms) {
    for (const item of PREFABS[room.type]) {
      const rot = item.rot ?? 0;
      const turned = rot % 2 === 1;
      addProp(b, {
        kind: item.kind,
        x: room.cx + item.x,
        z: room.cz + item.z,
        w: turned ? item.d : item.w,
        d: turned ? item.w : item.d,
        rot,
        solid: item.solid ?? true,
        room: room.id,
        variant: 0,
        hub: true,
      });
    }
  }
}

/**
 * Badge reader of the security room: a post against the wall right beside a
 * door to the corridor, so the doorway itself stays clear. Falls back to a
 * fixed spot in the hub core if no door has a free jamb.
 */
function placeTurnstiles(b: Build, rooms: Room[]): void {
  const { n } = b;
  for (const room of rooms) {
    if (room.type !== 'security') continue;
    let spot: { x: number; z: number; rot: Rot } | null = null;
    for (const door of b.doors[room.id]!) {
      const px = door.dz !== 0 ? 1 : 0;
      const pz = door.dx !== 0 ? 1 : 0;
      const first = door.ins[0]!;
      const fx = first % n;
      const fz = Math.floor(first / n);
      for (const i of [-1, door.ins.length, -2, door.ins.length + 1]) {
        const cx = fx + i * px;
        const cz = fz + i * pz;
        const cell = cz * n + cx;
        // Against a solid wall of this room, on free room floor.
        if (b.zone[cell] !== room.id || b.occ[cell] === 1) continue;
        if (b.cells[(cz + door.dz) * n + cx + door.dx] !== SOLID) continue;
        const rot: Rot = door.dz === 1 ? 2 : door.dz === -1 ? 0 : door.dx === 1 ? 3 : 1;
        spot = { x: cx + 0.5, z: cz + 0.5, rot };
        break;
      }
      if (spot) break;
    }
    spot ??= { x: room.cx + 3.8, z: room.cz + 3, rot: 0 };
    addProp(b, { kind: 'badgeScanner', x: spot.x, z: spot.z, w: 1, d: 1, rot: spot.rot, solid: true, room: room.id, variant: 0, hub: true });
  }
}

/** A corridor may run through this cell. */
function passable(b: Build, x: number, z: number): boolean {
  if (x < 1 || z < 1 || x > b.n - 2 || z > b.n - 2) return false;
  const i = z * b.n + x;
  return b.zone[i]! < 0 && b.owner[i] === -1;
}

/** Finds the best spot for a new door in the room's wall, facing a target point. */
function findDoor(b: Build, room: Room, tx: number, tz: number): { cells: number[]; door: Door; score: number } | null {
  const { n } = b;
  const width = 2 + b.rng.int(2);
  let best: { cells: number[]; door: Door; score: number } | null = null;

  for (let z = Math.max(1, room.z0); z < Math.min(n - 1, room.z0 + ROOM_MAX + 1); z++) {
    for (let x = Math.max(1, room.x0); x < Math.min(n - 1, room.x0 + ROOM_MAX + 1); x++) {
      if (b.zone[z * n + x] !== room.id) continue;
      for (const [dx, dz] of DIRS) {
        const px = dz !== 0 ? 1 : 0;
        const pz = dx !== 0 ? 1 : 0;
        const walls: number[] = [];
        const outs: number[] = [];
        const ins: number[] = [];
        let ok = true;
        // One extra cell on each side keeps solid jambs around the opening.
        for (let i = -1; i <= width && ok; i++) {
          const cx = x + i * px;
          const cz = z + i * pz;
          const wx = cx + dx;
          const wz = cz + dz;
          if (wx < 0 || wz < 0 || wx >= n || wz >= n) ok = false;
          else if (b.cells[wz * n + wx] !== SOLID || b.owner[wz * n + wx] !== room.id) ok = false;
          if (!ok || i < 0 || i >= width) continue;
          if (!passable(b, cx + 2 * dx, cz + 2 * dz)) ok = false;
          for (let k = 0; k < 2 && ok; k++) {
            const inner = (cz - k * dz) * n + (cx - k * dx);
            if (b.zone[inner] !== room.id || b.occ[inner] === 1) ok = false;
          }
          walls.push(wz * n + wx);
          ins.push(cz * n + cx);
          outs.push((cz + 2 * dz) * n + (cx + 2 * dx));
        }
        if (!ok) continue;
        const ox = x + 2 * dx;
        const oz = z + 2 * dz;
        const score = Math.abs(ox - tx) + Math.abs(oz - tz) + b.rng.next() * 6;
        if (!best || score < best.score) best = { cells: walls, door: { outs, x: ox, z: oz, ins, dx, dz }, score };
      }
    }
  }
  return best;
}

function pickDoor(b: Build, room: Room, tx: number, tz: number): Door | null {
  const doors = b.doors[room.id]!;
  let existing: Door | null = null;
  let existingScore = Infinity;
  for (const door of doors) {
    const score = Math.abs(door.x - tx) + Math.abs(door.z - tz);
    if (score < existingScore) {
      existing = door;
      existingScore = score;
    }
  }
  if (doors.length >= 4) return existing;
  const found = findDoor(b, room, tx, tz);
  if (!found) return existing;
  if (existing && existingScore <= found.score + 10) return existing;

  const { n } = b;
  for (const cell of found.cells) {
    b.cells[cell] = FLOOR;
    b.zone[cell] = CORRIDOR;
    b.owner[cell] = -1;
    b.occ[cell] = 2;
    // Keep the approach clear on both sides of the opening.
    const x = cell % n;
    const z = Math.floor(cell / n);
    for (const [dx, dz] of DIRS) {
      for (let k = 1; k <= 2; k++) {
        const i = (z + dz * k) * n + (x + dx * k);
        if (b.occ[i] === 0) b.occ[i] = 2;
      }
    }
  }
  doors.push(found.door);
  return found.door;
}

/** Cheapest route between two cells; prefers existing corridors, bends around noise. */
function route(b: Build, start: number, goal: number, noise: Float32Array): number[] | null {
  const { n } = b;
  const cost = new Float32Array(n * n).fill(Infinity);
  const from = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  // Binary heap of (priority, cell) pairs; stale entries are skipped when popped.
  const keys: number[] = [];
  const items: number[] = [];
  const gx = goal % n;
  const gz = Math.floor(goal / n);

  const swap = (i: number, j: number): void => {
    const k = keys[i]!;
    keys[i] = keys[j]!;
    keys[j] = k;
    const c = items[i]!;
    items[i] = items[j]!;
    items[j] = c;
  };
  const push = (key: number, cell: number): void => {
    keys.push(key);
    items.push(cell);
    let i = keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= keys[i]!) break;
      swap(parent, i);
      i = parent;
    }
  };
  const pop = (): number => {
    const top = items[0]!;
    const lastKey = keys.pop()!;
    const lastItem = items.pop()!;
    if (keys.length > 0) {
      keys[0] = lastKey;
      items[0] = lastItem;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < keys.length && keys[l]! < keys[m]!) m = l;
        if (r < keys.length && keys[r]! < keys[m]!) m = r;
        if (m === i) break;
        swap(m, i);
        i = m;
      }
    }
    return top;
  };

  cost[start] = 0;
  push(0, start);
  while (keys.length > 0) {
    const cell = pop();
    if (closed[cell]) continue;
    closed[cell] = 1;
    if (cell === goal) {
      const path = [cell];
      while (from[path[path.length - 1]!] !== -1) path.push(from[path[path.length - 1]!]!);
      return path.reverse();
    }
    const x = cell % n;
    const z = Math.floor(cell / n);
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      const next = nz * n + nx;
      // Away from the door mouths a route needs room for a two-cell stamp.
      const roomy = passable(b, nx - 1, nz) && passable(b, nx, nz - 1) && passable(b, nx - 1, nz - 1);
      if (!passable(b, nx, nz) || closed[next] || (!roomy && next !== goal)) continue;
      const step = b.cells[next] === FLOOR ? 0.35 : 1 + noise[(nz >> 2) * n + (nx >> 2)]! * 2.5;
      const total = cost[cell]! + step;
      if (total < cost[next]!) {
        cost[next] = total;
        from[next] = cell;
        push(total + (Math.abs(nx - gx) + Math.abs(nz - gz)) * 0.35, next);
      }
    }
  }
  return null;
}

function stamp(b: Build, x: number, z: number, w: number): void {
  const half = w >> 1;
  for (let cz = z - half; cz < z - half + w; cz++) {
    for (let cx = x - half; cx < x - half + w; cx++) {
      if (!passable(b, cx, cz)) continue;
      b.cells[cz * b.n + cx] = FLOOR;
      b.zone[cz * b.n + cx] = CORRIDOR;
    }
  }
}

function carveCorridors(b: Build, rooms: Room[]): void {
  const { n, rng } = b;
  const noise = new Float32Array(n * n);
  for (let i = 0; i < noise.length; i++) noise[i] = rng.next();

  // Links between neighbouring sectors: a random spanning tree plus some loops.
  const links: [number, number][] = [];
  for (let row = 0; row < SECTORS; row++) {
    for (let col = 0; col < SECTORS; col++) {
      const id = row * SECTORS + col;
      if (col < SECTORS - 1) links.push([id, id + 1]);
      if (row < SECTORS - 1) links.push([id, id + SECTORS]);
    }
  }
  const group = rooms.map((room) => room.id);
  const find = (id: number): number => (group[id] === id ? id : (group[id] = find(group[id]!)));

  for (const [a, c] of rng.shuffle(links)) {
    const joined = find(a) === find(c);
    if (joined && rng.next() > EXTRA_LINK_CHANCE) continue;
    const ra = rooms[a]!;
    const rc = rooms[c]!;
    const da = pickDoor(b, ra, rc.cx, rc.cz);
    const dc = pickDoor(b, rc, ra.cx, ra.cz);
    if (!da || !dc) continue;
    const path = route(b, da.outs[0]!, dc.outs[0]!, noise);
    if (!path) continue;
    group[find(a)] = find(c);

    // Corridor width changes along the way.
    let width = 2 + rng.int(3);
    path.forEach((cell, k) => {
      if (k % 7 === 6) width = 2 + rng.int(3);
      stamp(b, cell % n, Math.floor(cell / n), width);
    });
    // Widen the approach so the corridor lines up with the whole doorway.
    for (const out of [...da.outs, ...dc.outs]) stamp(b, out % n, Math.floor(out / n), 3);
  }

  // Dead-end nooks: a short spur that opens into a small pocket.
  let made = 0;
  for (let attempt = 0; attempt < NOOKS * 12 && made < NOOKS; attempt++) {
    const x = 2 + rng.int(n - 4);
    const z = 2 + rng.int(n - 4);
    if (b.zone[z * n + x] !== CORRIDOR) continue;
    const [dx, dz] = rng.pick(DIRS);
    const length = 3 + rng.int(6);
    const w = 4 + rng.int(3);
    const d = 3 + rng.int(3);
    const ex = x + dx * length;
    const ez = z + dz * length;
    const nx = ex - (w >> 1);
    const nz = ez - (d >> 1);
    let free = true;
    for (let cz = nz - 1; cz <= nz + d && free; cz++) {
      for (let cx = nx - 1; cx <= nx + w && free; cx++) {
        free = passable(b, cx, cz) && b.cells[cz * n + cx] === SOLID;
      }
    }
    for (let k = 1; k <= length && free; k++) free = passable(b, x + dx * k, z + dz * k);
    if (!free) continue;
    for (let k = 1; k <= length; k++) stamp(b, x + dx * k, z + dz * k, 2);
    fill(b, nx, nz, w, d, FLOOR, CORRIDOR);
    made++;
  }
}

/** Facade windows wherever floor reaches the edge of the building. */
function glaze(b: Build): void {
  const { n } = b;
  for (let i = 0; i < n; i++) {
    for (const [x, z, ix, iz] of [
      [i, 0, i, 1],
      [i, n - 1, i, n - 2],
      [0, i, 1, i],
      [n - 1, i, n - 2, i],
    ] as const) {
      if (b.cells[iz * n + ix] === FLOOR) b.cells[z * n + x] = GLASS;
    }
  }
}

/** Puts a filler against the wall in DIRS[dir], starting at a floor cell. */
function placeAgainstWall(b: Build, x: number, z: number, dir: number, filler: Filler, zone: number): boolean {
  const { n } = b;
  const [wx, wz] = DIRS[dir]!;
  const px = wz !== 0 ? 1 : 0;
  const pz = wx !== 0 ? 1 : 0;
  const span = Math.ceil(filler.w - 0.01);
  const depth = Math.ceil(filler.d - 0.01);
  const body: number[] = [];
  const front: number[] = [];

  for (let i = -1; i <= span; i++) {
    const cx = x + i * px;
    const cz = z + i * pz;
    if (i < 0 || i >= span) {
      // The walkway in front must not pinch right next to the prop either.
      for (let j = depth; j < depth + 2; j++) {
        const fx = cx - j * wx;
        const fz = cz - j * wz;
        if (fx < 1 || fz < 1 || fx > n - 2 || fz > n - 2) return false;
        if (b.cells[fz * n + fx] !== FLOOR || b.occ[fz * n + fx] === 1) return false;
        front.push(fz * n + fx);
      }
      continue;
    }
    const bx = cx + wx;
    const bz = cz + wz;
    if (bx < 0 || bz < 0 || bx >= n || bz >= n || b.cells[bz * n + bx] === FLOOR) return false;
    // Two free cells in front keep every passage at least two metres wide.
    for (let j = 0; j < depth + 2; j++) {
      const fx = cx - j * wx;
      const fz = cz - j * wz;
      if (fx < 1 || fz < 1 || fx > n - 2 || fz > n - 2) return false;
      const cell = fz * n + fx;
      if (b.cells[cell] !== FLOOR || b.zone[cell] !== zone) return false;
      if (j < depth ? b.occ[cell] !== 0 : b.occ[cell] === 1) return false;
      (j < depth ? body : front).push(cell);
    }
  }

  const alongWall = wz !== 0;
  addProp(b, {
    kind: filler.kind,
    x: alongWall ? x + span / 2 : x + 0.5 + wx * (0.5 - filler.d / 2),
    z: alongWall ? z + 0.5 + wz * (0.5 - filler.d / 2) : z + span / 2,
    w: alongWall ? filler.w : filler.d,
    d: alongWall ? filler.d : filler.w,
    rot: ROT_FOR_WALL[dir]!,
    solid: true,
    room: zone,
    variant: b.rng.int(4),
    hub: false,
  });
  for (const cell of body) b.occ[cell] = 1;
  for (const cell of front) if (b.occ[cell] === 0) b.occ[cell] = 2;
  return true;
}

function furnish(b: Build, zone: number, fillers: Filler[], budget: number, skip: (x: number, z: number) => boolean): void {
  const { n, rng } = b;
  const spots: [number, number, number][] = [];
  for (let z = 1; z < n - 1; z++) {
    for (let x = 1; x < n - 1; x++) {
      if (b.zone[z * n + x] !== zone || b.occ[z * n + x] !== 0 || skip(x, z)) continue;
      DIRS.forEach(([dx, dz], dir) => {
        if (b.cells[(z + dz) * n + (x + dx)] !== FLOOR) spots.push([x, z, dir]);
      });
    }
  }
  let placed = 0;
  for (const [x, z, dir] of rng.shuffle(spots)) {
    if (placed >= budget) break;
    if (placeAgainstWall(b, x, z, dir, rng.pick(fillers), zone)) placed++;
  }
}

/** A rug with a couple of seats in the middle of open floor. */
function placeIslands(b: Build, room: Room): void {
  const { n, rng } = b;
  for (let attempt = 0, made = 0; attempt < 30 && made < 2; attempt++) {
    const x = room.x0 + rng.int(ROOM_MAX - 5);
    const z = room.z0 + rng.int(ROOM_MAX - 4);
    let free = true;
    for (let cz = z; cz < z + 5 && free; cz++) {
      for (let cx = x; cx < x + 6 && free; cx++) {
        const cell = cz * n + cx;
        free = cx < n - 1 && cz < n - 1 && b.zone[cell] === room.id && b.occ[cell] === 0;
      }
    }
    if (!free) continue;
    const variant = rng.int(4);
    for (let cz = z; cz < z + 5; cz++) for (let cx = x; cx < x + 6; cx++) b.occ[cz * n + cx] = 2;
    addProp(b, { kind: 'rug', x: x + 3, z: z + 2.5, w: 4, d: 3, rot: 0, solid: false, room: room.id, variant, hub: false });
    for (const [px, pz] of [[1.5, 1.5], [4.5, 3.5]] as const) {
      const kind = rng.pick(ISLAND_PIECES);
      const size = kind === 'stool' ? 0.5 : 0.9;
      addProp(b, { kind, x: x + px, z: z + pz, w: size, d: size, rot: 0, solid: true, room: room.id, variant: rng.int(4), hub: false });
    }
    made++;
  }
}

export function generateLevel(seed: number): Level {
  const n = MAP;
  const b: Build = {
    n,
    rng: createRng(seed),
    cells: new Uint8Array(n * n).fill(SOLID),
    zone: new Int16Array(n * n).fill(NO_ZONE),
    owner: new Int16Array(n * n).fill(-1),
    occ: new Uint8Array(n * n),
    props: [],
    doors: [],
  };

  const rooms = placeRooms(b);
  rooms.forEach(() => b.doors.push([]));
  placeHubs(b, rooms);
  carveCorridors(b, rooms);
  placeTurnstiles(b, rooms);
  glaze(b);

  for (const room of rooms) {
    const inCore = (x: number, z: number): boolean =>
      x >= room.x0 && x < room.x0 + CORE && z >= room.z0 && z < room.z0 + CORE;
    // The hub core keeps its fixed layout: fillers only go around it.
    for (let z = room.z0; z < room.z0 + CORE; z++) {
      for (let x = room.x0; x < room.x0 + CORE; x++) if (b.occ[z * n + x] === 0) b.occ[z * n + x] = 2;
    }
    const extra = room.area - CORE * CORE;
    placeIslands(b, room);
    furnish(b, room.id, FILLERS[room.type], Math.floor(extra / ROOM_FILL_DENSITY), inCore);
  }

  let corridorCells = 0;
  for (let i = 0; i < b.zone.length; i++) if (b.zone[i] === CORRIDOR) corridorCells++;
  furnish(b, CORRIDOR, FILLERS.corridor, Math.floor(corridorCells / CORRIDOR_FILL_DENSITY), () => false);

  const lobby = rooms.find((room) => room.type === 'lobby')!;
  const level: Level = {
    seed,
    size: n,
    cells: b.cells,
    zone: b.zone,
    wallOwner: b.owner,
    rooms,
    props: b.props,
    spawn: { x: lobby.cx, z: lobby.cz + 3.4 },
  };
  pruneBlockers(level);
  return level;
}

/**
 * Safety net for furniture: walks the office the way the player does and
 * removes filler props that cut any floor off from the spawn point.
 */
function pruneBlockers(level: Level): void {
  const step = 0.5;
  const cols = level.size / step;
  for (let pass = 0; pass < 6; pass++) {
    const buckets = buildBuckets(level);
    const free = new Uint8Array(cols * cols);
    for (let cz = 0; cz < cols; cz++) {
      for (let cx = 0; cx < cols; cx++) {
        if (!blocked(level, buckets, (cx + 0.5) * step, (cz + 0.5) * step, PLAYER_RADIUS)) free[cz * cols + cx] = 1;
      }
    }
    const start = Math.floor(level.spawn.z / step) * cols + Math.floor(level.spawn.x / step);
    const queue = [start];
    free[start] = 2;
    while (queue.length > 0) {
      const cell = queue.pop()!;
      const cx = cell % cols;
      for (const next of [cell - 1, cell + 1, cell - cols, cell + cols]) {
        if (next < 0 || next >= free.length || free[next] !== 1) continue;
        if (Math.abs((next % cols) - cx) > 1) continue;
        free[next] = 2;
        queue.push(next);
      }
    }

    const stranded: number[] = [];
    for (let i = 0; i < free.length; i++) if (free[i] === 1) stranded.push(i);
    if (stranded.length === 0) return;
    const kept = level.props.filter((prop) => {
      if (prop.hub || !prop.solid) return true;
      for (const cell of stranded) {
        const dx = Math.max(Math.abs(((cell % cols) + 0.5) * step - prop.x) - prop.w / 2, 0);
        const dz = Math.max(Math.abs((Math.floor(cell / cols) + 0.5) * step - prop.z) - prop.d / 2, 0);
        if (dx * dx + dz * dz < 1) return false;
      }
      return true;
    });
    if (kept.length === level.props.length) return;
    level.props = kept;
  }
}

export function roomAt(level: Level, x: number, z: number): Room | null {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= level.size || cz >= level.size) return null;
  const id = level.zone[cz * level.size + cx]!;
  return id >= 0 ? level.rooms[id]! : null;
}

/** Prop footprints bucketed into 4 m blocks for fast collision checks. */
export interface Buckets {
  side: number;
  blocks: Rect[][];
}

const BLOCK = 4;

export function buildBuckets(level: Level): Buckets {
  const side = Math.ceil(level.size / BLOCK);
  const blocks: Rect[][] = Array.from({ length: side * side }, () => []);
  for (const prop of level.props) {
    if (!prop.solid) continue;
    const rect: Rect = { x: prop.x, z: prop.z, w: prop.w, d: prop.d };
    const x0 = Math.max(0, Math.floor((prop.x - prop.w / 2 - 1) / BLOCK));
    const x1 = Math.min(side - 1, Math.floor((prop.x + prop.w / 2 + 1) / BLOCK));
    const z0 = Math.max(0, Math.floor((prop.z - prop.d / 2 - 1) / BLOCK));
    const z1 = Math.min(side - 1, Math.floor((prop.z + prop.d / 2 + 1) / BLOCK));
    for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) blocks[bz * side + bx]!.push(rect);
  }
  return { side, blocks };
}

function circleHitsRect(x: number, z: number, radius: number, rx: number, rz: number, hw: number, hd: number): boolean {
  const dx = Math.max(Math.abs(x - rx) - hw, 0);
  const dz = Math.max(Math.abs(z - rz) - hd, 0);
  return dx * dx + dz * dz < radius * radius;
}

/** True when a circle overlaps a wall, a window or solid furniture. */
export function blocked(level: Level, buckets: Buckets, x: number, z: number, radius: number): boolean {
  const n = level.size;
  for (let cz = Math.floor(z - radius); cz <= Math.floor(z + radius); cz++) {
    for (let cx = Math.floor(x - radius); cx <= Math.floor(x + radius); cx++) {
      const outside = cx < 0 || cz < 0 || cx >= n || cz >= n;
      if ((outside || level.cells[cz * n + cx] !== FLOOR) && circleHitsRect(x, z, radius, cx + 0.5, cz + 0.5, 0.5, 0.5)) {
        return true;
      }
    }
  }
  const bx = Math.min(buckets.side - 1, Math.max(0, Math.floor(x / BLOCK)));
  const bz = Math.min(buckets.side - 1, Math.max(0, Math.floor(z / BLOCK)));
  for (const rect of buckets.blocks[bz * buckets.side + bx]!) {
    if (circleHitsRect(x, z, radius, rect.x, rect.z, rect.w / 2, rect.d / 2)) return true;
  }
  return false;
}
