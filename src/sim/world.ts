import { PLAYER_RADIUS, PLAYER_SPEED } from '../config';
import { circleHits, colliders, generateLevel, roomAt, type Level, type Rect } from './level';

export interface PlayerState {
  x: number;
  z: number;
  /** Heading in radians; 0 faces south (+z). */
  facing: number;
  moving: boolean;
  moveX: number;
  moveZ: number;
}

export interface WorldState {
  level: Level;
  colliders: Rect[];
  player: PlayerState;
  /** Room the player stands in, or null in a corridor. */
  roomId: number | null;
  tick: number;
}

export type Command = { type: 'move'; x: number; z: number };
export type SimEvent = { type: 'roomChanged'; roomId: number | null };

export function createWorld(seed: number): WorldState {
  const level = generateLevel(seed);
  return {
    level,
    colliders: colliders(level),
    player: { x: level.spawn.x, z: level.spawn.z, facing: 0, moving: false, moveX: 0, moveZ: 0 },
    roomId: roomAt(level, level.spawn.x, level.spawn.z)?.id ?? null,
    tick: 0,
  };
}

export function applyCommand(state: WorldState, command: Command): void {
  const length = Math.hypot(command.x, command.z);
  state.player.moveX = length > 1e-6 ? command.x / length : 0;
  state.player.moveZ = length > 1e-6 ? command.z / length : 0;
}

export function step(state: WorldState, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  const player = state.player;
  player.moving = player.moveX !== 0 || player.moveZ !== 0;

  if (player.moving) {
    player.facing = Math.atan2(player.moveX, player.moveZ);
    // Axes are resolved separately so the chick slides along walls.
    const nextX = player.x + player.moveX * PLAYER_SPEED * dt;
    if (!circleHits(state.colliders, nextX, player.z, PLAYER_RADIUS)) player.x = nextX;
    const nextZ = player.z + player.moveZ * PLAYER_SPEED * dt;
    if (!circleHits(state.colliders, player.x, nextZ, PLAYER_RADIUS)) player.z = nextZ;
  }

  const roomId = roomAt(state.level, player.x, player.z)?.id ?? null;
  if (roomId !== state.roomId) {
    state.roomId = roomId;
    events.push({ type: 'roomChanged', roomId });
  }
  state.tick++;
  return events;
}
