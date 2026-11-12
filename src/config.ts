// All tunables live here (see CLAUDE.md, invariant 6).

/** Office side length in cells; one cell is one metre. */
export const MAP = 88;
/** Rooms are laid out in a SECTORS x SECTORS grid of loose sectors. */
export const SECTORS = 3;
/** Side of the square that holds a room's fixed hub furniture. */
export const CORE = 12;
/** Largest bounding box side of a room shape. */
export const ROOM_MAX = 22;
/** Chance that a room in an outer sector is pushed against the facade (gets windows). */
export const FACADE_CHANCE = 0.6;
/** Chance that a non-tree corridor link between neighbouring rooms is built (loops). */
export const EXTRA_LINK_CHANCE = 0.55;
/** Dead-end nooks branching off corridors. */
export const NOOKS = 10;
/** Filler furniture budget: one item per this many floor cells. */
export const ROOM_FILL_DENSITY = 9;
export const CORRIDOR_FILL_DENSITY = 20;

/** Full wall height and the height of walls cut away in front of the player. */
export const WALL_HEIGHT = 2.4;
export const WALL_LOW = 0.3;
export const WINDOW_HEIGHT = 3.0;
/** How many cells towards the camera a wall is cut away so it does not hide visible floor. */
export const CUTAWAY_REACH = 3;

export const PLAYER_RADIUS = 0.4;
export const PLAYER_SPEED = 5;
/** Fixed simulation step, seconds. */
export const TICK = 1 / 60;
/** How far the player sees along a clear line, metres. */
export const VISION_RADIUS = 12;

/** Emotion timings, seconds. */
export const DIZZY_TIME = 1.2;
export const DIZZY_COOLDOWN = 3;
export const SURPRISED_TIME = 1.3;
export const BORED_AFTER = 6;

export const CAMERA_YAW = Math.PI / 4;
export const CAMERA_PITCH = (35 * Math.PI) / 180;
/** Half of the visible height in metres. Kept tight on purpose: the Goose needs blind spots. */
export const CAMERA_ZOOM_MIN = 4.5;
export const CAMERA_ZOOM_MAX = 8;
export const CAMERA_ZOOM_DEFAULT = 6.5;
export const CAMERA_FOLLOW_RATE = 6;
