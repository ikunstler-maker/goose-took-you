// All tunables live here (see CLAUDE.md, invariant 6).

/** Office grid: GRID x GRID slots. */
export const GRID = 3;
/** Room side length, metres. Rooms are square. */
export const ROOM = 12;
/** Corridor width between slots, metres. */
export const CORRIDOR = 4;
/** Distance between neighbouring slot origins. */
export const PITCH = ROOM + CORRIDOR;
/** Full building side length. */
export const BUILDING = GRID * ROOM + (GRID - 1) * CORRIDOR;

export const WALL_THICKNESS = 0.3;
export const DOOR_WIDTH = 2.4;
/** Cutaway height of interior walls and of the camera-facing perimeter. */
export const WALL_HEIGHT = 1.0;
/** Height of the panoramic windows on the far (north and west) perimeter. */
export const WINDOW_HEIGHT = 3.4;

export const PLAYER_RADIUS = 0.4;
export const PLAYER_SPEED = 5;
/** Fixed simulation step, seconds. */
export const TICK = 1 / 60;

/** Chance that a corridor plant spot is filled. */
export const CORRIDOR_PLANT_CHANCE = 0.55;

export const CAMERA_YAW = Math.PI / 4;
export const CAMERA_PITCH = (35 * Math.PI) / 180;
export const CAMERA_ZOOM_MIN = 6;
export const CAMERA_ZOOM_MAX = 26;
export const CAMERA_ZOOM_DEFAULT = 11;
export const CAMERA_FOLLOW_RATE = 6;
