/** Server tunables. Nothing here is secret. */

/** Snapshots per second sent to every player. */
export const SEND_RATE = 10;
/** Rooms alive at once; beyond that new rooms are refused. */
export const ROOM_LIMIT = 30;
/** A room nobody is connected to is closed after this long, seconds: time to come back after a hiccup. */
export const EMPTY_ROOM_GRACE = 90;
/** Messages a browser may send per second, and the burst it may save up. */
export const MESSAGE_RATE = 40;
export const MESSAGE_BURST = 80;
/** A browser that keeps flooding past this many dropped messages is disconnected. */
export const FLOOD_LIMIT = 400;
/** Largest message accepted, bytes. */
export const MAX_MESSAGE = 2048;
/** New connections one address may open per minute. */
export const CONNECTS_PER_MINUTE = 30;
/** The simulation never catches up more than this much real time in one go, seconds. */
export const MAX_CATCH_UP = 0.25;
