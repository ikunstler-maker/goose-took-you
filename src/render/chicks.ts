import * as THREE from 'three';
import { ACCESSORIES, CHICK_COLORS, TELL_TIME, TELL_VISIBLE_RANGE } from '../config';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { createChick, type ChickView } from './chick';
import { mat } from './kit';
import { t } from '../i18n';

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
        // Only the Goose's own player sees the Goose; to everyone else it is one more chick.
        const unmasked = p.id === LOCAL_PLAYER && p.role === 'goose';
        const view = createChick(CHICK_COLORS[p.color], ACCESSORIES[p.accessory], unmasked);
        root.add(view.root);
        return view;
      });
    },
    update(world, time, dt) {
      const n = world.level.size;
      const self = world.participants[LOCAL_PLAYER]!;
      world.participants.forEach((p, i) => {
        const view = views[i];
        if (!view) return;
        const cell = Math.floor(p.z) * n + Math.floor(p.x);
        // Packed chicks sit inside their box and are not drawn.
        view.root.visible = p.alive && (p.id === LOCAL_PLAYER || world.visible[cell] === 1);
        // The neck only reads up close; the player's own Goose always shows it to its player.
        const close = p.id === LOCAL_PLAYER || Math.hypot(p.x - self.x, p.z - self.z) <= TELL_VISIBLE_RANGE;
        const neck = p.tell > 0 && close ? Math.sin((p.tell / TELL_TIME) * Math.PI) : 0;
        const bubble = p.tellBubble && close ? t('goose.tell') : p.thought ? t(`thought.${p.thought}`) : null;
        view.update(p.x, p.z, p.facing, p.moving, p.emotion, time, dt, neck, bubble);
        if (p.id === LOCAL_PLAYER) {
          halo.position.set(p.x, 0.035, p.z);
          halo.visible = p.alive;
        }
      });
    },
  };
}
