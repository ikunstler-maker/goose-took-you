import { GPU_HOLD_TIME, GPU_ZONE_HIGH, GPU_ZONE_LOW } from '../../config';
import { t } from '../../i18n';
import { createCanvasShell } from '../canvas';
import type { MinigameContext, MinigameView } from '../types';
import { createGpu, inZone, tickGpu } from './logic';

const W = 360;
const H = 300;

/** «Охолоди GPU»: hold the fan (button, Space or touch) to keep the thermometer green. */
export function createGpuView(ctx: MinigameContext): MinigameView {
  const state = createGpu(ctx.seed);
  const shell = createCanvasShell(ctx.body, 'gpu', W, H);
  const { g } = shell;
  const fan = document.createElement('button');
  fan.type = 'button';
  fan.className = 'mg-big-button';
  shell.root.append(fan);
  let fanOn = false;
  let spin = 0;
  let won = false;

  const on = (event: Event): void => {
    fanOn = true;
    event.preventDefault();
  };
  const off = (): void => {
    fanOn = false;
  };
  fan.addEventListener('pointerdown', on);
  window.addEventListener('pointerup', off);
  const onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'Space') return;
    event.preventDefault();
    fanOn = event.type === 'keydown';
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  function draw(): void {
    shell.goal.textContent = t('minigame.gpu.goal', { seconds: GPU_HOLD_TIME });
    fan.textContent = t('minigame.gpu.fan');
    fan.classList.toggle('on', fanOn);
    g.fillStyle = '#23262f';
    g.fillRect(0, 0, W, H);
    // Thermometer: bottom is cold.
    const tx = 50;
    const top = 30;
    const bottom = H - 30;
    const y = (v: number): number => bottom - v * (bottom - top);
    g.fillStyle = '#3a3f4c';
    g.fillRect(tx, top, 36, bottom - top);
    g.fillStyle = 'rgba(123, 224, 90, 0.45)';
    g.fillRect(tx - 8, y(GPU_ZONE_HIGH), 52, y(GPU_ZONE_LOW) - y(GPU_ZONE_HIGH));
    g.fillStyle = inZone(state.temp) ? '#7be05a' : state.temp > GPU_ZONE_HIGH ? '#ff4b3e' : '#3fc3ff';
    g.fillRect(tx + 6, y(state.temp), 24, bottom - y(state.temp));
    // Fan.
    const cx = 230;
    const cy = 130;
    g.save();
    g.translate(cx, cy);
    g.rotate(spin);
    g.fillStyle = '#b9c0cc';
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.ellipse(0, -38, 16, 36, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.strokeStyle = '#8a90a0';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, 82, 0, Math.PI * 2);
    g.stroke();
    // Hold progress.
    g.fillStyle = '#3a3f4c';
    g.fillRect(150, 240, 160, 16);
    g.fillStyle = '#7be05a';
    g.fillRect(150, 240, (160 * Math.min(state.held, GPU_HOLD_TIME)) / GPU_HOLD_TIME, 16);
    shell.status.textContent = t('minigame.gpu.temp', { degrees: Math.round(40 + state.temp * 60) });
  }

  draw();
  return {
    tick(dt) {
      tickGpu(state, dt, fanOn);
      spin += dt * (fanOn ? 18 : 2);
      draw();
      if (!won && state.done) {
        won = true;
        ctx.win();
      }
    },
    draw,
    destroy() {
      window.removeEventListener('pointerup', off);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      shell.destroy();
    },
  };
}
