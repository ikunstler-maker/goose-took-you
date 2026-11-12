import * as THREE from 'three';
import type { RoomType } from '../sim/prefabs';
import { canvasTexture, noise, withFog } from './kit';

type Painter = (ctx: CanvasRenderingContext2D, size: number) => void;

function planks(base: string, tones: string[], rows: number): Painter {
  return (ctx, size) => {
    const rand = noise(rows * 7);
    const h = size / rows;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      let x = -rand() * size * 0.4;
      while (x < size) {
        const w = size * (0.3 + rand() * 0.3);
        ctx.fillStyle = tones[Math.floor(rand() * tones.length)]!;
        ctx.fillRect(x + 1, r * h + 1, w - 2, h - 2);
        x += w;
      }
    }
  };
}

const PAINTERS: Record<RoomType | 'corridor', Painter> = {
  // Warm wooden deck.
  lobby: planks('#b98a55', ['#d9aa72', '#cf9f66', '#e2b680'], 8),
  // Cosy carpet.
  buying: (ctx, size) => {
    const rand = noise(11);
    ctx.fillStyle = '#8fa6d6';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(40,60,120,0.10)';
      ctx.fillRect(rand() * size, rand() * size, 2, 2);
    }
  },
  // Pastel mint studio grid.
  copycat: (ctx, size) => {
    ctx.fillStyle = '#bfeedd';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      const v = (i * size) / 4;
      ctx.beginPath();
      ctx.moveTo(v, 0);
      ctx.lineTo(v, size);
      ctx.moveTo(0, v);
      ctx.lineTo(size, v);
      ctx.stroke();
    }
  },
  // Terrazzo.
  news: (ctx, size) => {
    const rand = noise(23);
    const chips = ['#f2a7a0', '#8fc7b5', '#f3d27a', '#9aa7c9', '#ffffff'];
    ctx.fillStyle = '#efe8dc';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 150; i++) {
      ctx.fillStyle = chips[Math.floor(rand() * chips.length)]!;
      ctx.beginPath();
      ctx.ellipse(rand() * size, rand() * size, 2 + rand() * 5, 2 + rand() * 3, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // Painted concrete with hazard stripes.
  cargo: (ctx, size) => {
    ctx.fillStyle = '#c9c4ba';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#b5b0a6';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
    ctx.fillStyle = '#f1c24a';
    for (let i = -1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 40, size);
      ctx.lineTo(i * 40 + 20, size);
      ctx.lineTo(i * 40 + 34, size - 14);
      ctx.lineTo(i * 40 + 14, size - 14);
      ctx.fill();
    }
  },
  // Slate tech tiles.
  motion: (ctx, size) => {
    ctx.fillStyle = '#7f8fb0';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#8b9bbb';
    const half = size / 2;
    ctx.fillRect(3, 3, half - 6, half - 6);
    ctx.fillRect(half + 3, half + 3, half - 6, half - 6);
    ctx.fillStyle = '#7686a8';
    ctx.fillRect(half + 3, 3, half - 6, half - 6);
    ctx.fillRect(3, half + 3, half - 6, half - 6);
  },
  // Warm oak parquet.
  meeting: planks('#a9743f', ['#c98f55', '#be844b', '#d39a60', '#b77c44'], 12),
  // Cream and peach checker.
  lounge: (ctx, size) => {
    const half = size / 2;
    ctx.fillStyle = '#fff3df';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffd3b0';
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
  },
  // Stone pavers on moss.
  greenhouse: (ctx, size) => {
    const rand = noise(5);
    ctx.fillStyle = '#86b866';
    ctx.fillRect(0, 0, size, size);
    const n = 4;
    const cell = size / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        ctx.fillStyle = rand() > 0.5 ? '#dcd6c8' : '#cfc8b8';
        ctx.beginPath();
        ctx.roundRect(c * cell + 5, r * cell + 5, cell - 10, cell - 10, 8);
        ctx.fill();
      }
    }
  },
  // Light warm corridor tiles.
  corridor: (ctx, size) => {
    ctx.fillStyle = '#f4ead8';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#e4d6bd';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, size, size);
  },
};

/** Texture repeats per metre for each floor pattern. */
export const FLOOR_DENSITY: Record<RoomType | 'corridor', number> = {
  lobby: 0.34,
  buying: 0.5,
  copycat: 0.25,
  news: 0.34,
  cargo: 0.25,
  motion: 0.5,
  meeting: 0.34,
  lounge: 0.5,
  greenhouse: 0.25,
  corridor: 0.5,
};

const cache = new Map<string, THREE.MeshLambertMaterial>();

/**
 * Floor material, cached and reused across office rebuilds. Floor geometry
 * carries world-space UVs scaled by FLOOR_DENSITY, so the texture just repeats.
 */
export function floorMaterial(type: RoomType | 'corridor'): THREE.MeshLambertMaterial {
  let material = cache.get(type);
  if (!material) {
    const texture = canvasTexture(256, PAINTERS[type]);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    material = withFog(new THREE.MeshLambertMaterial({ map: texture }));
    cache.set(type, material);
  }
  return material;
}
