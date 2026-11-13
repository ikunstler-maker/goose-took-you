import * as THREE from 'three';
import { t } from '../i18n';
import type { Level } from '../sim/level';
import { drawBeachChibi, drawRunningChick } from '../art/beach';
import { withFog } from './kit';

const HOUSES = ['#ffd9a8', '#c9e6c0', '#ffc2d4', '#cfd9ff'];
const CHICKS = ['#ffd84a', '#ffa8c5', '#8fe3c2', '#c3a8f5'];
const RUNNERS = 9;

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
    // Street scene: sky, a row of houses, the road. Chicks and beach-goers run across it.
    ctx.fillStyle = '#9fdcff';
    ctx.fillRect(0, 0, PX_W, PX_H);
    const scroll = (time * 60) % 128;
    for (let i = -1; i < 6; i++) {
      const x = i * 128 - scroll;
      ctx.fillStyle = HOUSES[((i + Math.floor((time * 60) / 128)) % HOUSES.length + HOUSES.length) % HOUSES.length]!;
      ctx.fillRect(x + 8, 70, 112, 90);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(x + 24, 88, 24, 24);
      ctx.fillRect(x + 78, 88, 24, 24);
    }
    ctx.fillStyle = '#8a8f99';
    ctx.fillRect(0, 150, PX_W, 46);
    ctx.fillStyle = '#f2d9a0';
    ctx.fillRect(0, 142, PX_W, 10);
    for (let i = 0; i < RUNNERS; i++) {
      // Each runner crosses the screen at its own pace and wraps around.
      const pace = 70 + ((i * 37) % 50);
      const x = ((time * pace + i * 97) % (PX_W + 120)) - 60;
      const y = 176 + ((i * 13) % 3) * 8;
      const stride = Math.sin(time * 14 + i * 1.9);
      const hop = Math.abs(stride) * 4;
      if (i % 2 === 0) drawRunningChick(ctx, x, y - hop, 44, CHICKS[i % CHICKS.length]!, stride);
      else drawBeachChibi(ctx, x, y - hop, 78, i * 7 + 3, stride);
    }
    ctx.fillStyle = '#b3122e';
    ctx.fillRect(0, 0, PX_W, 52);
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
