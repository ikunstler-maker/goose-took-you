import { MINIGAME_SLOT_MISS_PAUSE, SLOT_SYMBOLS } from '../../config';
import { t } from '../../i18n';
import { createCanvasShell } from '../canvas';
import type { MinigameContext, MinigameView } from '../types';
import { createSlot, isJackpot, respin, SEVEN, stopReel, tickSlot } from './logic';

const W = 420;
const H = 240;
const REEL_W = 100;
const CELL = 70;
// Index 0 is the 7; the rest are abstract shapes and eggs. No real brands, no money.
const COLORS = ['#ff3b30', '#ffc93d', '#7be05a', '#3fc3ff', '#b07cff', '#ff8a3d', '#ff5d8f', '#f5f5f5'];

/** «Занос на 777»: stop the reels on 7 one by one. A pure parody: nothing is staked or won. */
export function createSlotView(ctx: MinigameContext): MinigameView {
  const state = createSlot(ctx.seed);
  const shell = createCanvasShell(ctx.body, 'slot', W, H);
  const { g } = shell;
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.className = 'mg-big-button';
  shell.root.append(stop);
  let missPause = 0;
  let won = false;
  let missed = false;

  const press = (): void => {
    if (missPause > 0 || won) return;
    ctx.sound('click');
    if (stopReel(state)) missed = false;
    else {
      missed = true;
      missPause = MINIGAME_SLOT_MISS_PAUSE;
      ctx.sound('bonk');
    }
    draw();
  };
  stop.addEventListener('click', press);
  const onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'Space') return;
    event.preventDefault();
    if (!event.repeat) press();
  };
  window.addEventListener('keydown', onKey);

  const symbol = (index: number, x: number, y: number): void => {
    g.fillStyle = COLORS[index % COLORS.length]!;
    if (index === SEVEN) {
      g.font = '900 52px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('7', x, y);
      return;
    }
    g.beginPath();
    if (index % 2 === 0) g.ellipse(x, y, 18, 24, 0, 0, Math.PI * 2);
    else g.arc(x, y, 20, 0, Math.PI * 2);
    g.fill();
  };

  function draw(): void {
    shell.goal.textContent = t('minigame.slot.goal');
    stop.textContent = t('minigame.slot.stop');
    g.fillStyle = '#3b1240';
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < 3; r++) {
      const x0 = 45 + r * (REEL_W + 15);
      g.fillStyle = r === state.current ? '#fff6e6' : '#d9cfc0';
      g.fillRect(x0, 15, REEL_W, H - 30);
      g.save();
      g.beginPath();
      g.rect(x0, 15, REEL_W, H - 30);
      g.clip();
      const pos = state.pos[r]!;
      const base = Math.floor(pos);
      const frac = pos - base;
      for (let k = -2; k <= 2; k++) {
        const index = (((base - k) % SLOT_SYMBOLS) + SLOT_SYMBOLS) % SLOT_SYMBOLS;
        symbol(index, x0 + REEL_W / 2, H / 2 + (k + frac) * CELL);
      }
      g.restore();
    }
    g.strokeStyle = '#ffd34d';
    g.lineWidth = 3;
    g.strokeRect(35, H / 2 - CELL / 2, W - 70, CELL);
    shell.status.textContent = won ? t('minigame.slot.win') : missed ? t('minigame.slot.miss') : t('minigame.slot.reel', { n: state.current + 1 });
  }

  draw();
  return {
    tick(dt) {
      if (missPause > 0) {
        missPause -= dt;
        if (missPause <= 0) respin(state);
      }
      tickSlot(state, dt);
      if (!won && isJackpot(state)) {
        won = true;
        ctx.win();
      }
      draw();
    },
    draw,
    destroy() {
      window.removeEventListener('keydown', onKey);
      shell.destroy();
    },
  };
}
