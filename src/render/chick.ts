import * as THREE from 'three';
import { cone, cylinder, mat, smoothSphere } from './kit';

export interface ChickView {
  root: THREE.Group;
  update(x: number, z: number, facing: number, moving: boolean, time: number, dt: number): void;
}

export function createChick(color = 0xffd84a): ChickView {
  const body = mat(color);
  const wingMat = mat(0xf2c23a);
  const orange = mat(0xff9a2e);
  const black = mat(0x1d1a22);
  const white = mat(0xffffff, { emissive: 0xffffff });

  const root = new THREE.Group();
  root.scale.setScalar(1.2);
  const bob = new THREE.Group();
  root.add(bob);

  const torso = smoothSphere(0.42, body, 0, 0.5, 0);
  torso.scale.set(1, 0.92, 1);
  const head = smoothSphere(0.36, body, 0, 1.0, 0.04);
  bob.add(torso, head);

  // Oversized eyes with a specular dot.
  for (const side of [-1, 1]) {
    const eye = smoothSphere(0.085, black, side * 0.15, 1.04, 0.34);
    eye.scale.set(1, 1.25, 0.6);
    eye.castShadow = false;
    const shine = smoothSphere(0.03, white, side * 0.13, 1.08, 0.385);
    shine.castShadow = false;
    const cheek = smoothSphere(0.06, mat(0xff9f9f), side * 0.25, 0.94, 0.28);
    cheek.scale.set(1, 0.6, 0.4);
    cheek.castShadow = false;
    bob.add(eye, shine, cheek);
  }

  const beak = cone(0.07, 0.14, orange, 0, 0.96, 0.4);
  beak.rotation.x = Math.PI / 2;
  bob.add(beak);

  // Crest tuft.
  for (const [x, lean] of [[-0.06, 0.35], [0, 0], [0.06, -0.35]] as const) {
    const tuft = cone(0.04, 0.16, body, x, 1.4, 0);
    tuft.rotation.z = lean;
    bob.add(tuft);
  }

  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.4, 0.62, 0);
    const wing = smoothSphere(0.2, wingMat, side * 0.04, -0.12, 0);
    wing.scale.set(0.45, 1, 0.75);
    pivot.add(wing);
    bob.add(pivot);
    return { pivot, side };
  });

  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.16, 0.2, 0);
    const foot = cone(0.09, 0.05, orange, 0, -0.17, 0.05);
    foot.scale.set(1, 1, 1.5);
    pivot.add(cylinder(0.035, 0.035, 0.2, orange, 0, -0.08, 0, 6), foot);
    root.add(pivot);
    return { pivot, side };
  });

  let stride = 0;
  let heading = 0;

  return {
    root,
    update(x, z, facing, moving, time, dt) {
      root.position.set(x, 0, z);
      // Turn towards the heading along the shortest arc.
      const delta = Math.atan2(Math.sin(facing - heading), Math.cos(facing - heading));
      heading += delta * Math.min(1, dt * 14);
      root.rotation.y = heading;

      stride += moving ? dt * 14 : 0;
      const swing = moving ? Math.sin(stride) : 0;
      for (const leg of legs) leg.pivot.rotation.x = swing * 0.7 * leg.side;
      const flap = moving ? 0.5 + Math.abs(Math.sin(stride)) * 0.5 : 0.12 + Math.sin(time * 2) * 0.05;
      for (const wing of wings) wing.pivot.rotation.z = flap * wing.side;
      bob.position.y = moving ? Math.abs(Math.sin(stride)) * 0.09 : Math.sin(time * 2) * 0.012;
      bob.rotation.z = swing * 0.07;
    },
  };
}
