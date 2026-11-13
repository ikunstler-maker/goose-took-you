import { NEWS_FILES, NEWS_GRID } from '../../config';
import { t } from '../../i18n';
import type { MinigameContext, MinigameView } from '../types';
import { drawBeachCard } from '../../art/beach';
import { catchTile, createNews, NEWS_NODES, tickNews } from './logic';

const CARD = 96;

/** Clickbait thumbnail: a chibi beach-goer with a pixel mosaic, picked by the tile's art number. */
function paintCard(canvas: HTMLCanvasElement, art: number): void {
  canvas.width = CARD;
  canvas.height = CARD;
  drawBeachCard(canvas.getContext('2d')!, CARD, art);
}

/** «Монтаж новостніків»: catch flashing files into the Stack, the partner feeds the lit node. */
export function createNewsView(ctx: MinigameContext): MinigameView {
  const state = createNews(ctx.seed);
  const root = document.createElement('div');
  root.className = 'news';
  root.innerHTML = `
    <p class="mg-goal"></p>
    <div class="news-desk">
      <section class="news-grid"></section>
      <section class="news-stack"><h3></h3><div class="news-files"></div></section>
      <section class="news-partner"><h3></h3><div class="news-nodes"></div><p class="news-partner-status"></p></section>
    </div>
    <div class="news-bottom">
      <span class="news-count"></span>
      <span class="news-press"></span>
    </div>`;
  ctx.body.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
  const goal = q('.mg-goal');
  const grid = q('.news-grid');
  const stackBox = q('.news-stack');
  const stackTitle = q('.news-stack h3');
  const files = q('.news-files');
  const partnerTitle = q('.news-partner h3');
  const partnerStatus = q('.news-partner-status');
  const nodesBox = q('.news-nodes');
  const count = q('.news-count');
  const press = q('.news-press');

  const cells: HTMLElement[] = [];
  for (let i = 0; i < NEWS_GRID * NEWS_GRID; i++) {
    const cell = document.createElement('div');
    cell.className = 'news-cell';
    grid.append(cell);
    cells.push(cell);
  }
  const nodes: HTMLElement[] = [];
  for (let i = 0; i < NEWS_NODES; i++) {
    const node = document.createElement('div');
    node.className = 'news-node';
    nodesBox.append(node);
    nodes.push(node);
  }

  const tileEls = new Map<number, HTMLCanvasElement>();
  let dragging: { id: number; el: HTMLCanvasElement } | null = null;
  let reported = false;

  const overStack = (event: PointerEvent): boolean => {
    const r = stackBox.getBoundingClientRect();
    return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
  };
  const onMove = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging.el.style.left = `${event.clientX - 28}px`;
    dragging.el.style.top = `${event.clientY - 28}px`;
    stackBox.classList.toggle('hot', overStack(event));
  };
  const onUp = (event: PointerEvent): void => {
    if (!dragging) return;
    const { id, el } = dragging;
    dragging = null;
    el.classList.remove('drag');
    el.style.left = '';
    el.style.top = '';
    stackBox.classList.remove('hot');
    if (overStack(event)) catchTile(state, id);
    draw();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function draw(): void {
    goal.textContent = t('minigame.news.goal', { count: NEWS_FILES });
    stackTitle.textContent = t('minigame.news.stack');
    partnerTitle.textContent = t('minigame.news.partner');
    partnerStatus.textContent =
      state.phase === 'waiting'
        ? t('minigame.news.waiting', { seconds: Math.ceil(state.waitLeft) })
        : state.botPartner
          ? t('minigame.news.bot')
          : '';
    count.textContent = t('minigame.news.count', { done: state.delivered, count: NEWS_FILES });
    press.textContent = t('minigame.news.thenButton');

    const alive = new Set(state.tiles.map((tile) => tile.id));
    for (const [id, el] of tileEls) {
      if (!alive.has(id) && dragging?.id !== id) {
        el.remove();
        tileEls.delete(id);
      }
    }
    // A picture that expires mid-drag is gone from the logic; drop the ghost too.
    if (dragging && !alive.has(dragging.id)) {
      dragging.el.remove();
      tileEls.delete(dragging.id);
      dragging = null;
      stackBox.classList.remove('hot');
    }
    for (const tile of state.tiles) {
      if (tileEls.has(tile.id)) continue;
      const el = document.createElement('canvas');
      el.className = 'news-tile';
      paintCard(el, tile.art);
      const id = tile.id;
      el.addEventListener('pointerdown', (event) => {
        dragging = { id, el };
        el.classList.add('drag');
        onMove(event);
        event.preventDefault();
      });
      cells[tile.cell]!.append(el);
      tileEls.set(id, el);
    }
    for (const tile of state.tiles) tileEls.get(tile.id)!.classList.toggle('fading', tile.life < 0.4);

    if (files.childElementCount !== state.stack.length) {
      files.replaceChildren(
        ...state.stack.map((art) => {
          const c = document.createElement('canvas');
          c.className = 'news-file';
          paintCard(c, art);
          return c;
        }),
      );
    }
    nodes.forEach((node, i) => node.classList.toggle('lit', state.litNode === i));

    if (!reported && state.phase === 'won') {
      reported = true;
      ctx.win();
    }
  }

  draw();
  return {
    tick(dt) {
      tickNews(state, dt);
      draw();
    },
    draw,
    destroy() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      root.remove();
    },
  };
}
