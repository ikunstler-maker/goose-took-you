import { t } from '../../i18n';
import { createCanvasShell } from '../canvas';
import type { MinigameContext, MinigameView } from '../types';
import { createBadge, drag, flip, grab, release, tickBadge, type SwipeResult } from './logic';

const S = 300;
const TRACK0 = 30;
const TRACK1 = 270;
const CARD = 70;

const seconds = (v: number): string => v.toFixed(1).replace('.', ',');

/** «Сканер бейджа»: drag the card through the reader the way this reader wants it. */
export function createBadgeView(ctx: MinigameContext): MinigameView {
  const state = createBadge(ctx.seed);
  const shell = createCanvasShell(ctx.body, 'badge', S, S);
  const { g } = shell;
  const turn = document.createElement('button');
  turn.type = 'button';
  turn.className = 'mg-big-button';
  shell.root.append(turn);
  const horizontal = state.dir === 'right' || state.dir === 'left';
  const reversed = state.dir === 'left' || state.dir === 'up';
  let grabOffset = 0;
  let won = false;

  /** Card's leading-edge coordinate along the travel axis for a track position. */
  const along = (pos: number): number => {
    const p = reversed ? 1 - pos : pos;
    return TRACK0 + p * (TRACK1 - TRACK0 - CARD);
  };
  const cardRect = (): { x: number; y: number; w: number; h: number } =>
    horizontal ? { x: along(state.pos), y: 95, w: CARD, h: 100 } : { x: 100, y: along(state.pos), w: 100, h: CARD };
  const axis = (p: { x: number; y: number }): number => (horizontal ? p.x : p.y);

  const report = (result: SwipeResult | null): void => {
    if (result && result !== 'ok') ctx.sound('bonk');
    draw();
  };

  shell.canvas.addEventListener('pointerdown', (event) => {
    const p = shell.local(event);
    const r = cardRect();
    if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) return;
    grab(state);
    grabOffset = axis(p) - along(0);
    shell.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  shell.canvas.addEventListener('pointermove', (event) => {
    if (state.elapsed === null) return;
    const travelled = (axis(shell.local(event)) - grabOffset - along(0)) / (TRACK1 - TRACK0 - CARD);
    report(drag(state, reversed ? -travelled : travelled));
  });
  shell.canvas.addEventListener('pointerup', () => report(release(state)));
  const doFlip = (): void => {
    flip(state);
    ctx.sound('click');
    draw();
  };
  turn.addEventListener('click', doFlip);
  const onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyF' || event.repeat) return;
    doFlip();
  };
  window.addEventListener('keydown', onKey);

  function draw(): void {
    shell.goal.textContent = t('minigame.badge.goal', {
      dir: t(`minigame.badge.dir.${state.dir}`),
      min: seconds(state.minTime),
      max: seconds(state.maxTime),
    });
    turn.textContent = t('minigame.badge.flip');
    g.fillStyle = '#c3cad3';
    g.fillRect(0, 0, S, S);
    // Reader slot along the travel axis, with an arrow showing the way.
    g.fillStyle = '#2f3340';
    if (horizontal) g.fillRect(TRACK0 - 10, 170, TRACK1 - TRACK0 + 20, 34);
    else g.fillRect(176, TRACK0 - 10, 34, TRACK1 - TRACK0 + 20);
    g.save();
    g.translate(S / 2, horizontal ? 60 : S / 2);
    if (!horizontal) g.translate(-110, 0);
    g.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[state.dir]);
    g.fillStyle = '#5b6577';
    g.beginPath();
    g.moveTo(-34, -7);
    g.lineTo(10, -7);
    g.lineTo(10, -18);
    g.lineTo(36, 0);
    g.lineTo(10, 18);
    g.lineTo(10, 7);
    g.lineTo(-34, 7);
    g.closePath();
    g.fill();
    g.restore();
    const light = state.elapsed !== null || state.last === null ? '#ffc93d' : state.last === 'ok' ? '#7be05a' : '#ff4b3e';
    g.fillStyle = light;
    g.beginPath();
    g.arc(S - 24, 24, 11, 0, Math.PI * 2);
    g.fill();
    // The card: face side has a chick portrait, the right side has the magnetic stripe.
    const r = cardRect();
    g.fillStyle = '#fbf7ef';
    g.fillRect(r.x, r.y, r.w, r.h);
    if (state.flipped) {
      g.fillStyle = '#ffc93d';
      g.beginPath();
      g.arc(r.x + r.w / 2, r.y + r.h / 2 - 8, 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2f3340';
      g.fillRect(r.x + r.w / 2 - 22, r.y + r.h / 2 + 16, 44, 5);
    } else {
      g.fillStyle = '#2f3340';
      if (horizontal) g.fillRect(r.x, r.y + r.h - 26, r.w, 14);
      else g.fillRect(r.x + r.w - 26, r.y, 14, r.h);
    }
    shell.status.textContent = state.last
      ? t(`minigame.badge.${state.last}`)
      : state.flipped
        ? t('minigame.badge.readyFlipped')
        : t('minigame.badge.ready');
    if (!won && state.done) {
      won = true;
      ctx.win();
    }
  }

  draw();
  return {
    tick(dt) {
      if (state.elapsed === null) return;
      tickBadge(state, dt);
    },
    draw,
    destroy() {
      window.removeEventListener('keydown', onKey);
      shell.destroy();
    },
  };
}
