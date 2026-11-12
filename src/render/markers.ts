import * as THREE from 'three';
import { MARKER_HEIGHT } from '../config';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { cone, mat } from './kit';

export interface TaskMarkers {
  root: THREE.Group;
  /** Hides markers of finished tasks. */
  refresh(world: WorldState): void;
  update(time: number): void;
  dispose(): void;
}

/** Bobbing arrows above stations where the local player still has work. */
export function createTaskMarkers(world: WorldState): TaskMarkers {
  const root = new THREE.Group();
  const material = mat(0xffc93d, { emissive: 0x8a5a00 });
  const arrows = new Map<number, THREE.Mesh>();
  for (const task of world.tasks) {
    if (task.owner !== LOCAL_PLAYER) continue;
    const prop = world.level.props[world.stations[task.station]!.prop]!;
    const arrow = cone(0.22, 0.42, material, prop.x, MARKER_HEIGHT, prop.z);
    arrow.rotation.x = Math.PI;
    // Shadows are redrawn only on demand, so a moving arrow must not cast one.
    arrow.castShadow = false;
    arrow.receiveShadow = false;
    arrows.set(task.id, arrow);
    root.add(arrow);
  }
  const markers: TaskMarkers = {
    root,
    refresh(next) {
      for (const task of next.tasks) {
        const arrow = arrows.get(task.id);
        if (arrow) arrow.visible = !task.done;
      }
    },
    update(time) {
      let i = 0;
      for (const arrow of arrows.values()) {
        arrow.position.y = MARKER_HEIGHT + Math.sin(time * 3 + i++) * 0.12;
        arrow.rotation.y = time * 1.5;
      }
    },
    dispose() {
      // Geometry and material come from the shared kit caches.
      root.clear();
    },
  };
  markers.refresh(world);
  return markers;
}
