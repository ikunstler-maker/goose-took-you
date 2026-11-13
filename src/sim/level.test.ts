import { describe, expect, it } from 'vitest';
import { BORED_AFTER, CORE, LOBBY_SECTOR, MAP, PLAYER_RADIUS, TICK } from '../config';
import { blocked, buildBuckets, CORRIDOR, FLOOR, generateLevel, GLASS, roomAt, SOLID, type Level } from './level';
import { SHUFFLED_ROOMS } from './prefabs';
import { computeVisibility } from './vision';
import { applyCommand, createWorld as createLobby, LOCAL_PLAYER, me, step } from './world';

/** A world past the lobby, ready to play. */
function createWorld(seed: number) {
  const state = createLobby(seed);
  applyCommand(state, LOCAL_PLAYER, { type: 'start' });
  return state;
}

const CELL = 0.5;

/** Flood fill over walkable sample points from the spawn, using real collision. */
function reachable(level: Level): { reached: Set<number>; free: number; cols: number } {
  const buckets = buildBuckets(level);
  const cols = Math.floor(level.size / CELL);
  const centre = (i: number): number => (i + 0.5) * CELL;
  const grid = new Uint8Array(cols * cols);
  let free = 0;
  for (let cz = 0; cz < cols; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      if (blocked(level, buckets, centre(cx), centre(cz), PLAYER_RADIUS)) continue;
      grid[cz * cols + cx] = 1;
      free++;
    }
  }
  const isFree = (cx: number, cz: number): boolean =>
    cx >= 0 && cz >= 0 && cx < cols && cz < cols && grid[cz * cols + cx] === 1;

  const start = Math.floor(level.spawn.z / CELL) * cols + Math.floor(level.spawn.x / CELL);
  const reached = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.pop()!;
    const cx = cell % cols;
    const cz = Math.floor(cell / cols);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const id = (cz + dz) * cols + cx + dx;
      if (!reached.has(id) && isFree(cx + dx, cz + dz)) {
        reached.add(id);
        queue.push(id);
      }
    }
  }
  return { reached, free, cols };
}

describe('generateLevel', () => {
  it('is deterministic for a seed', () => {
    expect(generateLevel(42)).toEqual(generateLevel(42));
  });

  it('changes room shapes and positions between seeds', () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      layouts.add(generateLevel(seed).rooms.map((room) => `${room.type}:${room.x0}:${room.z0}:${room.area}`).join(','));
    }
    expect(layouts.size).toBe(20);
  });

  it('has every room type once and keeps the lobby in the middle', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const level = generateLevel(seed);
      expect(level.size).toBe(MAP);
      expect(level.rooms.map((room) => room.type).sort()).toEqual([...SHUFFLED_ROOMS, 'lobby'].sort());
      expect(level.rooms[LOBBY_SECTOR]!.type).toBe('lobby');
    }
  });

  it('keeps the hub furniture identical between seeds', () => {
    const hub = (seed: number): string[] => {
      const level = generateLevel(seed);
      const room = level.rooms.find((r) => r.type === 'cargo')!;
      return level.props
        .filter((prop) => prop.room === room.id && prop.hub)
        .map((prop) => `${prop.kind}:${(prop.x - room.cx).toFixed(2)}:${(prop.z - room.cz).toFixed(2)}`);
    };
    expect(hub(3)).toEqual(hub(77));
    expect(hub(3).length).toBeGreaterThan(5);
  });

  it('keeps the hub core as floor and varies the filler furniture', () => {
    const fillers = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const level = generateLevel(seed);
      for (const room of level.rooms) {
        for (let z = room.z0; z < room.z0 + CORE; z++) {
          for (let x = room.x0; x < room.x0 + CORE; x++) {
            expect(level.zone[z * level.size + x]).toBe(room.id);
          }
        }
      }
      fillers.add(level.props.filter((prop) => !prop.hub).length);
    }
    expect(fillers.size).toBeGreaterThan(5);
  });

  it('never leaves floor on the map border and glazes the facade', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const level = generateLevel(seed);
      const n = level.size;
      let glass = 0;
      for (let i = 0; i < n; i++) {
        for (const cell of [i, (n - 1) * n + i, i * n, i * n + n - 1]) {
          expect(level.cells[cell]).not.toBe(FLOOR);
          if (level.cells[cell] === GLASS) glass++;
        }
      }
      expect(glass, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('leaves thick solid masses and plenty of corridor', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const level = generateLevel(seed);
      let solid = 0;
      let corridor = 0;
      for (let i = 0; i < level.cells.length; i++) {
        if (level.cells[i] === SOLID) solid++;
        if (level.zone[i] === CORRIDOR) corridor++;
      }
      expect(solid / level.cells.length).toBeGreaterThan(0.3);
      expect(corridor).toBeGreaterThan(350);
    }
  });

  it('keeps every room and almost all free floor reachable', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const level = generateLevel(seed);
      const buckets = buildBuckets(level);
      expect(blocked(level, buckets, level.spawn.x, level.spawn.z, PLAYER_RADIUS)).toBe(false);
      const { reached, free, cols } = reachable(level);
      expect(reached.size / free, `seed ${seed}`).toBeGreaterThan(0.97);
      const perRoom = new Map<number, number>();
      for (const cell of reached) {
        const room = roomAt(level, ((cell % cols) + 0.5) * CELL, (Math.floor(cell / cols) + 0.5) * CELL);
        if (room) perRoom.set(room.id, (perRoom.get(room.id) ?? 0) + 1);
      }
      for (const room of level.rooms) {
        // Each cell holds four sample points; at least half the room must be walkable.
        expect(perRoom.get(room.id) ?? 0, `seed ${seed}, room ${room.type}`).toBeGreaterThan(room.area * 2);
      }
    }
  }, 120_000);
});

describe('vision', () => {
  it('sees the own room but not through walls', () => {
    const level = generateLevel(7);
    const visible = new Uint8Array(level.size * level.size);
    computeVisibility(level, level.spawn.x, level.spawn.z, visible);
    const lobby = level.rooms[LOBBY_SECTOR]!;
    let seenInLobby = 0;
    let seenElsewhere = 0;
    for (let i = 0; i < visible.length; i++) {
      if (!visible[i]) continue;
      expect(level.cells[i]).toBe(FLOOR);
      if (level.zone[i] === lobby.id) seenInLobby++;
      else if (level.zone[i]! >= 0) seenElsewhere++;
    }
    expect(seenInLobby).toBeGreaterThan(100);
    expect(seenElsewhere).toBe(0);
  });
});

describe('world', () => {
  it('stops the player at walls and furniture', () => {
    const state = createWorld(7);
    for (const [x, z] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]] as const) {
      applyCommand(state, LOCAL_PLAYER, { type: 'move', x, z });
      for (let i = 0; i < 900; i++) {
        step(state, TICK);
        // Once packed, the player is a spirit and drifts through walls by design.
        if (!me(state).alive) return;
        expect(blocked(state.level, state.buckets, me(state).x, me(state).z, PLAYER_RADIUS - 1e-6)).toBe(false);
      }
    }
  });

  it('normalises diagonal movement', () => {
    const state = createWorld(7);
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 3, z: 3 });
    expect(Math.hypot(me(state).moveX, me(state).moveZ)).toBeCloseTo(1);
  });

  it('changes emotion with the situation', () => {
    const state = createWorld(7);
    expect(me(state).emotion).toBe('calm');
    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 0, z: 1 });
    step(state, TICK);
    expect(me(state).emotion).toBe('happy');

    // Keep running until something is in the way.
    const events = [];
    for (let i = 0; i < 1200 && events.length === 0; i++) {
      events.push(...step(state, TICK).filter((event) => event.type === 'bumped'));
    }
    expect(events).toHaveLength(1);
    expect(me(state).emotion).toBe('dizzy');

    applyCommand(state, LOCAL_PLAYER, { type: 'move', x: 0, z: 0 });
    for (let i = 0; i < (BORED_AFTER + 1) / TICK; i++) step(state, TICK);
    expect(me(state).emotion).toBe('bored');
  });
});
