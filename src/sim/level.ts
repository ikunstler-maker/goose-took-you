import {
  BUILDING,
  CORRIDOR,
  CORRIDOR_PLANT_CHANCE,
  DOOR_WIDTH,
  GRID,
  PITCH,
  ROOM,
  WALL_THICKNESS,
} from '../config';
import { PREFABS, SHUFFLED_ROOMS, type PropKind, type RoomType, type Rot } from './prefabs';
import { createRng } from './rng';

/** Axis-aligned rectangle: centre and full size. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type Side = 'n' | 'e' | 's' | 'w';

export interface Wall extends Rect {
  kind: 'wall' | 'glass';
  /** Tall panoramic window on the far perimeter. */
  tall: boolean;
}

export interface Prop extends Rect {
  kind: PropKind;
  rot: Rot;
  solid: boolean;
  /** Room id, or -1 for corridor props. */
  room: number;
}

export interface Room {
  id: number;
  type: RoomType;
  col: number;
  row: number;
  cx: number;
  cz: number;
  doors: Side[];
}

export interface Level {
  seed: number;
  size: number;
  rooms: Room[];
  walls: Wall[];
  props: Prop[];
  spawn: { x: number; z: number };
}

const SIDES: Side[] = ['n', 'e', 's', 'w'];
const HALF = ROOM / 2;
const T = WALL_THICKNESS;

function facesCorridor(side: Side, col: number, row: number): boolean {
  if (side === 'n') return row > 0;
  if (side === 's') return row < GRID - 1;
  if (side === 'w') return col > 0;
  return col < GRID - 1;
}

/** Wall segment running along a room side, `from..to` measured along that side. */
function sideSegment(room: Room, side: Side, from: number, to: number, kind: Wall['kind']): Wall {
  const mid = (from + to) / 2;
  const len = to - from;
  const edge = HALF - T / 2;
  const tall = kind === 'glass' && (side === 'n' || side === 'w');
  if (side === 'n' || side === 's') {
    const z = room.cz + (side === 'n' ? -edge : edge);
    return { x: room.cx + mid, z, w: len, d: T, kind, tall };
  }
  const x = room.cx + (side === 'w' ? -edge : edge);
  return { x, z: room.cz + mid, w: T, d: len, kind, tall };
}

function roomWalls(room: Room): Wall[] {
  const walls: Wall[] = [];
  for (const side of SIDES) {
    const kind: Wall['kind'] = facesCorridor(side, room.col, room.row) ? 'wall' : 'glass';
    if (room.doors.includes(side)) {
      walls.push(sideSegment(room, side, -HALF, -DOOR_WIDTH / 2, kind));
      walls.push(sideSegment(room, side, DOOR_WIDTH / 2, HALF, kind));
    } else {
      walls.push(sideSegment(room, side, -HALF, HALF, kind));
    }
  }
  return walls;
}

/** Glass that closes corridor ends on the building perimeter. */
function corridorEnds(): Wall[] {
  const walls: Wall[] = [];
  for (let i = 0; i < GRID - 1; i++) {
    const c = i * PITCH + ROOM + CORRIDOR / 2;
    walls.push({ x: c, z: T / 2, w: CORRIDOR, d: T, kind: 'glass', tall: true });
    walls.push({ x: c, z: BUILDING - T / 2, w: CORRIDOR, d: T, kind: 'glass', tall: false });
    walls.push({ x: T / 2, z: c, w: T, d: CORRIDOR, kind: 'glass', tall: true });
    walls.push({ x: BUILDING - T / 2, z: c, w: T, d: CORRIDOR, kind: 'glass', tall: false });
  }
  return walls;
}

function rotated(w: number, d: number, rot: Rot): { w: number; d: number } {
  return rot % 2 === 1 ? { w: d, d: w } : { w, d };
}

function roomProps(room: Room): Prop[] {
  return PREFABS[room.type].map((item) => {
    const rot = item.rot ?? 0;
    const size = rotated(item.w, item.d, rot);
    return {
      kind: item.kind,
      x: room.cx + item.x,
      z: room.cz + item.z,
      w: size.w,
      d: size.d,
      rot,
      solid: item.solid ?? true,
      room: room.id,
    };
  });
}

const CORRIDOR_PLANTS: PropKind[] = ['monstera', 'ficus', 'monstera', 'ficus', 'bonsai'];

export function generateLevel(seed: number): Level {
  const rng = createRng(seed);
  const types = rng.shuffle(SHUFFLED_ROOMS);
  const centre = (GRID - 1) / 2;
  const rooms: Room[] = [];

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const isLobby = col === centre && row === centre;
      const type: RoomType = isLobby ? 'lobby' : types.pop()!;
      const candidates = SIDES.filter((side) => facesCorridor(side, col, row));
      // The lobby keeps every door; other rooms keep at least two.
      const keep = isLobby ? candidates.length : Math.max(2, candidates.length - rng.int(2));
      const doors = rng.shuffle(candidates).slice(0, keep);
      rooms.push({
        id: rooms.length,
        type,
        col,
        row,
        cx: col * PITCH + HALF,
        cz: row * PITCH + HALF,
        doors: SIDES.filter((side) => doors.includes(side)),
      });
    }
  }

  const walls = rooms.flatMap(roomWalls).concat(corridorEnds());
  const props = rooms.flatMap(roomProps);

  // Plants along corridor edges, away from doors and intersections.
  for (const room of rooms) {
    for (const side of SIDES) {
      if (!facesCorridor(side, room.col, room.row)) continue;
      for (const along of [-4.2, 4.2]) {
        if (rng.next() > CORRIDOR_PLANT_CHANCE) continue;
        const out = HALF + 0.55;
        const kind = rng.pick(CORRIDOR_PLANTS);
        const x = side === 'n' || side === 's' ? room.cx + along : room.cx + (side === 'w' ? -out : out);
        const z = side === 'n' || side === 's' ? room.cz + (side === 'n' ? -out : out) : room.cz + along;
        props.push({ kind, x, z, w: 0.8, d: 0.8, rot: 0, solid: true, room: -1 });
      }
    }
  }

  const lobby = rooms.find((room) => room.type === 'lobby')!;
  return {
    seed,
    size: BUILDING,
    rooms,
    walls,
    props,
    spawn: { x: lobby.cx, z: lobby.cz + 3.4 },
  };
}

export function roomAt(level: Level, x: number, z: number): Room | null {
  for (const room of level.rooms) {
    if (Math.abs(x - room.cx) < HALF && Math.abs(z - room.cz) < HALF) return room;
  }
  return null;
}

/** Everything the player cannot walk through. */
export function colliders(level: Level): Rect[] {
  const out: Rect[] = level.walls.map(({ x, z, w, d }) => ({ x, z, w, d }));
  for (const prop of level.props) {
    if (prop.solid) out.push({ x: prop.x, z: prop.z, w: prop.w, d: prop.d });
  }
  return out;
}

export function circleHits(rects: readonly Rect[], x: number, z: number, radius: number): boolean {
  for (const rect of rects) {
    const dx = Math.max(Math.abs(x - rect.x) - rect.w / 2, 0);
    const dz = Math.max(Math.abs(z - rect.z) - rect.d / 2, 0);
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}
