import {
  NEWS_BOT_BUTTON,
  NEWS_BOT_REACTION,
  NEWS_FILES,
  NEWS_GRID,
  NEWS_NODE_EVERY,
  NEWS_PARTNER_DELAY,
  NEWS_TILE_EVERY,
  NEWS_TILE_LIFE,
} from '../../config';
import { createRng, type Rng } from '../../sim/rng';

/** Number of output nodes on the partner's side. */
export const NEWS_NODES = 3;

/** A pixel picture flashing in the grid. Its look is an abstract mosaic picked by `art`. */
export interface Tile {
  id: number;
  cell: number;
  art: number;
  life: number;
}

export interface NewsState {
  rng: Rng;
  /** waiting: partner not seated yet · work: catching files · button: both must press · won */
  phase: 'waiting' | 'work' | 'button' | 'won';
  waitLeft: number;
  /** True when the partner is a bot (nobody joined in time). */
  botPartner: boolean;
  tiles: Tile[];
  nextTile: number;
  tileIn: number;
  /** Arts of files caught into the shared Stack, oldest first. */
  stack: number[];
  /** Node the partner must feed next, or -1 between flashes. */
  litNode: number;
  nodeIn: number;
  /** Seconds the bot partner has been staring at a lit node with a file ready. */
  botWait: number;
  delivered: number;
  pressedSelf: boolean;
  pressedPartner: boolean;
  botButtonIn: number;
}

export function createNews(seed: number): NewsState {
  return {
    rng: createRng(seed),
    phase: 'waiting',
    waitLeft: NEWS_PARTNER_DELAY,
    botPartner: false,
    tiles: [],
    nextTile: 1,
    tileIn: 0.2,
    stack: [],
    litNode: -1,
    nodeIn: NEWS_NODE_EVERY / 2,
    botWait: 0,
    delivered: 0,
    pressedSelf: false,
    pressedPartner: false,
    botButtonIn: NEWS_BOT_BUTTON,
  };
}

function spawnTile(state: NewsState): void {
  const free: number[] = [];
  for (let c = 0; c < NEWS_GRID * NEWS_GRID; c++) if (!state.tiles.some((t) => t.cell === c)) free.push(c);
  if (free.length === 0) return;
  state.tiles.push({ id: state.nextTile++, cell: state.rng.pick(free), art: state.rng.int(1 << 16), life: NEWS_TILE_LIFE });
}

/** Bot partner: when a node lights and the Stack has a file, drops it in after a short reaction. */
function partnerStep(state: NewsState, dt: number): void {
  if (state.litNode < 0) {
    state.nodeIn -= dt;
    if (state.nodeIn <= 0) {
      state.litNode = state.rng.int(NEWS_NODES);
      state.botWait = 0;
    }
    return;
  }
  if (state.stack.length === 0) return;
  state.botWait += dt;
  if (state.botWait < NEWS_BOT_REACTION) return;
  state.stack.shift();
  state.delivered++;
  state.litNode = -1;
  state.nodeIn = NEWS_NODE_EVERY;
  if (state.delivered >= NEWS_FILES) {
    state.phase = 'button';
    state.tiles = [];
  }
}

export function tickNews(state: NewsState, dt: number): void {
  switch (state.phase) {
    case 'waiting':
      state.waitLeft -= dt;
      if (state.waitLeft <= 0) {
        state.botPartner = true;
        state.phase = 'work';
      }
      return;
    case 'work':
      for (const tile of state.tiles) tile.life -= dt;
      state.tiles = state.tiles.filter((t) => t.life > 0);
      state.tileIn -= dt;
      if (state.tileIn <= 0) {
        spawnTile(state);
        state.tileIn = NEWS_TILE_EVERY;
      }
      partnerStep(state, dt);
      return;
    case 'button':
      if (state.botPartner && !state.pressedPartner) {
        state.botButtonIn -= dt;
        if (state.botButtonIn <= 0) state.pressedPartner = true;
      }
      if (state.pressedSelf && state.pressedPartner) state.phase = 'won';
      return;
    case 'won':
      return;
  }
}

/** The player drags a flashing picture into the shared Stack. */
export function catchTile(state: NewsState, id: number): boolean {
  if (state.phase !== 'work') return false;
  const index = state.tiles.findIndex((t) => t.id === id);
  if (index < 0) return false;
  state.stack.push(state.tiles[index]!.art);
  state.tiles.splice(index, 1);
  return true;
}

export function pressButton(state: NewsState): void {
  if (state.phase !== 'button') return;
  state.pressedSelf = true;
  if (state.pressedPartner) state.phase = 'won';
}
