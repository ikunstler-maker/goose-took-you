import * as THREE from 'three';
import { ACCESSORIES, CHICK_COLORS, TELL_TIME, TELL_VISIBLE_RANGE } from '../config';
import { seesHonk } from '../sim/meeting';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { createChick, type ChickView } from './chick';
import { mat } from './kit';
import { t } from '../i18n';

/** Seconds a dive under a rug or a climb out of it takes on screen. */
const DIVE_TIME = 0.38;

const HALO = new THREE.RingGeometry(0.46, 0.58, 32).rotateX(-Math.PI / 2);

export interface ChicksView {
  root: THREE.Group;
  /** Rebuilds models after a look change or a new match. */
  rebuild(world: WorldState): void;
  update(world: WorldState, time: number, dt: number): void;
  /** Plays the dive under a rug at (x, z), or the climb out of it, for one participant. */
  dive(who: number, x: number, z: number, action: 'in' | 'out'): void;
}

/** Every participant's chick. Others are drawn only while the local player can see them. */
export function createChicks(): ChicksView {
  const root = new THREE.Group();
  let views: ChickView[] = [];
  /** Dives and climb-outs being played, by participant: seconds done, the rug, and where the dive started. */
  const dives = new Map<number, { t: number; x: number; z: number; action: 'in' | 'out'; fromX: number; fromZ: number }>();
  // A soft ring under the local player's chick, so it stands out in a crowd.
  const halo = new THREE.Mesh(HALO, mat(0xfff4c2, { emissive: 0xffe08a, opacity: 0.85 }));
  halo.position.y = 0.035;
  return {
    root,
    rebuild(world) {
      root.clear();
      root.add(halo);
      dives.clear();
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
        view.root.visible = p.alive && p.under === null && (p.id === LOCAL_PLAYER || world.sight[LOCAL_PLAYER]!.cells[cell] === 1);
        // The neck only reads up close; the player's own Goose always shows it to its player.
        const close = p.id === LOCAL_PLAYER || Math.hypot(p.x - self.x, p.z - self.z) <= TELL_VISIBLE_RANGE;
        const neck = p.tell > 0 && close ? Math.sin((p.tell / TELL_TIME) * Math.PI) : 0;
        // «Га-га» shows only to whoever the Goose is turned towards, up close; the Goose sees its own.
        const bubble = seesHonk(world, self, p) ? t('goose.tell') : p.thought ? t(`thought.${p.thought}`) : null;
        const dive = dives.get(p.id);
        if (dive && (dive.t += dt) >= DIVE_TIME) dives.delete(p.id);
        if (dive && dives.has(p.id) && dive.action === 'in') {
          // Head first under the rug: the chick slides to its middle, tips over and shrinks away,
          // although the match already counts it as hidden.
          const k = dive.t / DIVE_TIME;
          const ease = k * k * (3 - 2 * k);
          const x = dive.fromX + (dive.x - dive.fromX) * ease;
          const z = dive.fromZ + (dive.z - dive.fromZ) * ease;
          view.update(x, z, Math.atan2(dive.x - dive.fromX, dive.z - dive.fromZ), true, 'surprised', time, dt, 0, null);
          view.root.visible = world.sight[LOCAL_PLAYER]!.cells[Math.floor(dive.z) * n + Math.floor(dive.x)] === 1 || p.id === LOCAL_PLAYER;
          view.root.scale.setScalar(1 - 0.85 * ease);
          view.root.position.y = Math.sin(k * Math.PI) * 0.25 - 0.1 * ease;
          // Tip forward along its own heading, whatever way it faces.
          view.root.rotation.order = 'YXZ';
          view.root.rotation.x = ease * 1.1;
          return;
        }
        view.update(p.x, p.z, p.facing, p.moving, p.emotion, time, dt, neck, bubble);
        if (dive && dives.has(p.id)) {
          // Climbing out: pops up from the rug with a little hop and a stretch.
          const k = dive.t / DIVE_TIME;
          view.root.scale.setScalar(0.15 + 0.85 * Math.min(1, k * 1.25) + Math.sin(k * Math.PI) * 0.12);
          view.root.position.y = Math.sin(k * Math.PI) * 0.35;
          view.root.rotation.x = 0;
        } else {
          view.root.scale.setScalar(1);
          view.root.rotation.x = 0;
        }
        if (p.id === LOCAL_PLAYER) {
          halo.position.set(p.x, 0.035, p.z);
          halo.visible = p.alive;
        }
      });
    },
    dive(who, x, z, action) {
      const view = views[who];
      if (!view) return;
      // The dive starts from where the chick was last drawn; a chick never drawn dives on the spot.
      const drawn = view.root.visible ? view.root.position : null;
      dives.set(who, { t: 0, x, z, action, fromX: drawn ? drawn.x : x, fromZ: drawn ? drawn.z : z });
    },
  };
}
