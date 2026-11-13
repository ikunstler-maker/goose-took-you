import { t } from '../../i18n';
import { createCanvasShell } from '../canvas';
import type { MinigameContext, MinigameView } from '../types';
import { createCurve, curveError, curvePoint, isCurveMatched, moveHandle, type Handle } from './logic';

const W = 420;
const H = 300;
const PAD = 40;
const GRAB = 26;

/** «Крива в Graph Editor»: drag the two bezier handles onto the client's reference curve. */
export function createCurveView(ctx: MinigameContext): MinigameView {
  const state = createCurve(ctx.seed);
  const shell = createCanvasShell(ctx.body, 'curve', W, H);
  const { g } = shell;
  const toPx = (h: Handle): { x: number; y: number } => ({ x: PAD + h.x * (W - 2 * PAD), y: H - PAD - h.y * (H - 2 * PAD) });
  const fromPx = (x: number, y: number): Handle => ({ x: (x - PAD) / (W - 2 * PAD), y: (H - PAD - y) / (H - 2 * PAD) });
  let dragging: number | null = null;
  let won = false;

  shell.canvas.addEventListener('pointerdown', (event) => {
    const p = shell.local(event);
    let best = GRAB;
    state.handles.forEach((h, i) => {
      const q = toPx(h);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best) {
        best = d;
        dragging = i;
      }
    });
    if (dragging !== null) {
      shell.canvas.setPointerCapture(event.pointerId);
      ctx.sound('click');
    }
    event.preventDefault();
  });
  shell.canvas.addEventListener('pointermove', (event) => {
    if (dragging === null || won) return;
    const p = shell.local(event);
    const h = fromPx(p.x, p.y);
    moveHandle(state, dragging, h.x, h.y);
    draw();
  });
  shell.canvas.addEventListener('pointerup', () => {
    dragging = null;
  });

  const curve = (a: Handle, b: Handle, color: string, width: number, dash: number[]): void => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.setLineDash(dash);
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const q = toPx(curvePoint(a, b, i / 40));
      if (i === 0) g.moveTo(q.x, q.y);
      else g.lineTo(q.x, q.y);
    }
    g.stroke();
    g.setLineDash([]);
  };

  function draw(): void {
    shell.goal.textContent = t('minigame.curve.goal');
    g.fillStyle = '#23262f';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#363a46';
    g.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = PAD + (i * (W - 2 * PAD)) / 10;
      const y = PAD + (i * (H - 2 * PAD)) / 10;
      g.beginPath();
      g.moveTo(x, PAD);
      g.lineTo(x, H - PAD);
      g.moveTo(PAD, y);
      g.lineTo(W - PAD, y);
      g.stroke();
    }
    curve(state.target[0], state.target[1], '#7be05a', 6, [10, 8]);
    const [a, b] = state.handles;
    const start = toPx({ x: 0, y: 0 });
    const end = toPx({ x: 1, y: 1 });
    g.strokeStyle = '#8a90a0';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(start.x, start.y);
    g.lineTo(toPx(a).x, toPx(a).y);
    g.moveTo(end.x, end.y);
    g.lineTo(toPx(b).x, toPx(b).y);
    g.stroke();
    curve(a, b, '#3fc3ff', 4, []);
    for (const h of state.handles) {
      const q = toPx(h);
      g.fillStyle = '#ffc93d';
      g.fillRect(q.x - 8, q.y - 8, 16, 16);
    }
    const percent = Math.max(0, Math.round((1 - curveError(state)) * 100));
    shell.status.textContent = t('minigame.curve.match', { percent });
    if (!won && isCurveMatched(state)) {
      won = true;
      ctx.win();
    }
  }

  draw();
  return { tick() {}, draw, destroy: shell.destroy };
}
