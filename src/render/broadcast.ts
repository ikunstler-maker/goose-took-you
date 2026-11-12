import * as THREE from 'three';
import { t } from '../i18n';
import type { Level } from '../sim/level';
import { withFog } from './kit';

/** Lobby screen size and centre height; must match the `tv` prop in props.ts. */
const TV_W = 5.2;
const TV_H = 2.4;
const TV_Y = 2.1;
const PX_W = 512;
const PX_H = 236;
/** Redraw rate of the broadcast canvas, per second. */
const FPS = 12;

export interface BroadcastView {
  root: THREE.Group;
  update(secondsLeft: number, time: number): void;
  dispose(): void;
}

/** «Екстрені Новини» drawn over the Lobby screen while the sim says a broadcast is on. */
export function createBroadcast(level: Level): BroadcastView {
  const root = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = PX_H;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = withFog(
    new THREE.MeshLambertMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.8 }),
  );
  const geometry = new THREE.PlaneGeometry(TV_W, TV_H);
  const tv = level.props.find((p) => p.kind === 'tv' && p.hub);
  if (tv) {
    const panel = new THREE.Mesh(geometry, material);
    const holder = new THREE.Group();
    holder.position.set(tv.x, 0, tv.z);
    holder.rotation.y = (tv.rot * Math.PI) / 2;
    panel.position.set(0, TV_Y, 0.09);
    holder.add(panel);
    root.add(holder);
  }
  root.visible = false;
  let lastDraw = -1;

  const draw = (time: number): void => {
    ctx.fillStyle = '#b3122e';
    ctx.fillRect(0, 0, PX_W, PX_H);
    // Studio backdrop: abstract pixel mosaic, no recognisable imagery.
    for (let i = 0; i < 48; i++) {
      const x = (i % 12) * 32 + 64;
      const y = Math.floor(i / 12) * 24 + 52;
      const on = Math.sin(time * 3 + i * 1.7) > 0.2;
      ctx.fillStyle = on ? '#ffc93d' : '#3fc3ff';
      ctx.fillRect(x, y, 28, 20);
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 34px system-ui, sans-serif';
    ctx.fillText(t('broadcast.title'), PX_W / 2, 28, PX_W - 20);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, PX_H - 40, PX_W, 40);
    ctx.fillStyle = '#ffc93d';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const ticker = t('broadcast.ticker');
    const width = ctx.measureText(ticker).width;
    const offset = -((time * 90) % width);
    ctx.fillText(ticker, offset, PX_H - 20);
    ctx.fillText(ticker, offset + width, PX_H - 20);
    // Blinking LIVE dot.
    if (Math.sin(time * 6) > 0) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(24, 28, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    texture.needsUpdate = true;
  };

  return {
    root,
    update(secondsLeft, time) {
      root.visible = secondsLeft > 0;
      if (!root.visible || time - lastDraw < 1 / FPS) return;
      lastDraw = time;
      draw(time);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
