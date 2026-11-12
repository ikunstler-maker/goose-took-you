import { MODUS_TARGET } from '../../config';
import { t, type I18nKey } from '../../i18n';
import type { MinigameContext, MinigameView } from '../types';
import { closeSticker, createModus, tickModus } from './logic';

/** «Відбитись від правок Модуса»: close stickers with the cross or drag them into the bin. */
export function createModusView(ctx: MinigameContext): MinigameView {
  const state = createModus(ctx.seed);
  const root = document.createElement('div');
  root.className = 'modus';
  root.innerHTML = `
    <p class="mg-goal"></p>
    <div class="modus-stats">
      <span class="modus-count"></span>
      <span class="modus-chaos-label"></span>
      <div class="modus-meter"><div class="modus-fill"></div></div>
    </div>
    <div class="modus-board">
      <div class="modus-timeline"><span></span><i></i><i></i><i></i><i></i></div>
      <div class="modus-bin"><b class="modus-bin-icon"></b><span></span></div>
      <div class="modus-lost"></div>
    </div>`;
  ctx.body.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
  const goal = q('.mg-goal');
  const count = q('.modus-count');
  const chaosLabel = q('.modus-chaos-label');
  const fill = q('.modus-fill');
  const board = q('.modus-board');
  const bin = q('.modus-bin');
  const binLabel = q('.modus-bin span');
  const timeline = q('.modus-timeline span');
  const lost = q('.modus-lost');
  const elements = new Map<number, HTMLElement>();
  let dragging: { id: number; el: HTMLElement; dx: number; dy: number } | null = null;
  let reported = false;

  const overBin = (event: PointerEvent): boolean => {
    const r = bin.getBoundingClientRect();
    return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
  };

  const onMove = (event: PointerEvent): void => {
    if (!dragging) return;
    const b = board.getBoundingClientRect();
    dragging.el.style.left = `${event.clientX - b.left - dragging.dx}px`;
    dragging.el.style.top = `${event.clientY - b.top - dragging.dy}px`;
    bin.classList.toggle('hot', overBin(event));
  };
  const onUp = (event: PointerEvent): void => {
    if (!dragging) return;
    const { id, el } = dragging;
    dragging = null;
    el.classList.remove('drag');
    bin.classList.remove('hot');
    if (overBin(event)) closeSticker(state, id);
    draw();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  const makeSticker = (id: number, tilt: number): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'modus-sticker';
    el.style.setProperty('--tilt', `${tilt}deg`);
    const text = document.createElement('span');
    const cross = document.createElement('button');
    cross.type = 'button';
    cross.textContent = '×';
    cross.addEventListener('pointerdown', (event) => event.stopPropagation());
    cross.addEventListener('click', () => {
      closeSticker(state, id);
      draw();
    });
    el.append(text, cross);
    el.addEventListener('pointerdown', (event) => {
      const r = el.getBoundingClientRect();
      // Positions are stored as centres; switch to pixel offsets for the drag.
      dragging = { id, el, dx: event.clientX - r.left, dy: event.clientY - r.top };
      el.classList.add('drag');
      onMove(event);
      event.preventDefault();
    });
    board.append(el);
    return el;
  };

  let closedHeard = 0;
  function draw(): void {
    if (state.closed > closedHeard) ctx.sound('stickerClose');
    closedHeard = state.closed;
    goal.textContent = t('minigame.modus.goal', { count: MODUS_TARGET });
    count.textContent = t('minigame.modus.closed', { closed: state.closed, count: MODUS_TARGET });
    chaosLabel.textContent = `${t('minigame.modus.chaos')} ${Math.round(state.chaos)}%`;
    fill.style.width = `${state.chaos}%`;
    binLabel.textContent = t('minigame.modus.bin');
    timeline.textContent = t('minigame.modus.timeline');
    lost.textContent = t('minigame.modus.lost');
    lost.hidden = state.status !== 'lost';

    const alive = new Set(state.stickers.map((s) => s.id));
    for (const [id, el] of elements) {
      if (!alive.has(id)) {
        el.remove();
        elements.delete(id);
        if (dragging?.id === id) dragging = null;
      }
    }
    for (const sticker of state.stickers) {
      let el = elements.get(sticker.id);
      if (!el) {
        el = makeSticker(sticker.id, sticker.tilt);
        ctx.sound('sticker');
        elements.set(sticker.id, el);
        el.style.left = `calc(${sticker.x * 100}% - 80px)`;
        el.style.top = `calc(${sticker.y * 100}% - 34px)`;
      }
      el.firstElementChild!.textContent = t(`minigame.modus.note${sticker.note}` as I18nKey);
    }
    // The winning sticker is closed by input, not by a tick, so the check lives here.
    if (!reported && state.status === 'won') {
      reported = true;
      ctx.win();
    }
  }

  draw();
  return {
    tick(dt) {
      tickModus(state, dt);
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
