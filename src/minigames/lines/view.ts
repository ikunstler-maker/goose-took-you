import { LINES_CLIENT_PAUSE, LINES_COUNT } from '../../config';
import { t, type I18nKey } from '../../i18n';
import type { MinigameContext, MinigameView } from '../types';
import {
  addLine,
  clear,
  createLines,
  isComplete,
  isMet,
  lineAt,
  progress,
  snapEnd,
  tagLine,
  toggleForced,
  toggleKitten,
  undo,
  type Ink,
  type Line,
  type Requirement,
  type TagColor,
} from './logic';

const W = 460;
const H = 300;
const SCALE = 2;
const INK_COLORS: Record<Ink, string> = { red: '#e8364a', green: '#2fae45', blue: '#3f7bff', clear: '#8a8fa0' };
const INKS: Ink[] = ['red', 'green', 'blue', 'clear'];
const TAGS: TagColor[] = ['red', 'green', 'blue'];

type Tool = 'pen' | 'tag' | 'force' | 'kitten';

function requirementLabel(req: Requirement): string {
  switch (req.kind) {
    case 'lines':
      return t('minigame.lines.req.lines');
    case 'perp':
      return t('minigame.lines.req.perp');
    case 'kitten':
      return t('minigame.lines.req.kitten');
    case 'match': {
      const color = req.declared ? t(`minigame.lines.color.${req.declared}` as I18nKey) : '';
      const ink = req.ink ? t(`minigame.lines.ink.${req.ink}` as I18nKey) : '';
      if (req.ink && req.declared) return t('minigame.lines.req.inkDeclared', { color, ink });
      return req.ink ? t('minigame.lines.req.ink', { ink }) : t('minigame.lines.req.declared', { color });
    }
  }
}

/** Draws a line, or a kitten outline that still runs from end to end. */
function strokeLine(ctx: CanvasRenderingContext2D, line: Line, time: number): void {
  ctx.save();
  ctx.strokeStyle = INK_COLORS[line.ink];
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (line.ink === 'clear') {
    // Invisible ink: a faint shimmering ghost.
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 4 + line.id);
    ctx.setLineDash([8, 7]);
  }
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const length = Math.hypot(dx, dy);
  ctx.translate((line.x1 + line.x2) / 2, (line.y1 + line.y2) / 2);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.beginPath();
  if (!line.kitten) {
    ctx.moveTo(-length / 2, 0);
    ctx.lineTo(length / 2, 0);
    ctx.stroke();
  } else {
    const r = Math.min(length * 0.22, 34);
    ctx.moveTo(-length / 2, 0);
    ctx.lineTo(-r, 0);
    // Head with two ears, drawn as one continuous contour back to the line.
    ctx.arc(0, 0, r, Math.PI, Math.PI * 1.2);
    ctx.lineTo(-r * 0.75, -r * 1.35);
    ctx.lineTo(-r * 0.2, -r * 0.98);
    ctx.arc(0, 0, r, Math.PI * 1.43, Math.PI * 1.57);
    ctx.lineTo(r * 0.75, -r * 1.35);
    ctx.lineTo(r * 0.81, -r * 0.59);
    ctx.arc(0, 0, r, Math.PI * 1.8, Math.PI * 3);
    ctx.moveTo(r, 0);
    ctx.lineTo(length / 2, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = INK_COLORS[line.ink];
    for (const ex of [-r * 0.38, r * 0.38]) {
      ctx.beginPath();
      ctx.arc(ex, -r * 0.2, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * r * 0.3, r * 0.2);
      ctx.lineTo(side * r * 1.05, r * 0.1);
      ctx.moveTo(side * r * 0.3, r * 0.3);
      ctx.lineTo(side * r * 1.05, r * 0.42);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, color: string, tilt = 0): void {
  ctx.save();
  ctx.font = '800 11px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  // Keep the whole (rotated) badge on the canvas.
  const ex = (Math.abs(Math.cos(tilt)) * w + Math.abs(Math.sin(tilt)) * 18) / 2 + 2;
  const ey = (Math.abs(Math.sin(tilt)) * w + Math.abs(Math.cos(tilt)) * 18) / 2 + 2;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.translate(Math.max(ex, Math.min(W - ex, x)), Math.max(ey, Math.min(H - ey, y)));
  ctx.rotate(tilt);
  ctx.fillStyle = fill;
  ctx.fillRect(-w / 2, -9, w, 18);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** The pleased client: a chick in sunglasses and a suit. Drawn, not loaded. */
function paintClient(canvas: HTMLCanvasElement): void {
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5b6070';
  ctx.beginPath();
  ctx.ellipse(60, 118, 46, 30, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(48, 90);
  ctx.lineTo(72, 90);
  ctx.lineTo(60, 112);
  ctx.fill();
  ctx.fillStyle = '#e5433d';
  ctx.beginPath();
  ctx.moveTo(56, 92);
  ctx.lineTo(64, 92);
  ctx.lineTo(66, 116);
  ctx.lineTo(54, 116);
  ctx.fill();
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  ctx.arc(60, 55, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1f26';
  ctx.fillRect(34, 44, 22, 12);
  ctx.fillRect(64, 44, 22, 12);
  ctx.fillRect(54, 46, 12, 3);
  ctx.fillStyle = '#ff9a3d';
  ctx.beginPath();
  ctx.moveTo(52, 64);
  ctx.lineTo(68, 64);
  ctx.lineTo(60, 74);
  ctx.fill();
}

/** «Сім червоних перпендикулярних ліній»: draw 7 lines, then make the impossible brief true with stamps. */
export function createLinesView(ctx: MinigameContext): MinigameView {
  const state = createLines(ctx.seed);
  const root = document.createElement('div');
  root.className = 'lines';
  root.innerHTML = `
    <div class="lines-brief"><b></b><span></span></div>
    <div class="lines-main">
      <canvas class="lines-canvas"></canvas>
      <aside class="lines-check"><ul></ul><button type="button" class="lines-submit"></button></aside>
    </div>
    <div class="lines-tools"></div>
    <div class="lines-client" hidden><canvas></canvas><p></p></div>`;
  ctx.body.append(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
  const briefTitle = q('.lines-brief b');
  const briefText = q('.lines-brief span');
  const canvas = q<HTMLCanvasElement>('.lines-canvas');
  const checklist = q('.lines-check ul');
  const submit = q<HTMLButtonElement>('.lines-submit');
  const tools = q('.lines-tools');
  const client = q('.lines-client');
  const quote = q('.lines-client p');
  paintClient(q<HTMLCanvasElement>('.lines-client canvas'));
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d')!;

  let tool: Tool = 'pen';
  let ink: Ink = 'red';
  let tagColor: TagColor = 'red';
  let stroke: { x1: number; y1: number; x2: number; y2: number } | null = null;
  let time = 0;
  let clientLeft = -1;
  let reported = false;

  // --- Toolbar ---
  const makeButton = (cls: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.addEventListener('click', () => {
      onClick();
      draw();
    });
    tools.append(b);
    return b;
  };
  const penButton = makeButton('lt pen', () => (tool = 'pen'));
  const inkButtons = INKS.map((value) =>
    makeButton(`lt ink ink-${value}`, () => {
      tool = 'pen';
      ink = value;
    }),
  );
  const tagButtons = TAGS.map((value) =>
    makeButton(`lt stamp tag-${value}`, () => {
      tool = 'tag';
      tagColor = value;
    }),
  );
  const forceButton = makeButton('lt stamp force', () => (tool = 'force'));
  const kittenButton = makeButton('lt stamp kitten', () => (tool = 'kitten'));
  const undoButton = makeButton('lt undo', () => undo(state));
  const clearButton = makeButton('lt clear', () => clear(state));
  submit.addEventListener('click', () => {
    if (!isComplete(state) || clientLeft >= 0) return;
    clientLeft = LINES_CLIENT_PAUSE;
    draw();
  });

  // --- Canvas input ---
  const local = (event: PointerEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: ((event.clientX - r.left) * W) / r.width, y: ((event.clientY - r.top) * H) / r.height };
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (clientLeft >= 0) return;
    const p = local(event);
    event.preventDefault();
    if (tool === 'pen') {
      if (state.lines.length < LINES_COUNT) stroke = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      return;
    }
    const line = lineAt(state, p.x, p.y);
    if (!line) return;
    if (tool === 'tag') tagLine(line, tagColor);
    else if (tool === 'force') toggleForced(line);
    else toggleKitten(line);
    draw();
  });
  const onMove = (event: PointerEvent): void => {
    if (!stroke) return;
    const p = local(event);
    stroke.x2 = Math.max(0, Math.min(W, p.x));
    stroke.y2 = Math.max(0, Math.min(H, p.y));
    draw();
  };
  const onUp = (): void => {
    if (!stroke) return;
    const s = snapEnd(state, stroke.x1, stroke.y1, stroke.x2, stroke.y2);
    addLine(state, stroke.x1, stroke.y1, s.x2, s.y2, ink);
    stroke = null;
    draw();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function drawCanvas(): void {
    g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    g.fillStyle = '#fbf7ef';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ece3cf';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 20; x < W; x += 20) {
      g.moveTo(x, 0);
      g.lineTo(x, H);
    }
    for (let y = 20; y < H; y += 20) {
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
    for (const line of state.lines) strokeLine(g, line, time);
    for (const line of state.lines) {
      // Badges run along their line so stamps on neighbouring lines do not pile up.
      let along = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
      if (along > Math.PI / 2) along -= Math.PI;
      if (along <= -Math.PI / 2) along += Math.PI;
      // Tag sits on the line, the 90° stamp right beside it.
      const at = (side: number): [number, number] => [
        (line.x1 + line.x2) / 2 - Math.sin(along) * side,
        (line.y1 + line.y2) / 2 + Math.cos(along) * side,
      ];
      if (line.tag !== null) {
        const text = t('minigame.lines.badge.tag', {
          color: t(`minigame.lines.color.${line.tag}` as I18nKey).toUpperCase(),
          fact: t(`minigame.lines.fact.${line.ink}` as I18nKey),
        });
        badge(g, text, ...at(0), INK_COLORS[line.tag], '#fff', along);
      }
      if (line.forced) badge(g, t('minigame.lines.badge.force'), ...at(line.tag === null ? 0 : 19), '#fff', '#c0263a', along);
    }
    if (stroke) {
      const s = snapEnd(state, stroke.x1, stroke.y1, stroke.x2, stroke.y2);
      strokeLine(g, { id: 0, x1: stroke.x1, y1: stroke.y1, x2: s.x2, y2: s.y2, ink, tag: null, forced: false, kitten: false }, time);
      if (s.angle !== null) {
        badge(g, `${Math.round(s.angle)}°`, s.x2 + 18, s.y2 - 12, s.snapped ? '#2fae45' : '#ff9a3d', '#fff');
      }
    }
  }

  function draw(): void {
    const { brief } = state;
    briefTitle.textContent = `${t('minigame.lines.briefTitle')}: `;
    const parts = [t(`minigame.lines.brief.${brief.variant}` as I18nKey, brief.params)];
    const perp = brief.requirements.find((r) => r.kind === 'perp');
    if (perp?.kind === 'perp') {
      parts.push(perp.all ? t('minigame.lines.brief.perpAll') : t('minigame.lines.brief.perpSome', { n: perp.need }));
    }
    if (brief.params.kitten) parts.push(t('minigame.lines.brief.kitten', { n: brief.params.kitten }));
    briefText.textContent = parts.join(' ');

    checklist.replaceChildren(
      ...brief.requirements.map((req) => {
        const li = document.createElement('li');
        li.classList.toggle('met', isMet(state, req));
        li.textContent = `${requirementLabel(req)}: ${progress(state, req)}/${req.need}`;
        return li;
      }),
    );
    submit.textContent = t('minigame.lines.submit');
    submit.disabled = !isComplete(state) || clientLeft >= 0;

    penButton.textContent = t('minigame.lines.tool.pen');
    penButton.title = t('minigame.lines.tip.pen');
    penButton.classList.toggle('active', tool === 'pen');
    inkButtons.forEach((b, i) => {
      b.title = t(`minigame.lines.ink.${INKS[i]!}` as I18nKey);
      b.setAttribute('aria-label', b.title);
      b.classList.toggle('active', ink === INKS[i]);
    });
    tagButtons.forEach((b, i) => {
      const color = t(`minigame.lines.color.${TAGS[i]!}` as I18nKey);
      b.textContent = t('minigame.lines.tool.tag', { color: color.toUpperCase() });
      b.title = t('minigame.lines.tip.tag', { color });
      b.classList.toggle('active', tool === 'tag' && tagColor === TAGS[i]);
    });
    forceButton.textContent = t('minigame.lines.tool.force');
    forceButton.title = t('minigame.lines.tip.force');
    forceButton.classList.toggle('active', tool === 'force');
    kittenButton.textContent = t('minigame.lines.tool.kitten');
    kittenButton.title = t('minigame.lines.tip.kitten');
    kittenButton.classList.toggle('active', tool === 'kitten');
    undoButton.textContent = t('minigame.lines.tool.undo');
    clearButton.textContent = t('minigame.lines.tool.clear');
    canvas.style.cursor = tool === 'pen' ? 'crosshair' : 'copy';

    quote.textContent = t('minigame.lines.client');
    client.hidden = clientLeft < 0;
    drawCanvas();
  }

  draw();
  return {
    tick(dt) {
      time += dt;
      if (clientLeft >= 0 && !reported) {
        clientLeft -= dt;
        if (clientLeft <= 0) {
          reported = true;
          ctx.win();
        }
      }
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
