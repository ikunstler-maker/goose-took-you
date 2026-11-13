// All tunables live here (see CLAUDE.md, invariant 6).

/** Office side length in cells; one cell is one metre. */
export const MAP = 116;
/** Rooms are laid out in a SECTORS x SECTORS grid of loose sectors. */
export const SECTORS = 4;
/** Sector index (row * SECTORS + col) that always holds the lobby. */
export const LOBBY_SECTOR = 5;
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

/** Tasks: how many each participant gets and how close the chick must stand to a station, metres. */
export const TASKS_PER_PLAYER = 5;
export const INTERACT_RANGE = 1.2;

/** Mini-game «Відбитись від правок Модуса». */
export const MODUS_TARGET = 15;
/** Seconds between new edit stickers at the start and at the hardest point. */
export const MODUS_SPAWN_START = 1.1;
export const MODUS_SPAWN_MIN = 0.45;
/** Spawn interval shrinks by this many seconds per closed sticker. */
export const MODUS_SPAWN_RAMP = 0.04;
/** Chaos added per second by every open sticker, percent. */
export const MODUS_CHAOS_PER_STICKER = 2.2;
/** Chaos drained when a sticker is closed, percent. */
export const MODUS_CHAOS_RELIEF = 3;
export const MODUS_MAX_STICKERS = 9;
/** Share of special edits in a round is rolled between these; a round favours one special kind. */
export const MODUS_SPECIAL_MIN = 0.25;
export const MODUS_SPECIAL_MAX = 0.5;
/** A runaway edit drifts at this speed, board widths per second. */
export const MODUS_RUNNER_SPEED = 0.16;
/** Pause after losing before a new round starts, seconds. */
export const MODUS_RETRY_DELAY = 1.5;

/** How long the "Done!" banner stays before a won mini-game closes, seconds. */
export const MINIGAME_DONE_PAUSE = 0.9;
/** Height of the task arrows above stations, metres. */
export const MARKER_HEIGHT = 2.1;

/** Mini-game «Монтаж новостніків». */
/** Seconds before a bot partner sits down when nobody else joins. */
export const NEWS_PARTNER_DELAY = 3;
/** Files the pair must push through the node. */
export const NEWS_FILES = 6;
export const NEWS_GRID = 4;
/** How long a picture stays in the grid, and the pause between pictures, seconds. */
export const NEWS_TILE_LIFE = 1.5;
export const NEWS_TILE_EVERY = 0.7;
/** How often the partner's node lights up, and how fast the bot partner reacts, seconds. */
export const NEWS_NODE_EVERY = 1.6;
export const NEWS_BOT_REACTION = 0.5;
/** Length of the «Екстрені Новини» broadcast in the Lobby, seconds. */
export const NEWS_BROADCAST_TIME = 12;
/** Seconds to reach and press the Giant Green Button after the edit is done; otherwise edit again. */
export const NEWS_BUTTON_TIME = 5;
/** Confetti over the button: pieces and seconds in the air. */
export const CONFETTI_PIECES = 260;
export const CONFETTI_TIME = 4.5;

/** «Вантажник»: chance a box slips out of the wings on one delivery route (BOX_SLIP_CHANCE). */
export const BOX_SLIP_CHANCE = 0.12;
/** A slip happens after this many metres of carrying, picked between the two. */
export const BOX_SLIP_MIN = 6;
export const BOX_SLIP_MAX = 26;
/** Side of a cargo box, metres. */
export const BOX_SIZE = 0.55;

/** Mini-game «Сім червоних перпендикулярних ліній». */
export const LINES_COUNT = 7;
/** A new line snaps to exactly 90° when it is within this many degrees of perpendicular to a drawn line. */
export const LINES_SNAP_DEG = 12;
/** Two lines count as perpendicular when their angle is within this of 90°. */
export const LINES_PERP_TOLERANCE_DEG = 1;
export const LINES_KITTEN_CHANCE = 0.65;
/** Shortest stroke that counts as a line, canvas pixels. */
export const LINES_MIN_LENGTH = 30;
/** How close a click must be to a line to stamp it, canvas pixels. */
export const LINES_HIT_RADIUS = 12;
/** How long the pleased client stays on screen before the task closes, seconds. */
export const LINES_CLIENT_PAUSE = 1.8;

/** Participants in a match: the player and bots. */
export const PARTICIPANTS = 8;
/**
 * Chick colours, in SPEC order: sunny yellow, pastel pink, mint, lavender,
 * sky, peach, cream, pistachio. i18n keys `look.color.<index>`.
 */
export const CHICK_COLORS: readonly number[] = [0xffd84a, 0xffa8c5, 0x8fe3c2, 0xc3a8f5, 0x8fcbff, 0xffb98a, 0xf6ead0, 0xc5e08a];
/** Accessories, in SPEC order. i18n keys `look.accessory.<name>`. */
export const ACCESSORIES = ['headphones', 'cap', 'glasses', 'crown', 'sprout', 'coffee'] as const;
export type Accessory = (typeof ACCESSORIES)[number];
/** Distance between chicks lined up at the spawn, metres. */
export const SPAWN_SPACING = 1.5;

/** Bots. Grid resolution for path finding, metres. */
export const NAV_STEP = 0.5;
/** Seconds a bot spends "doing" a window task, picked between the two. */
export const BOT_TASK_MIN = 24;
export const BOT_TASK_MAX = 44;
/** Pause after arriving somewhere while wandering, seconds. */
export const BOT_IDLE_MIN = 1.5;
export const BOT_IDLE_MAX = 5;
/** Delay before a bot moves after the start, picked up to this many seconds. */
export const BOT_START_DELAY = 2.5;
/** A bot that moved less than this in one second is stuck and re-plans, metres. */
export const BOT_STUCK_DISTANCE = 0.25;
/** A bot that stands at its goal without the matching prompt this long gives up for now, seconds. */
export const BOT_GIVE_UP = 2;
/** How long a bot leaves a task alone after giving up on it, seconds. */
export const BOT_AVOID_TIME = 20;

/** The Goose. One per match. */
export const GEESE = 1;
/** How close the Goose must be to pack a chick, metres. */
export const PACK_RANGE = 1.3;
/** Seconds between packs, and before the first one. */
export const PACK_COOLDOWN = 18;
export const PACK_FIRST_COOLDOWN = 10;
/** How close a chick must be to a vacation box to report it, metres. */
export const REPORT_RANGE = 1.6;
/** Goose tell: the neck stretches every TELL_MIN..TELL_MAX seconds for TELL_TIME. */
export const TELL_MIN = 12;
export const TELL_MAX = 15;
export const TELL_TIME = 0.9;
/** Someone this close to a stretching Goose gets the «га-га?» bubble, metres. */
export const TELL_BUBBLE_RANGE = 2.2;
/** The neck stretch is drawn only when the local player is this close, metres. */
export const TELL_VISIBLE_RANGE = 5;
/** Bot Goose: a chick counts as alone when nobody else is this close to it, metres. */
export const HUNT_ALONE_RADIUS = 7;
/** Bot Goose sight: a cone this wide ahead of it, this deep, walls block it. Degrees, metres. */
export const GOOSE_SIGHT_ANGLE = 100;
export const GOOSE_SIGHT_RANGE = 7;
/** Tunnel vision while the bot Goose pretends to work at a desk, degrees. */
export const GOOSE_WORK_SIGHT_ANGLE = 45;
/** Bot Goose remembers where it last saw its prey this long, seconds. */
export const GOOSE_MEMORY = 8;
/** Bot Goose does not hunt for this long after the match starts (and, from stage 4, after a meeting), seconds. */
export const GOOSE_GRACE = 12;
/** Bot Goose follows its prey this long before closing in, keeping this gap, seconds and metres. */
export const GOOSE_STALK_MIN = 2;
export const GOOSE_STALK_MAX = 4;
export const GOOSE_STALK_GAP = 3;
/** While stalking, the bot Goose stops for PAUSE_MIN..PAUSE_MAX seconds about every PAUSE_EVERY seconds. */
export const GOOSE_PAUSE_MIN = 0.5;
export const GOOSE_PAUSE_MAX = 1;
export const GOOSE_PAUSE_EVERY = 1.2;
/** Chance the bot Goose drops a stalk when the prey turns to it or someone else comes near. */
export const GOOSE_ABORT_CHANCE = 0.25;
/** Chance it drops a stalk for no reason at all («та ну, ліньки»). */
export const GOOSE_WHIM_CHANCE = 0.1;
/** The prey «turned around»: it faces the Goose within this angle from this close, degrees and metres. */
export const GOOSE_SPOTTED_ANGLE = 50;
export const GOOSE_SPOTTED_RANGE = 5;
/** After a pack the bot Goose plays a model worker for this long, seconds. */
export const GOOSE_ALIBI_MIN = 8;
export const GOOSE_ALIBI_MAX = 15;
/** After a dropped hunt, a shorter spell of it, seconds. */
export const GOOSE_DROP_ALIBI_MIN = 3;
export const GOOSE_DROP_ALIBI_MAX = 6;
/** It stands at each desk this long during the alibi, seconds. */
export const GOOSE_FAKE_MIN = 4;
export const GOOSE_FAKE_MAX = 8;
/** Right after a pack the bot Goose freezes this long, seconds. */
export const GOOSE_PACK_FREEZE = 1.2;
/** Early in the match the bot Goose may wave a heart at a lone chick instead of packing it. Seconds, chance. */
export const GOOSE_TRUST_WINDOW = 90;
export const GOOSE_TRUST_CHANCE = 0.3;
/** It shows the heart from this close, metres. */
export const GOOSE_TRUST_RANGE = 3;
/** A thought bubble over a participant lasts this long, seconds. */
export const THOUGHT_TIME = 1.6;
/** Bot chicks walk over to report a vacation box they see this close, metres. */
export const BOT_REPORT_SIGHT = 8;

/** Meetings (stage 4). Discussion, then voting, then the result card, seconds. */
export const MEETING_TALK = 30;
export const MEETING_VOTE = 20;
/** With two or more people in the match talking takes longer: discussion and voting, seconds. */
export const MEETING_TALK_PEOPLE = 50;
export const MEETING_VOTE_PEOPLE = 30;
export const MEETING_RESULT = 5;
/** Red «ТЕРМІНОВИЙ СОЗВОН» button: presses per participant per match. */
export const BUTTON_USES = 1;
/** The button cannot be pressed this long after the start and after each meeting, seconds. */
export const BUTTON_COOLDOWN = 15;
/** Seats around the meeting table: distance from the table centre, metres. */
export const MEETING_SEAT_RADIUS = 2.4;
/** A chick seeing a fresh vacation box remembers anyone this close to it, metres. */
export const BOX_SUSPECT_RANGE = 3;
/** Bot votes: chance to follow a strong accusation, to follow a vague hunch, to vote at random. */
export const BOT_FOLLOW_CHANCE = 0.7;
export const BOT_HUNCH_CHANCE = 0.6;
export const BOT_RANDOM_VOTE = 0.15;

/** Carpets: the Goose dives under one and crawls to another of the same network. */
export const CARPET_COUNT = 8;
/** Rug size, metres (long side, short side). */
export const CARPET_LONG = 1.4;
export const CARPET_SHORT = 0.9;
/** The Goose must stand this close to a rug's centre to dive under it, metres. */
export const CARPET_RANGE = 1.1;
/** Sight radius while hiding under a rug, metres. */
export const CARPET_VISION = 4;
/** The rug's edge lifts this long when someone dives in or climbs out, seconds. */
export const CARPET_DIVE = 0.4;
/** Pause between carpet actions (dive, crawl, climb out), seconds. */
export const CARPET_COOLDOWN = 0.5;
/** Bot Goose: escapes under a rug this close after a pack; stays 1.5–4 s, climbs out within 12 s, metres and seconds. */
export const CARPET_ESCAPE_RANGE = 9;
export const CARPET_HIDE_MIN = 1.5;
export const CARPET_HIDE_MAX = 4;
export const CARPET_HIDE_LIMIT = 12;

// --- Sabotages (stage 5) ---
/** «Перегрів рендер-ферми»: seconds to fix both fan points before the Goose wins. */
export const OVERHEAT_TIME = 65;
/** Sight radius of everyone while the render farm overheats, metres. */
export const OVERHEAT_VISION = 5;
/** «Терміновий дзвінок Модуса»: seconds to collect the NDA signatures, and how many different signers. */
export const CALL_TIME = 50;
export const CALL_SIGNERS = 2;
/** Pause before the first sabotage, after a fixed one and after every meeting, seconds. */
export const SABOTAGE_COOLDOWN = 40;
/** The Goose's neck stretches this many times more often while a sabotage runs. */
export const TELL_SABOTAGE_RATE = 3;
/** Share of bot chicks that drop everything and go to fix a sabotage. */
export const BOT_FIX_CHANCE = 0.4;
/** Bot Goose: waits this long after the cooldown before it starts a sabotage, seconds. */
export const GOOSE_SABOTAGE_MIN = 5;
export const GOOSE_SABOTAGE_MAX = 20;
/** Daylight, and the lights during «Перегрів»: intensities, backdrop colour, seconds to fade. */
export const SKY_LIGHT = 1.9;
export const SUN_LIGHT = 2.4;
export const GLOOM_SKY_LIGHT = 0.5;
export const GLOOM_SUN_LIGHT = 0.25;
export const GLOOM_SKY = 0x1a2238;
export const GLOOM_FADE = 0.8;

// --- Sound (stage 5) ---
/** Master volume on the first visit, 0..1. */
export const SOUND_DEFAULT_VOLUME = 0.7;
/** Seconds between the player's footsteps, between knocks of a carried box, and between alarm wails. */
export const STEP_EVERY = 0.27;
export const KNOCK_EVERY = 0.52;
export const ALARM_EVERY = 1.6;
/** Other participants' sounds fade to nothing at this distance, metres. */
export const HEARING_RANGE = 9;

// --- Sun rays (stage 5) ---
/** Slanted light sheets per window pane, and how opaque each is at the glass. */
export const SUN_RAY_LAYERS = 3;
export const SUN_RAY_OPACITY = 0.3;

// --- Touch screens ---
/** Thumb stick: travel in CSS pixels, rest zone and the push that counts as a flick (shares of the travel). */
export const STICK_RADIUS = 52;
export const STICK_DEADZONE = 0.22;
export const STICK_FLICK = 0.6;
/** Phones render at most this many device pixels per CSS pixel, with a smaller sun shadow map. */
export const TOUCH_PIXEL_RATIO = 1.5;
export const TOUCH_SHADOW_MAP = 2048;
export const SHADOW_MAP = 4096;
/** On a tall screen the camera keeps at least this share of its zoom as half-width, so the view is not a slit. */
export const PORTRAIT_FIT = 0.85;

// Stage 6 mini-games.
/** Starting handles are at least this far from the target. */
export const CURVE_MIN_START_OFFSET = 0.25;
export const GPU_START_TEMP = 0.9;
/** Heating per second while the fan is off; cooling per second while it is held. */
export const GPU_HEAT_RATE = 0.22;
export const GPU_COOL_RATE = 0.32;
/** Random load spikes: chance per second and size. */
export const GPU_SPIKE_CHANCE = 0.6;
export const GPU_SPIKE = 0.08;
/** «Занос на 777»: reel symbols, starting speed (symbols per second), slowdown per miss, floor speed. */
export const SLOT_SYMBOLS = 8;
/** Starting reel speed is rolled per round between these, symbols per second. */
export const SLOT_START_SPEED_MIN = 8;
export const SLOT_START_SPEED_MAX = 12;
/** Look-alike decoys of the round's target on every reel. */
export const SLOT_DECOYS = 2;
export const SLOT_SLOWDOWN = 0.75;
export const SLOT_MIN_SPEED = 2.5;
/** «Сканер бейджа»: allowed swipe duration, seconds. */
/** The wanted swipe time is rolled per round between these; the reader accepts it within ± BADGE_TIME_WINDOW (share). */
export const BADGE_TIME_MIN = 0.5;
export const BADGE_TIME_MAX = 1.6;
export const BADGE_TIME_WINDOW = 0.25;
/** Chance that the card starts wrong side up, and that it flips again after a failed swipe. */
export const BADGE_FLIP_CHANCE = 0.5;
export const BADGE_REFLIP_CHANCE = 0.3;
/** Chance per swipe that a nail gets stuck mid-way; at most this many snags per round. */
export const BADGE_NAIL_CHANCE = 0.35;
export const BADGE_MAX_NAILS = 2;
/** Share of the track that counts as a full swipe. */
export const BADGE_TRACK_DONE = 0.95;
/** «Занос на 777»: seconds a missed reel shows its symbol before spinning again. */
export const MINIGAME_SLOT_MISS_PAUSE = 0.6;
/** Minimap side in CSS pixels: small and expanded (click or tap toggles). */
export const MINIMAP_SIZE = 150;
export const MINIMAP_SIZE_BIG = 320;
/** Security cameras: rooms they watch (first room of each type), in tile order, and how far they see. */
export const CAMERA_ROOMS = ['lobby', 'meeting', 'motion', 'cargo'] as const;
export const CAMERA_RADIUS = 16;
/** Seconds a camera tile flashes after it caught a pack. */
export const CAMERA_ALERT_TIME = 4;
/** Bot memory for meeting lines: seconds of standing idle in plain sight that a chick remembers. */
export const BOT_IDLE_NOTE = 8;
/** Chance a bot votes for someone it only saw idling. */
export const BOT_IDLE_VOTE_CHANCE = 0.25;
/** Most recent sightings a bot keeps between meetings. */
export const BOT_NOTES_MAX = 4;

/** Quick reports: the player's lines at a meeting. Seconds between lines, and lines per meeting. */
export const PLAYER_SAY_COOLDOWN = 1.5;
export const PLAYER_SAY_MAX = 12;
/** Free text at a meeting: longest message, characters. */
export const CHAT_TEXT_MAX = 120;
/** Chance an undecided bot follows a player's eyewitness claim, a vague suspicion, or drops its vote after a player vouches. */
export const PLAYER_SWAY_SAW = 0.6;
export const PLAYER_SWAY_SUS = 0.3;
export const PLAYER_SWAY_VOUCH = 0.5;
/** Sightings a human player keeps between meetings, and how many become ready-made lines. */
export const PLAYER_SEEN_MAX = 12;
export const PLAYER_HINTS_MAX = 4;
/** Of those, at most this many plain «saw X in room Y». */
export const PLAYER_HINTS_MET = 2;
/** «Saw X in room Y» is refreshed every this many ticks. */
export const PLAYER_MET_EVERY = 10;

// Per-round variety of the older mini-games.
/** «Креатив один в один»: wires and switches are rolled per round within these. */
export const COPYCAT_WIRES_MIN = 3;
export const COPYCAT_WIRES_MAX = 5;
export const COPYCAT_SWITCHES_MIN = 2;
export const COPYCAT_SWITCHES_MAX = 4;
/** Chance the reference is drawn in one colour (trace the wires), and that the competitor updates it once mid-way. */
export const COPYCAT_MONO_CHANCE = 0.35;
export const COPYCAT_UPDATE_CHANCE = 0.35;
/** «Крива в Graph Editor»: tolerance is rolled between these; chance of a flipped value axis and of a changed brief. */
export const CURVE_TOLERANCE_MIN = 0.045;
export const CURVE_TOLERANCE_MAX = 0.07;
export const CURVE_FLIP_CHANCE = 0.3;
export const CURVE_REBRIEF_CHANCE = 0.3;
/** «Охолоди GPU»: green zone width and centre, hold time, rate scale and drift are rolled per round. */
export const GPU_ZONE_WIDTH_MIN = 0.14;
export const GPU_ZONE_WIDTH_MAX = 0.26;
export const GPU_ZONE_CENTRE_MIN = 0.35;
export const GPU_ZONE_CENTRE_MAX = 0.65;
export const GPU_HOLD_MIN = 3;
export const GPU_HOLD_MAX = 5;
export const GPU_RATE_SPREAD = 0.25;
export const GPU_DRIFT_CHANCE = 0.4;
export const GPU_DRIFT_AMPLITUDE = 0.1;
export const GPU_DRIFT_PERIOD = 6;

/** Bots and the Goose's neck: chance a bot chick in sight and range notices one stretch. */
export const BOT_TELL_NOTICE = 0.3;
/** Chance it votes for the neck's owner after noticing once, and after noticing twice or more. */
export const BOT_TELL_VOTE = 0.5;
export const BOT_TELL_SURE = 0.9;
/** A bot chick alone with its suspect this close walks off to other chicks, metres. */
export const BOT_WARY_RANGE = 5;
/** «Alone» means no third participant in sight within this distance, metres. */
export const BOT_COMPANY_RANGE = 6;
/** It keeps walking away this long, then does not bolt again for a while, seconds. */
export const BOT_WARY_TIME = 6;
export const BOT_WARY_REST = 12;
