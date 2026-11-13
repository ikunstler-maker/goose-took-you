import { MINIMAP_SIZE, MINIMAP_SIZE_BIG } from '../config';
import { t } from '../i18n';
import { CORRIDOR } from '../sim/level';
import { LOCAL_PLAYER, me, type WorldState } from '../sim/world';

/**
 * Corner minimap: only rooms the player has walked into, the corridors
 * touching them, own unfinished tasks and the player's dot. Reads sim state only.
 */
export interface Minimap {
  update(world: WorldState): void;
  /** New office or language: forget the cached floor. */
  reset(): void;
}

const TASK = '#ffb400';
const SELF = '#e5433d';

export function createMinimap(): Minimap {
  const wrap = document.createElement('div');
  wrap.id = 'minimap';
  wrap.hidden = true;
  const canvas = document.createElement('canvas');
  wrap.append(canvas);
  document.body.append(wrap);
  const g = canvas.getContext('2d')!;
  // Floor of known rooms, redrawn only when a room is added.
  const floor = document.createElement('canvas');
  const fg = floor.getContext('2d')!;
  let known = -1;
  let level: WorldState['level'] | null = null;
  let big = false;

  const resize = (): void => {
    const css = big ? MINIMAP_SIZE_BIG : MINIMAP_SIZE;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    wrap.style.setProperty('--size', `${css}px`);
    canvas.width = css * ratio;
    canvas.height = css * ratio;
  };
  wrap.addEventListener('click', () => {
    big = !big;
    wrap.classList.toggle('big', big);
    resize();
  });
  resize();

  const drawFloor = (world: WorldState): void => {
    const lv = world.level;
    const n = lv.size;
    floor.width = n;
    floor.height = n;
    fg.clearRect(0, 0, n, n);
    const visited = new Set(me(world).visited);
    const image = fg.createImageData(n, n);
    const paint = (i: number, r: number, gr: number, b: number, a: number): void => {
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = gr;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = a;
    };
    for (let i = 0; i < n * n; i++) {
      const zone = lv.zone[i]!;
      if (zone >= 0 && visited.has(zone)) paint(i, 243, 227, 195, 255);
    }
    // Corridor cells next to a known room hint at the exits.
    for (let z = 1; z < n - 1; z++) {
      for (let x = 1; x < n - 1; x++) {
        const i = z * n + x;
        if (lv.zone[i] !== CORRIDOR) continue;
        let near = false;
        for (let d = -3; d <= 3 && !near; d++) {
          for (const j of [i + d, i + d * n]) {
            const zone = lv.zone[j];
            if (zone !== undefined && zone >= 0 && visited.has(zone)) near = true;
          }
        }
        if (near) paint(i, 243, 227, 195, 115);
      }
    }
    fg.putImageData(image, 0, 0);
  };

  return {
    reset() {
      known = -1;
      level = null;
    },
    update(world) {
      const playing = world.phase === 'play';
      wrap.hidden = !playing;
      if (!playing) return;
      const self = me(world);
      if (level !== world.level || known !== self.visited.length) {
        level = world.level;
        known = self.visited.length;
        drawFloor(world);
        wrap.title = t('minimap.title');
      }
      const w = canvas.width;
      const scale = w / world.level.size;
      g.clearRect(0, 0, w, w);
      g.imageSmoothingEnabled = false;
      g.drawImage(floor, 0, 0, w, w);
      for (const task of world.tasks) {
        if (task.owner !== LOCAL_PLAYER || task.done) continue;
        const prop = world.level.props[world.stations[task.station]!.prop]!;
        g.fillStyle = TASK;
        g.beginPath();
        g.arc(prop.x * scale, prop.z * scale, Math.max(3, scale * 1.2), 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = SELF;
      g.strokeStyle = '#ffffff';
      g.lineWidth = Math.max(1.5, scale * 0.5);
      g.beginPath();
      g.arc(self.x * scale, self.z * scale, Math.max(4, scale * 1.6), 0, Math.PI * 2);
      g.fill();
      g.stroke();
    },
  };
}

