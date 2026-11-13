import * as THREE from 'three';
import { MARKER_HEIGHT } from '../config';
import { openFixPoints } from '../sim/sabotage';
import { LOCAL_PLAYER, me, type WorldState } from '../sim/world';
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
  // Red arrows over the sabotage fix points; shown only while the player can help there.
  const alarmMaterial = mat(0xff4a3d, { emissive: 0x8a1a10 });
  const fixes = new Map<number, THREE.Mesh>();
  for (const point of [...world.fixPoints.overheat, ...world.fixPoints.call]) {
    const prop = world.level.props[point]!;
    const arrow = cone(0.3, 0.56, alarmMaterial, prop.x, MARKER_HEIGHT + 0.3, prop.z);
    arrow.rotation.x = Math.PI;
    arrow.castShadow = false;
    arrow.receiveShadow = false;
    arrow.visible = false;
    fixes.set(point, arrow);
    root.add(arrow);
  }
  const markers: TaskMarkers = {
    root,
    refresh(next) {
      for (const task of next.tasks) {
        const arrow = arrows.get(task.id);
        if (!arrow) continue;
        arrow.visible = !task.done && !task.started;
        // A badge task moves from the card rack to the reader.
        const prop = next.level.props[next.stations[task.station]!.prop]!;
        arrow.position.x = prop.x;
        arrow.position.z = prop.z;
      }
      const open = next.phase === 'play' ? openFixPoints(next, me(next)) : [];
      for (const [point, arrow] of fixes) arrow.visible = open.includes(point);
    },
    update(time) {
      let i = 0;
      for (const arrow of arrows.values()) {
        arrow.position.y = MARKER_HEIGHT + Math.sin(time * 3 + i++) * 0.12;
        arrow.rotation.y = time * 1.5;
      }
      for (const arrow of fixes.values()) {
        arrow.position.y = MARKER_HEIGHT + 0.3 + Math.abs(Math.sin(time * 5)) * 0.25;
        arrow.rotation.y = time * 3;
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
