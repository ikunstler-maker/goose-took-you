import * as THREE from 'three';
import { BOX_SIZE } from '../config';
import type { WorldState } from '../sim/world';

/** Boxes outside the local player's sight are not drawn, like the chicks carrying them. */
function isSeen(world: WorldState, x: number, z: number): boolean {
  return world.visible[Math.floor(z) * world.level.size + Math.floor(x)] === 1;
}
import { cardboardBox } from './props';

export interface BoxesView {
  root: THREE.Group;
  update(world: WorldState, time: number): void;
  dispose(): void;
}

/** Moving boxes: carried in the chick's wings (bouncing and knocking) or lying where they fell. */
export function createBoxes(): BoxesView {
  const root = new THREE.Group();
  const meshes = new Map<number, THREE.Group>();

  const make = (): THREE.Group => {
    const model = cardboardBox(BOX_SIZE);
    // Shadows are redrawn only on demand, so moving boxes do not cast them.
    model.traverse((node) => (node.castShadow = false));
    root.add(model);
    return model;
  };

  return {
    root,
    update(world, time) {
      const alive = new Set<number>();
      for (const box of world.boxes) {
        alive.add(box.id);
        let model = meshes.get(box.id);
        if (!model) {
          model = make();
          meshes.set(box.id, model);
        }
        const carrier = box.carrier === null ? null : world.participants[box.carrier];
        model.visible = isSeen(world, box.x, box.z);
        if (carrier) {
          const { facing } = carrier;
          // Held in front of the chest; bounces with the step and knocks from side to side.
          const bounce = Math.abs(Math.sin(time * 9)) * 0.08;
          model.position.set(box.x + Math.sin(facing) * 0.5, 0.45 + bounce, box.z + Math.cos(facing) * 0.5);
          model.rotation.set(Math.sin(time * 13) * 0.06, facing, Math.sin(time * 9) * 0.1);
        } else {
          model.position.set(box.x, 0, box.z);
          model.rotation.set(0, box.id * 0.7, 0);
        }
      }
      for (const [id, model] of meshes) {
        if (alive.has(id)) continue;
        root.remove(model);
        meshes.delete(id);
      }
    },
    dispose() {
      // Geometry and materials come from the shared kit caches.
      root.clear();
      meshes.clear();
    },
  };
}
