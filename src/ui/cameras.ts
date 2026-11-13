import { CAMERA_ALERT_TIME, CAMERA_RADIUS, CHICK_COLORS } from '../config';
import { t } from '../i18n';
import { cameraSees, cameraSpots, cameraView, type CameraSpot } from '../sim/cameras';
import { FLOOR } from '../sim/level';
import type { WorldState } from '../sim/world';

/**
 * Security camera screen: a 2×2 wall of top-down CCTV feeds. Every chick,
 * the Goose included, is the same dot in its disguise colour. Reads sim state only.
 */
export interface CameraScreen {
  open(world: WorldState): void;
  close(): void;
  isOpen(): boolean;
  update(world: WorldState, dt: number): void;
  /** A pack happened at (x, z): tiles whose camera saw it flash. */
  packed(world: WorldState, x: number, z: number): void;
  relabel(): void;
}

const TILE = 220;
const VIEW = CAMERA_RADIUS * 2;

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

export function createCameraScreen(onClose: () => void): CameraScreen {
  const overlay = document.createElement('div');
  overlay.id = 'cameras';
  overlay.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'mg-panel cameras-panel';
  const header = document.createElement('header');
  const title = document.createElement('h2');
  const hint = document.createElement('span');
  hint.className = 'mg-hint';
  const cross = document.createElement('button');
  cross.type = 'button';
  cross.className = 'mg-close';
  cross.textContent = '✕';
  header.append(title, hint, cross);
  const grid = document.createElement('div');
  grid.className = 'cameras-grid';
  panel.append(header, grid);
  overlay.append(panel);
  document.body.append(overlay);

  let spots: CameraSpot[] = [];
  let level: WorldState['level'] | null = null;
  const tiles: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; label: HTMLElement; alert: number }[] = [];
  let blink = 0;

  const relabel = (): void => {
    title.textContent = t('cameras.title');
    hint.textContent = t('cameras.close');
    cross.title = t('minigame.closeTouch');
    cross.setAttribute('aria-label', t('minigame.closeTouch'));
    if (level) spots.forEach((s, i) => (tiles[i]!.label.textContent = t(`room.${level!.rooms[s.room]!.type}`)));
  };

  const build = (world: WorldState): void => {
    level = world.level;
    spots = cameraSpots(world.level);
    grid.replaceChildren();
    tiles.length = 0;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    for (let i = 0; i < spots.length; i++) {
      const tile = document.createElement('figure');
      tile.className = 'cameras-tile';
      const canvas = document.createElement('canvas');
      canvas.width = TILE * ratio;
      canvas.height = TILE * ratio;
      const label = document.createElement('figcaption');
      tile.append(canvas, label);
      grid.append(tile);
      const g = canvas.getContext('2d')!;
      g.scale(ratio, ratio);
      tiles.push({ canvas, g, label, alert: 0 });
    }
    relabel();
  };

  const draw = (world: WorldState): void => {
    const lv = world.level;
    const scale = TILE / VIEW;
    spots.forEach((spot, i) => {
      const tile = tiles[i]!;
      const { g } = tile;
      // The feed is centred on the camera.
      const ox = spot.x - VIEW / 2;
      const oz = spot.z - VIEW / 2;
      g.fillStyle = '#10161a';
      g.fillRect(0, 0, TILE, TILE);
      for (let z = 0; z < VIEW; z++) {
        for (let x = 0; x < VIEW; x++) {
          const cx = Math.floor(ox) + x;
          const cz = Math.floor(oz) + z;
          if (cx < 0 || cz < 0 || cx >= lv.size || cz >= lv.size) continue;
          if (lv.cells[cz * lv.size + cx] !== FLOOR) continue;
          g.fillStyle = cameraSees(lv, spot, cx + 0.5, cz + 0.5) ? '#4f6b5e' : '#26332d';
          g.fillRect(x * scale, z * scale, scale + 0.5, scale + 0.5);
        }
      }
      const view = cameraView(lv, spot, world.participants, world.boxes);
      for (const id of view.boxes) {
        const box = world.boxes.find((b) => b.id === id)!;
        g.fillStyle = '#c99a62';
        g.fillRect((box.x - ox) * scale - 5, (box.z - oz) * scale - 5, 10, 10);
        if (box.kind === 'vacation') {
          g.fillStyle = '#e5433d';
          g.fillRect((box.x - ox) * scale - 2, (box.z - oz) * scale - 2, 4, 4);
        }
      }
      for (const id of view.participants) {
        const p = world.participants[id]!;
        g.fillStyle = hex(CHICK_COLORS[p.color] ?? 0xffffff);
        g.beginPath();
        g.arc((p.x - ox) * scale, (p.z - oz) * scale, 6, 0, Math.PI * 2);
        g.fill();
      }
      // Scanlines and the REC dot.
      g.fillStyle = 'rgba(0, 0, 0, 0.18)';
      for (let y = 0; y < TILE; y += 3) g.fillRect(0, y, TILE, 1);
      if (Math.floor(blink * 2) % 2 === 0) {
        g.fillStyle = '#ff3b30';
        g.beginPath();
        g.arc(14, 14, 5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#e8f0ea';
      g.font = '700 11px system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('REC', 24, 14);
      if (tile.alert > 0) {
        g.strokeStyle = '#ff3b30';
        g.lineWidth = 6;
        g.strokeRect(3, 3, TILE - 6, TILE - 6);
        g.fillStyle = '#ff3b30';
        g.font = '900 14px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(t('cameras.alert'), TILE / 2, TILE - 18);
      }
    });
  };

  const close = (): void => {
    overlay.hidden = true;
  };
  cross.addEventListener('click', onClose);
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape' || overlay.hidden) return;
    event.preventDefault();
    onClose();
  });

  return {
    open(world) {
      if (level !== world.level) build(world);
      relabel();
      overlay.hidden = false;
      draw(world);
    },
    close,
    isOpen: () => !overlay.hidden,
    update(world, dt) {
      blink += dt;
      for (const tile of tiles) tile.alert = Math.max(0, tile.alert - dt);
      if (!overlay.hidden) draw(world);
    },
    packed(world, x, z) {
      if (level !== world.level) build(world);
      spots.forEach((spot, i) => {
        if (cameraSees(world.level, spot, x, z)) tiles[i]!.alert = CAMERA_ALERT_TIME;
      });
    },
    relabel,
  };
}
