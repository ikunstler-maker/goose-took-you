import * as THREE from 'three';
import { ACCESSORIES, CHICK_COLORS } from '../config';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { createChick, type ChickView } from './chick';
import { mat } from './kit';

const HALO = new THREE.RingGeometry(0.46, 0.58, 32).rotateX(-Math.PI / 2);

export interface ChicksView {
  root: THREE.Group;
  /** Rebuilds models after a look change or a new match. */
  rebuild(world: WorldState): void;
  update(world: WorldState, time: number, dt: number): void;
}

/** Every participant's chick. Others are drawn only while the local player can see them. */
export function createChicks(): ChicksView {
  const root = new THREE.Group();
  let views: ChickView[] = [];
  // A soft ring under the local player's chick, so it stands out in a crowd.
  const halo = new THREE.Mesh(HALO, mat(0xfff4c2, { emissive: 0xffe08a, opacity: 0.85 }));
  halo.position.y = 0.035;
  return {
    root,
    rebuild(world) {
      root.clear();
      root.add(halo);
      views = world.participants.map((p) => {
        const view = createChick(CHICK_COLORS[p.color], ACCESSORIES[p.accessory]);
        root.add(view.root);
        return view;
      });
    },
    update(world, time, dt) {
      const n = world.level.size;
      world.participants.forEach((p, i) => {
        const view = views[i];
        if (!view) return;
        const cell = Math.floor(p.z) * n + Math.floor(p.x);
        view.root.visible = p.id === LOCAL_PLAYER || world.visible[cell] === 1;
        view.update(p.x, p.z, p.facing, p.moving, p.emotion, time, dt);
        if (p.id === LOCAL_PLAYER) halo.position.set(p.x, 0.035, p.z);
      });
    },
  };
}
