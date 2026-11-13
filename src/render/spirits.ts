import * as THREE from 'three';
import { ACCESSORIES, CHICK_COLORS, SPIRIT_SPARKLES } from '../config';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { createChick, type ChickView } from './chick';
import { ghostly } from './chicks';
import { noise } from './kit';

/**
 * What a spirit sees besides other spirits: the spirit bots drifting between
 * desks, and sparkles hanging in the air around it. Reads sim state only.
 */
export interface SpiritsView {
  root: THREE.Group;
  update(world: WorldState, time: number, dt: number): void;
  /** New office: forget the spirit bots of the last one. */
  reset(): void;
}

const SPREAD = 14;

export function createSpirits(): SpiritsView {
  const root = new THREE.Group();
  const views = new Map<number, ChickView>();

  // Sparkles: a cloud of tiny glints that follows the spirit and twinkles.
  const base = new Float32Array(SPIRIT_SPARKLES * 3);
  const rand = noise(4242);
  for (let i = 0; i < SPIRIT_SPARKLES; i++) {
    base[i * 3] = (rand() - 0.5) * SPREAD * 2;
    base[i * 3 + 1] = 0.2 + rand() * 2.6;
    base[i * 3 + 2] = (rand() - 0.5) * SPREAD * 2;
  }
  const positions = new Float32Array(SPIRIT_SPARKLES * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparkles = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xfff6c8, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  sparkles.frustumCulled = false;
  root.add(sparkles);

  return {
    root,
    reset() {
      for (const view of views.values()) root.remove(view.root);
      views.clear();
    },
    update(world, time, dt) {
      const self = world.participants[LOCAL_PLAYER]!;
      const spirit = !self.alive && world.phase === 'play';
      sparkles.visible = spirit;
      if (spirit) {
        for (let i = 0; i < SPIRIT_SPARKLES; i++) {
          // Each glint drifts in a slow loop around its home spot near the spirit.
          positions[i * 3] = self.x + base[i * 3]! + Math.sin(time * 0.6 + i) * 0.3;
          positions[i * 3 + 1] = base[i * 3 + 1]! + Math.sin(time * 1.3 + i * 1.7) * 0.25;
          positions[i * 3 + 2] = self.z + base[i * 3 + 2]! + Math.cos(time * 0.5 + i) * 0.3;
        }
        geometry.attributes.position!.needsUpdate = true;
        (sparkles.material as THREE.PointsMaterial).opacity = 0.55 + 0.35 * Math.sin(time * 3);
      }

      // Spirit bots: built once each, shown only to spirits that have them in sight.
      const n = world.level.size;
      for (const [id, view] of views) {
        if (!world.spirits.some((s) => s.id === id)) {
          root.remove(view.root);
          views.delete(id);
        }
      }
      for (const s of world.spirits) {
        let view = views.get(s.id);
        if (!view) {
          view = createChick(CHICK_COLORS[s.color], ACCESSORIES[s.accessory]);
          ghostly(view.root, 0.55, true);
          views.set(s.id, view);
          root.add(view.root);
        }
        view.root.visible = spirit && world.sight[LOCAL_PLAYER]!.cells[Math.floor(s.z) * n + Math.floor(s.x)] === 1;
        if (view.root.visible) view.update(s.x, s.z, s.facing, s.moving, s.moving ? 'happy' : 'calm', time, dt, 0, null);
      }
    },
  };
}
