import { COPYCAT_SWITCHES, COPYCAT_WIRES } from '../../config';
import { t } from '../../i18n';
import type { MinigameContext, MinigameView } from '../types';
import { connect, createCopycat, disconnect, isMatched, matchRatio, toggleSwitch } from './logic';

const SVG = 'http://www.w3.org/2000/svg';
const W = 260;
const H = 250;
const LEFT_X = 34;
const RIGHT_X = W - 34;
const NODE_R = 13;
const SNAP = 24;
const COLORS = ['#ff5d8f', '#3fc3ff', '#ffc93d', '#7be05a', '#b07cff', '#ff8a3d'];
const SYMBOLS = ['●', '▲', '■', '◆', '★', '✚'];

const nodeY = (i: number): number => 30 + (i * (H - 60)) / Math.max(1, COPYCAT_WIRES - 1);

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function wirePath(left: number, x2: number, y2: number): string {
  const x1 = LEFT_X;
  const y1 = nodeY(left);
  const mid = (x1 + x2) / 2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

/** «Креатив один в один»: copy the competitor's wiring and switches onto an empty board. */
export function createCopycatView(ctx: MinigameContext): MinigameView {
  const state = createCopycat(ctx.seed);
  const root = document.createElement('div');
  root.className = 'copycat';
  const goal = document.createElement('p');
  goal.className = 'mg-goal';
  const boards = document.createElement('div');
  boards.className = 'copycat-boards';
  const match = document.createElement('div');
  match.className = 'copycat-match';
  root.append(goal, boards, match);
  ctx.body.append(root);

  const makeBoard = (interactive: boolean) => {
    const wrap = document.createElement('section');
    wrap.className = interactive ? 'copycat-board yours' : 'copycat-board reference';
    const label = document.createElement('h3');
    const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const wires = svgEl('g', {});
    const nodes = svgEl('g', {});
    svg.append(wires, nodes);
    for (let i = 0; i < COPYCAT_WIRES; i++) {
      const left = svgEl('circle', { cx: LEFT_X, cy: nodeY(i), r: NODE_R, fill: COLORS[i]!, class: 'node left' });
      left.dataset.left = String(i);
      const right = svgEl('circle', { cx: RIGHT_X, cy: nodeY(i), r: NODE_R, class: 'node right' });
      const symbol = svgEl('text', { x: RIGHT_X, y: nodeY(i) + 5, 'text-anchor': 'middle', class: 'symbol' });
      symbol.textContent = SYMBOLS[i]!;
      nodes.append(left, right, symbol);
    }
    const switches = document.createElement('div');
    switches.className = 'copycat-switches';
    const toggles: HTMLButtonElement[] = [];
    for (let i = 0; i < COPYCAT_SWITCHES; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'switch';
      button.disabled = !interactive;
      button.addEventListener('click', () => {
        toggleSwitch(state, i);
        draw();
      });
      toggles.push(button);
      switches.append(button);
    }
    wrap.append(label, svg, switches);
    boards.append(wrap);
    return { label, svg, wires, toggles };
  };

  const reference = makeBoard(false);
  const yours = makeBoard(true);
  const ghost = svgEl('path', { class: 'wire ghost', d: '' });
  let dragFrom: number | null = null;

  const local = (event: PointerEvent): { x: number; y: number } => {
    const r = yours.svg.getBoundingClientRect();
    return { x: ((event.clientX - r.left) * W) / r.width, y: ((event.clientY - r.top) * H) / r.height };
  };

  yours.svg.addEventListener('pointerdown', (event) => {
    const target = event.target as SVGElement;
    if (target.dataset.left === undefined) return;
    dragFrom = Number(target.dataset.left);
    disconnect(state, dragFrom);
    draw();
    event.preventDefault();
  });
  const onMove = (event: PointerEvent): void => {
    if (dragFrom === null) return;
    const p = local(event);
    ghost.setAttribute('d', wirePath(dragFrom, p.x, p.y));
    ghost.setAttribute('stroke', COLORS[dragFrom]!);
  };
  const onUp = (event: PointerEvent): void => {
    if (dragFrom === null) return;
    const p = local(event);
    for (let i = 0; i < COPYCAT_WIRES; i++) {
      if (Math.hypot(p.x - RIGHT_X, p.y - nodeY(i)) <= SNAP) connect(state, dragFrom, i);
    }
    dragFrom = null;
    ghost.setAttribute('d', '');
    draw();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  const drawWires = (group: SVGGElement, wires: (number | null)[]): void => {
    group.replaceChildren();
    wires.forEach((right, left) => {
      if (right === null) return;
      group.append(svgEl('path', { class: 'wire', d: wirePath(left, RIGHT_X, nodeY(right)), stroke: COLORS[left]! }));
    });
  };

  let won = false;
  function draw(): void {
    goal.textContent = t('minigame.copycat.goal');
    reference.label.textContent = t('minigame.copycat.reference');
    yours.label.textContent = t('minigame.copycat.yours');
    drawWires(reference.wires, state.targetWires);
    drawWires(yours.wires, state.wires);
    yours.wires.append(ghost);
    reference.toggles.forEach((b, i) => b.classList.toggle('on', state.targetSwitches[i]!));
    yours.toggles.forEach((b, i) => b.classList.toggle('on', state.switches[i]!));
    match.textContent = t('minigame.copycat.match', { percent: Math.round(matchRatio(state) * 100) });
    if (!won && isMatched(state)) {
      won = true;
      ctx.win();
    }
  }

  draw();
  return {
    tick() {},
    draw,
    destroy() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      root.remove();
    },
  };
}
