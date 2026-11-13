import { MINIGAME_SLOT_MISS_PAUSE, SLOT_SYMBOLS } from '../../config';
import { t } from '../../i18n';
import { createCanvasShell } from '../canvas';
import type { MinigameContext, MinigameView } from '../types';
import { createSlot, hitDecoy, isJackpot, respin, stopReel, tickSlot, type SlotSymbol } from './logic';

const W = 420;
const H = 240;
const REEL_W = 100;
const CELL = 70;

type G = CanvasRenderingContext2D;

/** Flat icons, about 44 px across, centred on (0, 0). No real brands, no money. */
const ICONS: Record<SlotSymbol, (g: G) => void> = {
  seven: (g) => {
    g.fillStyle = '#e5433d';
    g.font = '900 50px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('7', 0, 2);
  },
  // Fire axe: red head on a wooden handle, leaning like a 7.
  axe: (g) => {
    g.strokeStyle = '#b07a3c';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(8, -18);
    g.lineTo(-6, 22);
    g.stroke();
    g.fillStyle = '#e5433d';
    g.beginPath();
    g.moveTo(-16, -22);
    g.lineTo(14, -22);
    g.lineTo(10, -8);
    g.lineTo(-12, -6);
    g.closePath();
    g.fill();
  },
  egg: (g) => {
    g.fillStyle = '#fffdf5';
    g.strokeStyle = '#d8cdb4';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(0, 2, 16, 21, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  },
  // White button: round, with four holes.
  button: (g) => {
    g.fillStyle = '#fffdf5';
    g.strokeStyle = '#d8cdb4';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 19, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#8a7f66';
    for (const [x, y] of [[-5, -5], [5, -5], [-5, 5], [5, 5]] as const) {
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  },
  feather: (g) => {
    g.save();
    g.rotate(-0.6);
    g.fillStyle = '#ffd23d';
    g.beginPath();
    g.ellipse(0, -2, 9, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b98a1a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -22);
    g.lineTo(0, 26);
    g.stroke();
    g.restore();
  },
  banana: (g) => {
    g.strokeStyle = '#ffd23d';
    g.lineWidth = 11;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(-4, -10, 24, 0.35, 1.9);
    g.stroke();
    g.strokeStyle = '#7a5a1e';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(-4, -10, 24, 0.28, 0.36);
    g.stroke();
  },
  coin: (g) => {
    g.fillStyle = '#ffc93d';
    g.beginPath();
    g.arc(0, 0, 19, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c98f14';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 13, 0, Math.PI * 2);
    g.stroke();
  },
  // Bottle cap: gold disc with a crimped edge.
  cap: (g) => {
    g.fillStyle = '#e8b93a';
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const r = i % 2 === 0 ? 20 : 16;
      const a = (i * Math.PI) / 12;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.fillStyle = '#c98f14';
    g.beginPath();
    g.arc(0, 0, 9, 0, Math.PI * 2);
    g.fill();
  },
  cherry: (g) => {
    g.strokeStyle = '#3f9c4d';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-9, 8);
    g.quadraticCurveTo(0, -24, 10, 6);
    g.stroke();
    g.fillStyle = '#c2255c';
    for (const x of [-10, 11]) {
      g.beginPath();
      g.arc(x, 10, 10, 0, Math.PI * 2);
      g.fill();
    }
  },
  star: (g) => {
    g.fillStyle = '#b07cff';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 21 : 9;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  },
  bell: (g) => {
    g.fillStyle = '#3fc3ff';
    g.beginPath();
    g.moveTo(-18, 12);
    g.quadraticCurveTo(-14, -22, 0, -22);
    g.quadraticCurveTo(14, -22, 18, 12);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(0, 16, 5, 0, Math.PI * 2);
    g.fill();
  },
};

/** «Занос на 777»: stop the reels on the round's target one by one. A pure parody: nothing is staked or won. */
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
  let missed: 'decoy' | 'other' | null = null;

  const press = (): void => {
    if (missPause > 0 || won) return;
    ctx.sound('click');
    if (stopReel(state)) missed = null;
    else {
      missed = hitDecoy(state) ? 'decoy' : 'other';
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

  const icon = (symbol: SlotSymbol, x: number, y: number, scale = 1): void => {
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);
    ICONS[symbol](g);
    g.restore();
  };

  function draw(): void {
    const target = t(`minigame.slot.symbol.${state.theme.target}`);
    const decoy = t(`minigame.slot.symbol.${state.theme.decoy}`);
    shell.goal.textContent = t('minigame.slot.goal', { target, decoy });
    stop.textContent = t('minigame.slot.stop');
    g.fillStyle = '#3b1240';
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < 3; r++) {
      const x0 = 45 + r * (REEL_W + 15);
      g.fillStyle = r === state.current ? '#4a2a52' : '#33203a';
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
        icon(state.strips[r]![index]!, x0 + REEL_W / 2, H / 2 + (k + frac) * CELL);
      }
      g.restore();
    }
    g.strokeStyle = '#ffd34d';
    g.lineWidth = 3;
    g.strokeRect(35, H / 2 - CELL / 2, W - 70, CELL);
    // The wanted symbol, as a reminder in the corner.
    g.fillStyle = 'rgba(255, 246, 230, 0.92)';
    g.fillRect(4, 4, 34, 34);
    icon(state.theme.target, 21, 21, 0.6);
    shell.status.textContent = won
      ? t('minigame.slot.win')
      : missed === 'decoy'
        ? t('minigame.slot.missDecoy', { target, decoy })
        : missed
          ? t('minigame.slot.miss')
          : t('minigame.slot.reel', { n: state.current + 1 });
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
