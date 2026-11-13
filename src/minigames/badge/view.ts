import { BADGE_MAX_TIME, BADGE_MIN_TIME } from '../../config';
import { t } from '../../i18n';
import { createCanvasShell } from '../canvas';
import type { MinigameContext, MinigameView } from '../types';
import { createBadge, drag, grab, release, tickBadge } from './logic';

const W = 420;
const H = 220;
const TRACK_X0 = 40;
const TRACK_X1 = 380;
const CARD_W = 80;

/** «Сканер бейджа»: drag the badge through the reader, not too fast and not too slow. */
export function createBadgeView(ctx: MinigameContext): MinigameView {
  const state = createBadge();
  const shell = createCanvasShell(ctx.body, 'badge', W, H);
  const { g } = shell;
  let grabDx = 0;
  let won = false;
  const cardX = (): number => TRACK_X0 + state.pos * (TRACK_X1 - TRACK_X0 - CARD_W);

  shell.canvas.addEventListener('pointerdown', (event) => {
    const p = shell.local(event);
    if (p.x < cardX() || p.x > cardX() + CARD_W || p.y < 60 || p.y > 170) return;
    grab(state);
    grabDx = p.x - cardX();
    shell.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  shell.canvas.addEventListener('pointermove', (event) => {
    const p = shell.local(event);
    drag(state, (p.x - grabDx - TRACK_X0) / (TRACK_X1 - TRACK_X0 - CARD_W));
  });
  shell.canvas.addEventListener('pointerup', () => {
    const result = release(state);
    if (result && result !== 'ok') ctx.sound('bonk');
    draw();
  });

  function draw(): void {
    shell.goal.textContent = t('minigame.badge.goal', { min: String(BADGE_MIN_TIME).replace('.', ','), max: String(BADGE_MAX_TIME).replace('.', ',') });
    g.fillStyle = '#c3cad3';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#2f3340';
    g.fillRect(TRACK_X0 - 10, 150, TRACK_X1 - TRACK_X0 + 20, 30);
    const light = state.last === null || state.elapsed !== null ? '#ffc93d' : state.last === 'ok' ? '#7be05a' : '#ff4b3e';
    g.fillStyle = light;
    g.beginPath();
    g.arc(W - 30, 30, 12, 0, Math.PI * 2);
    g.fill();
    const x = cardX();
    g.fillStyle = '#fbf7ef';
    g.fillRect(x, 70, CARD_W, 100);
    g.fillStyle = '#ffc93d';
    g.beginPath();
    g.arc(x + CARD_W / 2, 105, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2f3340';
    g.fillRect(x + 12, 135, CARD_W - 24, 6);
    g.fillRect(x + 12, 148, CARD_W - 36, 6);
    shell.status.textContent = state.last ? t(`minigame.badge.${state.last}`) : t('minigame.badge.ready');
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
      draw();
    },
    draw,
    destroy: shell.destroy,
  };
}
