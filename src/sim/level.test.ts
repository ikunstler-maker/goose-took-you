import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS, TICK } from '../config';
import { circleHits, colliders, generateLevel, roomAt, type Level } from './level';
import { SHUFFLED_ROOMS } from './prefabs';
import { applyCommand, createWorld, step } from './world';

const CELL = 0.25;

/** Flood fill over walkable cells from the spawn point. */
function reachable(level: Level): { reached: Set<number>; free: number; cols: number } {
  const rects = colliders(level);
  const cols = Math.floor(level.size / CELL);
  const centre = (i: number): number => (i + 0.5) * CELL;
  const isFree = (cx: number, cz: number): boolean =>
    cx >= 0 && cz >= 0 && cx < cols && cz < cols && !circleHits(rects, centre(cx), centre(cz), PLAYER_RADIUS);

  let free = 0;
  for (let cz = 0; cz < cols; cz++) for (let cx = 0; cx < cols; cx++) if (isFree(cx, cz)) free++;

  const start = Math.floor(level.spawn.z / CELL) * cols + Math.floor(level.spawn.x / CELL);
  const reached = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.pop()!;
    const cx = cell % cols;
    const cz = Math.floor(cell / cols);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const nz = cz + dz;
      const id = nz * cols + nx;
      if (!reached.has(id) && isFree(nx, nz)) {
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

  it('changes the layout between seeds', () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      layouts.add(generateLevel(seed).rooms.map((room) => room.type).join(','));
    }
    expect(layouts.size).toBeGreaterThan(10);
  });

  it('places the lobby in the centre and every room type once', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const level = generateLevel(seed);
      expect(level.rooms).toHaveLength(9);
      expect(level.rooms[4]!.type).toBe('lobby');
      const types = level.rooms.map((room) => room.type).sort();
      expect(types).toEqual([...SHUFFLED_ROOMS, 'lobby'].sort());
    }
  });

  it('keeps room interiors identical between seeds', () => {
    const interior = (seed: number): string[] => {
      const level = generateLevel(seed);
      const room = level.rooms.find((r) => r.type === 'cargo')!;
      return level.props
        .filter((prop) => prop.room === room.id)
        .map((prop) => `${prop.kind}:${(prop.x - room.cx).toFixed(2)}:${(prop.z - room.cz).toFixed(2)}`);
    };
    expect(interior(3)).toEqual(interior(77));
  });

  it('spawns the player on free ground', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const level = generateLevel(seed);
      expect(circleHits(colliders(level), level.spawn.x, level.spawn.z, PLAYER_RADIUS)).toBe(false);
    }
  });

  it('keeps every room and almost all free floor reachable', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const level = generateLevel(seed);
      const { reached, free, cols } = reachable(level);
      expect(reached.size / free).toBeGreaterThan(0.97);
      for (const room of level.rooms) {
        let cells = 0;
        for (const cell of reached) {
          const x = ((cell % cols) + 0.5) * CELL;
          const z = (Math.floor(cell / cols) + 0.5) * CELL;
          if (roomAt(level, x, z)?.id === room.id) cells++;
        }
        // A room holds 2304 cells; furniture and walls must leave most of it walkable.
        expect(cells, `seed ${seed}, room ${room.type}`).toBeGreaterThan(1000);
      }
    }
  });
});

describe('world', () => {
  it('stops the player at walls and furniture', () => {
    const state = createWorld(7);
    for (const [x, z] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]] as const) {
      applyCommand(state, { type: 'move', x, z });
      for (let i = 0; i < 600; i++) {
        step(state, TICK);
        expect(circleHits(state.colliders, state.player.x, state.player.z, PLAYER_RADIUS - 1e-6)).toBe(false);
      }
    }
  });

  it('reports leaving the lobby through the south door', () => {
    const state = createWorld(7);
    expect(state.level.rooms[state.roomId!]!.type).toBe('lobby');
    applyCommand(state, { type: 'move', x: 0, z: 1 });
    const events = [];
    for (let i = 0; i < 120; i++) events.push(...step(state, TICK));
    expect(events).toContainEqual({ type: 'roomChanged', roomId: null });
  });

  it('normalises diagonal movement', () => {
    const state = createWorld(7);
    applyCommand(state, { type: 'move', x: 3, z: 3 });
    expect(Math.hypot(state.player.moveX, state.player.moveZ)).toBeCloseTo(1);
  });
});
