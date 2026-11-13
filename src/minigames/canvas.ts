/** Shared shell for canvas mini-games: goal line, a fixed logical canvas, a status line. */
export interface CanvasShell {
  root: HTMLElement;
  goal: HTMLElement;
  status: HTMLElement;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  /** Pointer position in logical canvas units. */
  local(event: PointerEvent): { x: number; y: number };
  destroy(): void;
}

export function createCanvasShell(body: HTMLElement, className: string, w: number, h: number): CanvasShell {
  const root = document.createElement('div');
  root.className = `mg-canvas ${className}`;
  const goal = document.createElement('p');
  goal.className = 'mg-goal';
  const canvas = document.createElement('canvas');
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  canvas.style.aspectRatio = `${w} / ${h}`;
  const status = document.createElement('p');
  status.className = 'mg-status';
  root.append(goal, canvas, status);
  body.append(root);
  const g = canvas.getContext('2d')!;
  g.scale(ratio, ratio);
  return {
    root,
    goal,
    status,
    canvas,
    g,
    local(event) {
      const r = canvas.getBoundingClientRect();
      return { x: ((event.clientX - r.left) * w) / r.width, y: ((event.clientY - r.top) * h) / r.height };
    },
    destroy: () => root.remove(),
  };
}
