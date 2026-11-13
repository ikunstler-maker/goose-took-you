import { CAMERA_RADIUS, CAMERA_ROOMS } from '../config';
import type { Box } from './cargo';
import type { Level } from './level';
import { unseen } from './roulette';
import { canSee } from './vision';

/** A fixed security camera above the centre of a room's hub core. */
export interface CameraSpot {
  room: number;
  x: number;
  z: number;
}

export function cameraSpots(level: Level): CameraSpot[] {
  const spots: CameraSpot[] = [];
  for (const type of CAMERA_ROOMS) {
    const room = level.rooms.find((r) => r.type === type);
    if (room) spots.push({ room: room.id, x: room.cx, z: room.cz });
  }
  return spots;
}

export const cameraSees = (level: Level, spot: CameraSpot, x: number, z: number): boolean =>
  canSee(level, spot.x, spot.z, x, z, CAMERA_RADIUS);

/** Who and what one camera shows right now. A Goose under a rug or a packed chick is not on screen. */
export function cameraView(
  level: Level,
  spot: CameraSpot,
  participants: readonly { id: number; alive: boolean; under: number | null; vanish: number; x: number; z: number }[],
  boxes: readonly Box[],
): { participants: number[]; boxes: number[] } {
  return {
    participants: participants.filter((p) => p.alive && !unseen(p) && cameraSees(level, spot, p.x, p.z)).map((p) => p.id),
    boxes: boxes.filter((b) => b.carrier === null && cameraSees(level, spot, b.x, b.z)).map((b) => b.id),
  };
}
