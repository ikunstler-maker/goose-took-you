// Fixed room hubs. Coordinates are local to the centre of the room's core
// square: x grows east, z grows south, the core spans -6..6 on both axes.
// The core is the north-west part of a room; the rest of the room shape and
// its filler furniture are generated per match (see level.ts).

export type RoomType =
  | 'lobby'
  | 'buying'
  | 'copycat'
  | 'news'
  | 'cargo'
  | 'motion'
  | 'meeting'
  | 'lounge'
  | 'greenhouse'
  | 'gambling'
  | 'security';

export type PropKind =
  | 'desk'
  | 'deskBuyer'
  | 'deskCopy'
  | 'ultrawide'
  | 'dualStation'
  | 'rack'
  | 'fan'
  | 'shelf'
  | 'box'
  | 'meetingTable'
  | 'kanban'
  | 'tv'
  | 'dashboard'
  | 'mirror'
  | 'reception'
  | 'bonsaiDeck'
  | 'bonsai'
  | 'espressoBar'
  | 'cornMachine'
  | 'sofa'
  | 'coffeeTable'
  | 'bench'
  | 'monstera'
  | 'ficus'
  | 'planter'
  | 'stool'
  | 'thermometer'
  | 'stickerBoard'
  | 'bookshelf'
  | 'lockers'
  | 'cooler'
  | 'printer'
  | 'whiteboard'
  | 'beanbag'
  | 'rug'
  | 'lamp'
  | 'arcade'
  | 'cabinet'
  | 'palm'
  | 'cactus'
  | 'crates'
  | 'ringLight'
  | 'briefTablet'
  | 'slotMachine'
  | 'bigWinSign'
  | 'cameraDesk'
  | 'badgeScanner'
  | 'badgeRack';

/** Quarter turns: 0 = front faces south (+z), 1 = east, 2 = north, 3 = west. */
export type Rot = 0 | 1 | 2 | 3;

export interface PrefabProp {
  kind: PropKind;
  x: number;
  z: number;
  /** Footprint along x and z before rotation. */
  w: number;
  d: number;
  rot?: Rot;
  /** Non-solid props are decoration the player can walk through. */
  solid?: boolean;
}

const p = (
  kind: PropKind,
  x: number,
  z: number,
  w: number,
  d: number,
  rot: Rot = 0,
  solid = true,
): PrefabProp => ({ kind, x, z, w, d, rot, solid });

const corners = (kind: PropKind, inset = 5): PrefabProp[] => [
  p(kind, -inset, -inset, 0.8, 0.8),
  p(kind, inset, -inset, 0.8, 0.8),
  p(kind, -inset, inset, 0.8, 0.8),
  p(kind, inset, inset, 0.8, 0.8),
];

export const PREFABS: Record<RoomType, PrefabProp[]> = {
  lobby: [
    p('bonsaiDeck', 0, 0, 5, 5, 0, false),
    p('bonsai', 0, 0, 1.1, 1.1),
    p('bonsai', -1.7, -1.2, 0.6, 0.6),
    p('bonsai', 1.7, -1.2, 0.6, 0.6),
    p('tv', -3, -5.6, 5.4, 0.5),
    p('reception', 3.7, -4.4, 3, 1),
    p('mirror', -5.7, 3.6, 1.6, 0.4, 1),
    p('monstera', 5, 5, 0.8, 0.8),
    p('ficus', -5, 5, 0.8, 0.8),
    p('ficus', 5, -2.6, 0.8, 0.8),
  ],
  buying: [
    p('dashboard', -3.7, -5.4, 4, 0.4),
    p('deskBuyer', -3.6, -2, 2.2, 1),
    p('deskBuyer', -3.6, 2.6, 2.2, 1),
    p('deskBuyer', 3.6, -2, 2.2, 1),
    p('deskBuyer', 3.6, 2.6, 2.2, 1),
    p('stool', -3.6, -1, 0.5, 0.5),
    p('stool', -3.6, 3.6, 0.5, 0.5),
    p('stool', 3.6, -1, 0.5, 0.5),
    p('stool', 3.6, 3.6, 0.5, 0.5),
    p('monstera', 5, -5, 0.8, 0.8),
    p('ficus', -5, 5, 0.8, 0.8),
    p('monstera', 5, 5, 0.8, 0.8),
  ],
  copycat: [
    p('deskCopy', -3.6, -4.6, 2.4, 1),
    p('deskCopy', 3.6, -4.6, 2.4, 1),
    p('deskCopy', -3.6, 3, 2.4, 1),
    p('deskCopy', 3.6, 3, 2.4, 1),
    p('stool', -3.6, -3.6, 0.5, 0.5),
    p('stool', 3.6, -3.6, 0.5, 0.5),
    p('planter', 0, 5.2, 3.3, 0.8),
    p('ficus', -5, 5, 0.8, 0.8),
    p('monstera', 5, 5, 0.8, 0.8),
  ],
  news: [
    p('dualStation', 0, -0.2, 4.6, 1.4),
    p('stool', -1.3, 1.1, 0.5, 0.5),
    p('stool', 1.3, 1.1, 0.5, 0.5),
    p('desk', -4, -4.8, 2, 1),
    p('desk', 4, -4.8, 2, 1),
    ...corners('monstera').slice(2),
    p('ficus', -5, -2.6, 0.8, 0.8),
  ],
  cargo: [
    p('shelf', -3.8, -5.1, 3.4, 1),
    p('shelf', 3.8, -5.1, 3.4, 1),
    p('shelf', -5.1, 3.6, 3.4, 1, 1),
    p('box', 3, 3, 0.9, 0.9),
    p('box', 4, 3.5, 0.9, 0.9),
    p('box', 3.3, 4.2, 0.9, 0.9),
    p('box', -2.6, -3.4, 0.9, 0.9),
    p('ficus', 5, -2.8, 0.8, 0.8),
    p('monstera', -5, -2.8, 0.8, 0.8),
  ],
  motion: [
    p('ultrawide', -3.9, -4.6, 2.6, 1.1),
    p('ultrawide', -5, -2.4, 2.6, 1.1, 1),
    p('ultrawide', -3.9, 3.4, 2.6, 1.1),
    p('stickerBoard', -1.5, -5.6, 1.8, 0.3),
    p('rack', 2.6, -5.1, 1, 1),
    p('rack', 3.8, -5.1, 1, 1),
    p('rack', 5, -5.1, 1, 1),
    p('thermometer', 5.6, -3, 0.5, 0.3, 3),
    p('fan', 4.8, 3.8, 1.4, 1.4),
    p('monstera', -5, 5, 0.8, 0.8),
    p('ficus', 2.4, 5, 0.8, 0.8),
  ],
  meeting: [
    p('meetingTable', 0, 0, 3.4, 3.4),
    p('kanban', -3.7, -5.5, 3.2, 0.3),
    p('briefTablet', 0.6, -5.2, 1.2, 0.6),
    p('stool', -2.4, 0, 0.5, 0.5),
    p('stool', 2.4, 0, 0.5, 0.5),
    p('stool', 0, -2.4, 0.5, 0.5),
    p('stool', 0, 2.4, 0.5, 0.5),
    ...corners('ficus'),
  ],
  lounge: [
    p('espressoBar', -3.7, -5.1, 3.4, 1),
    p('cornMachine', 4, -5.1, 1.1, 1),
    p('sofa', 3.6, 4.4, 3.2, 1.1, 2),
    p('coffeeTable', 3.6, 2.8, 1.4, 0.8),
    p('sofa', -5, 3.4, 3.2, 1.1, 1),
    p('monstera', 5, -2.8, 0.8, 0.8),
    p('ficus', -5, -2.8, 0.8, 0.8),
    p('monstera', -2.6, 5, 0.8, 0.8),
  ],
  greenhouse: [
    p('planter', -3.8, -5.2, 3.4, 0.9),
    p('planter', 3.8, -5.2, 3.4, 0.9),
    p('planter', -5.2, 3.6, 3.4, 0.9, 1),
    p('planter', 5.2, 3.6, 3.4, 0.9, 1),
    p('bench', 0, 0, 2.6, 0.8),
    p('bonsai', -2.6, -2.4, 0.7, 0.7),
    p('bonsai', 2.6, 2.4, 0.7, 0.7),
    p('ficus', 2.6, -2.4, 0.8, 0.8),
    p('monstera', -2.6, 2.4, 0.8, 0.8),
  ],
  gambling: [
    p('bigWinSign', 0, -5.6, 4, 0.3),
    p('slotMachine', -3.6, -4.8, 1.2, 1),
    p('slotMachine', 3.6, -4.8, 1.2, 1),
    p('slotMachine', -5, 2.6, 1.2, 1, 1),
    p('arcade', 5, 2.6, 0.9, 0.9, 3),
    p('stool', -3.6, -3.7, 0.5, 0.5),
    p('stool', 3.6, -3.7, 0.5, 0.5),
    p('stool', -3.9, 2.6, 0.5, 0.5),
    p('palm', -5, 5, 0.9, 0.9),
    p('monstera', 5, 5, 0.8, 0.8),
  ],
  security: [
    p('cameraDesk', -2.6, -4.9, 3.6, 1.2),
    p('stool', -2.6, -3.7, 0.5, 0.5),
    p('badgeRack', 3.8, -4.9, 1.6, 0.6),
    p('lockers', -5.4, 2.6, 2, 0.6, 1),
    p('cabinet', 5.4, -1, 1, 0.6, 3),
    p('ficus', -5, 5, 0.8, 0.8),
    p('cactus', 5, 5, 0.7, 0.7),
  ],
};

/** Rooms shuffled into the non-lobby slots; spare slots repeat green zones and storage. */
export const SHUFFLED_ROOMS: RoomType[] = [
  'gambling',
  'security',
  'greenhouse',
  'lounge',
  'cargo',
  'greenhouse',
  'lounge',
  'buying',
  'copycat',
  'news',
  'cargo',
  'motion',
  'meeting',
  'lounge',
  'greenhouse',
];

/** Filler furniture placed against walls; `w` runs along the wall, `d` into the room. */
export interface Filler {
  kind: PropKind;
  w: number;
  d: number;
}

const f = (kind: PropKind, w: number, d: number): Filler => ({ kind, w, d });

const PLANTS: Filler[] = [f('monstera', 0.8, 0.8), f('ficus', 0.8, 0.8), f('palm', 0.9, 0.9), f('cactus', 0.7, 0.7)];

export const FILLERS: Record<RoomType | 'corridor', Filler[]> = {
  lobby: [f('sofa', 3.2, 1.1), f('bookshelf', 2, 0.6), f('lamp', 0.5, 0.5), f('palm', 0.9, 0.9), f('cooler', 0.6, 0.6), ...PLANTS],
  buying: [f('deskBuyer', 2.2, 1), f('cabinet', 1, 0.6), f('whiteboard', 2, 0.4), f('cooler', 0.6, 0.6), f('lockers', 2, 0.6), ...PLANTS],
  copycat: [f('deskCopy', 2.4, 1), f('bookshelf', 2, 0.6), f('printer', 1, 0.8), f('whiteboard', 2, 0.4), ...PLANTS],
  news: [f('desk', 2, 1), f('ringLight', 0.7, 0.7), f('whiteboard', 2, 0.4), f('cabinet', 1, 0.6), f('printer', 1, 0.8), ...PLANTS],
  cargo: [f('shelf', 3.4, 1), f('crates', 1.8, 1), f('lockers', 2, 0.6), f('box', 0.9, 0.9), f('crates', 1.8, 1), f('cactus', 0.7, 0.7)],
  motion: [f('ultrawide', 2.6, 1.1), f('rack', 1, 1), f('bookshelf', 2, 0.6), f('beanbag', 0.9, 0.9), f('lamp', 0.5, 0.5), ...PLANTS],
  meeting: [f('whiteboard', 2, 0.4), f('cabinet', 1, 0.6), f('lamp', 0.5, 0.5), f('bookshelf', 2, 0.6), f('cooler', 0.6, 0.6), ...PLANTS],
  lounge: [f('sofa', 3.2, 1.1), f('arcade', 0.9, 0.9), f('beanbag', 0.9, 0.9), f('cooler', 0.6, 0.6), f('lamp', 0.5, 0.5), f('arcade', 0.9, 0.9), ...PLANTS],
  greenhouse: [f('planter', 3.3, 0.8), f('bench', 2.6, 0.8), f('palm', 0.9, 0.9), f('planter', 3.3, 0.8), ...PLANTS, ...PLANTS],
  gambling: [f('arcade', 0.9, 0.9), f('slotMachine', 1.2, 1), f('sofa', 3.2, 1.1), f('lamp', 0.5, 0.5), f('arcade', 0.9, 0.9), ...PLANTS],
  security: [f('lockers', 2, 0.6), f('cabinet', 1, 0.6), f('whiteboard', 2, 0.4), f('cooler', 0.6, 0.6), f('bookshelf', 2, 0.6), ...PLANTS],
  corridor: [f('bench', 2.6, 0.8), f('cooler', 0.6, 0.6), f('lockers', 2, 0.6), f('printer', 1, 0.8), f('lamp', 0.5, 0.5), ...PLANTS, ...PLANTS],
};

/** Free-standing pieces dropped on a rug in open floor. */
export const ISLAND_PIECES: PropKind[] = ['beanbag', 'coffeeTable', 'stool', 'beanbag'];
