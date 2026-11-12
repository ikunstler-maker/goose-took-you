// Fixed room interiors. Coordinates are local to the room centre:
// x grows east, z grows south, the room spans -6..6 on both axes.
// Doors sit at the middle of a side, so props stay clear of those approaches.

export type RoomType =
  | 'lobby'
  | 'buying'
  | 'copycat'
  | 'news'
  | 'cargo'
  | 'motion'
  | 'meeting'
  | 'lounge'
  | 'greenhouse';

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
  | 'stickerBoard';

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
    p('tv', -3.7, -5.3, 3.8, 0.5),
    p('reception', 3.7, -4.4, 3, 1),
    p('mirror', -5.4, 3.6, 0.4, 1.6, 1),
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
    p('stool', -3.6, -1, 0.5, 0.5, 0, false),
    p('stool', -3.6, 3.6, 0.5, 0.5, 0, false),
    p('stool', 3.6, -1, 0.5, 0.5, 0, false),
    p('stool', 3.6, 3.6, 0.5, 0.5, 0, false),
    p('monstera', 5, -5, 0.8, 0.8),
    p('ficus', -5, 5, 0.8, 0.8),
    p('monstera', 5, 5, 0.8, 0.8),
  ],
  copycat: [
    p('deskCopy', -3.6, -4.6, 2.4, 1),
    p('deskCopy', 3.6, -4.6, 2.4, 1),
    p('deskCopy', -3.6, 3, 2.4, 1),
    p('deskCopy', 3.6, 3, 2.4, 1),
    p('stool', -3.6, -3.6, 0.5, 0.5, 0, false),
    p('stool', 3.6, -3.6, 0.5, 0.5, 0, false),
    p('planter', 0, 5.2, 2.6, 0.7, 0, false),
    p('ficus', -5, 5, 0.8, 0.8),
    p('monstera', 5, 5, 0.8, 0.8),
  ],
  news: [
    p('dualStation', 0, -0.2, 4.6, 1.4),
    p('stool', -1.3, 1.1, 0.5, 0.5, 0, false),
    p('stool', 1.3, 1.1, 0.5, 0.5, 0, false),
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
    p('stickerBoard', -1.5, -5.6, 1.8, 0.2, 0, false),
    p('rack', 2.6, -5.1, 1, 1),
    p('rack', 3.8, -5.1, 1, 1),
    p('rack', 5, -5.1, 1, 1),
    p('thermometer', 5.6, -3, 0.2, 0.6, 3, false),
    p('fan', 4.8, 3.8, 1.4, 1.4),
    p('monstera', -5, 5, 0.8, 0.8),
    p('ficus', 2.4, 5, 0.8, 0.8),
  ],
  meeting: [
    p('meetingTable', 0, 0, 3.4, 3.4),
    p('kanban', -3.7, -5.5, 3.2, 0.3),
    p('stool', -2.4, 0, 0.5, 0.5, 0, false),
    p('stool', 2.4, 0, 0.5, 0.5, 0, false),
    p('stool', 0, -2.4, 0.5, 0.5, 0, false),
    p('stool', 0, 2.4, 0.5, 0.5, 0, false),
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
};

/** Rooms shuffled into the non-centre slots. The lobby always takes the centre. */
export const SHUFFLED_ROOMS: RoomType[] = [
  'buying',
  'copycat',
  'news',
  'cargo',
  'motion',
  'meeting',
  'lounge',
  'greenhouse',
];
