import * as THREE from 'three';
import { MORPH_GLITCH, RUSTLE_TIME } from '../config';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { mat, noise, withFog } from './kit';
import { buildProp } from './props';

/**
 * The Goose roulette on screen: the green pixel cloud of a Deepfake, the feathers
 * it leaves, and potted plants that shake when something invisible brushes past.
 * Reads sim state only; nothing here changes the match.
 */
export interface TricksView {
  root: THREE.Group;
  update(world: WorldState, time: number, dt: number): void;
  /** New office: forget the plant copies. */
  reset(): void;
}

const CLOUD_PIXELS = 36;
const FEATHERS = 6;
const LEAVES = 10;

export function createTricks(): TricksView {
  const root = new THREE.Group();

  // Glitch cloud: one instanced mesh of little green cubes, re-scattered every frame.
  const cloud = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.11, 0.11, 0.11),
    withFog(new THREE.MeshLambertMaterial({ color: 0x5dff8a, emissive: 0x1fbf4f })),
    CLOUD_PIXELS,
  );
  cloud.frustumCulled = false;
  cloud.castShadow = false;
  const tint = new THREE.Color();
  for (let i = 0; i < CLOUD_PIXELS; i++) cloud.setColorAt(i, tint.setHex([0x5dff8a, 0xb6ff5d, 0x2fe0c8, 0xffffff][i % 4]!));
  root.add(cloud);

  // Feathers: white quill with a drop of yellow paint at the tip, a small pool.
  const feathers: THREE.Group[] = [];
  for (let i = 0; i < FEATHERS; i++) {
    const vane = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6), mat(0xfdfcf5));
    vane.scale.set(0.38, 0.08, 1);
    vane.position.y = 0.03;
    const paint = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0xffd21f));
    paint.position.set(0, 0.04, 0.15);
    const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), mat(0xe8e2cf));
    quill.rotation.x = Math.PI / 2;
    quill.position.y = 0.035;
    const feather = new THREE.Group();
    feather.add(vane, paint, quill);
    feather.visible = false;
    feathers.push(feather);
    root.add(feather);
  }

  // Shaking plants: a copy of the plant drawn over the still one, wobbling, and a few leaves flying off.
  const copies = new Map<number, THREE.Group>();
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), mat(0x4fae4a), LEAVES * 4);
  leaves.frustumCulled = false;
  root.add(leaves);
  const dummy = new THREE.Object3D();

  const seen = (world: WorldState, x: number, z: number): boolean =>
    world.sight[LOCAL_PLAYER]!.cells[Math.floor(z) * world.level.size + Math.floor(x)] === 1;

  return {
    root,
    reset() {
      for (const copy of copies.values()) root.remove(copy);
      copies.clear();
    },
    update(world, time) {
      // The cloud hangs around whoever is glitching right now and can be seen.
      let shown = 0;
      for (const p of world.participants) {
        if (p.glitch <= 0 || !p.alive || (p.id !== LOCAL_PLAYER && !seen(world, p.x, p.z))) continue;
        const k = 1 - p.glitch / MORPH_GLITCH;
        const rand = noise(Math.floor(time * 24) * 13 + p.id);
        for (let i = 0; i < CLOUD_PIXELS && shown < CLOUD_PIXELS; i++, shown++) {
          const a = rand() * Math.PI * 2;
          const r = 0.25 + rand() * (0.45 + k * 0.2);
          dummy.position.set(p.x + Math.cos(a) * r, 0.1 + rand() * 1.4, p.z + Math.sin(a) * r);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.6 + rand() * 0.9);
          dummy.updateMatrix();
          cloud.setMatrixAt(shown, dummy.matrix);
        }
      }
      cloud.count = shown;
      cloud.visible = shown > 0;
      cloud.instanceMatrix.needsUpdate = true;

      feathers.forEach((feather, i) => {
        const f = world.feathers[i];
        feather.visible = !!f && world.phase === 'play';
        if (!f) return;
        feather.position.set(f.x, 0, f.z);
        feather.rotation.y = (f.x * 7 + f.z * 3) % (Math.PI * 2);
      });

      // Plants: keep a wobbling copy for each rustle, drop it when the rustle is over.
      for (const [prop, copy] of copies) {
        if (world.phase === 'play' && world.rustles.some((r) => r.prop === prop)) continue;
        root.remove(copy);
        copies.delete(prop);
      }
      let leaf = 0;
      for (const r of world.phase === 'play' ? world.rustles : []) {
        const prop = world.level.props[r.prop]!;
        let copy = copies.get(r.prop);
        if (!copy) {
          copy = buildProp(prop.kind, prop.variant);
          copy.position.set(prop.x, 0, prop.z);
          copy.rotation.y = (prop.rot * Math.PI) / 2;
          copy.scale.setScalar(1.04);
          copies.set(r.prop, copy);
          root.add(copy);
        }
        const k = r.left / RUSTLE_TIME;
        copy.rotation.z = Math.sin(time * 26) * 0.12 * k;
        copy.rotation.x = Math.cos(time * 21) * 0.08 * k;
        const rand = noise(r.prop * 31 + 7);
        for (let i = 0; i < LEAVES && leaf < LEAVES * 4; i++, leaf++) {
          const a = rand() * Math.PI * 2;
          const fly = (1 - k) * (0.4 + rand() * 0.6);
          dummy.position.set(prop.x + Math.cos(a) * fly, 1.1 + rand() * 0.7 - (1 - k) * 0.9, prop.z + Math.sin(a) * fly);
          dummy.rotation.set(time * 3 + i, i, 0);
          dummy.scale.set(1, 0.3, 1.6);
          dummy.updateMatrix();
          leaves.setMatrixAt(leaf, dummy.matrix);
        }
      }
      leaves.count = leaf;
      leaves.visible = leaf > 0;
      leaves.instanceMatrix.needsUpdate = true;
    },
  };
}
