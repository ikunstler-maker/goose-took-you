import * as THREE from 'three';
import { CONFETTI_PIECES, CONFETTI_TIME } from '../config';
import { noise, withFog } from './kit';

/** Paper confetti that bursts under the ceiling and flutters down; one instanced mesh, no per-frame allocations. */
export interface Confetti {
  root: THREE.Object3D;
  /** Start a burst above (x, z). */
  burst(x: number, z: number): void;
  update(dt: number): void;
  dispose(): void;
}

const COLORS = [0xff5d8f, 0x3fc3ff, 0xffc93d, 0x7be05a, 0xb07cff, 0xff8a3d, 0xffffff];
const CEILING = 3.4;
const GRAVITY = 2.6;

export function createConfetti(): Confetti {
  const geometry = new THREE.PlaneGeometry(0.11, 0.07);
  const material = withFog(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));
  const mesh = new THREE.InstancedMesh(geometry, material, CONFETTI_PIECES);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.visible = false;
  const color = new THREE.Color();
  for (let i = 0; i < CONFETTI_PIECES; i++) mesh.setColorAt(i, color.setHex(COLORS[i % COLORS.length]!));

  // Per piece: position, velocity, spin phase and speed.
  const pos = new Float32Array(CONFETTI_PIECES * 3);
  const vel = new Float32Array(CONFETTI_PIECES * 3);
  const spin = new Float32Array(CONFETTI_PIECES * 2);
  const dummy = new THREE.Object3D();
  let left = 0;
  let age = 0;

  return {
    root: mesh,
    burst(x, z) {
      // Looks only: a fixed pattern, not gameplay randomness.
      const rand = noise(Math.floor(x * 31 + z * 17) + 5);
      for (let i = 0; i < CONFETTI_PIECES; i++) {
        const a = rand() * Math.PI * 2;
        const speed = 1 + rand() * 3.2;
        pos[i * 3] = x + (rand() - 0.5) * 0.6;
        pos[i * 3 + 1] = CEILING - rand() * 0.4;
        pos[i * 3 + 2] = z + (rand() - 0.5) * 0.6;
        vel[i * 3] = Math.cos(a) * speed;
        vel[i * 3 + 1] = 1.5 + rand() * 2.5;
        vel[i * 3 + 2] = Math.sin(a) * speed;
        spin[i * 2] = rand() * Math.PI * 2;
        spin[i * 2 + 1] = 4 + rand() * 9;
      }
      left = CONFETTI_TIME;
      age = 0;
      mesh.visible = true;
    },
    update(dt) {
      if (left <= 0) return;
      left -= dt;
      age += dt;
      if (left <= 0) {
        mesh.visible = false;
        return;
      }
      const drag = Math.exp(-1.8 * dt);
      for (let i = 0; i < CONFETTI_PIECES; i++) {
        const k = i * 3;
        vel[k] = vel[k]! * drag;
        vel[k + 2] = vel[k + 2]! * drag;
        // Paper falls slowly: gravity with a low terminal speed.
        vel[k + 1] = Math.max(-1.1, vel[k + 1]! - GRAVITY * dt);
        pos[k] = pos[k]! + vel[k]! * dt;
        pos[k + 1] = Math.max(0.03, pos[k + 1]! + vel[k + 1]! * dt);
        pos[k + 2] = pos[k + 2]! + vel[k + 2]! * dt;
        const landed = pos[k + 1]! <= 0.031;
        const phase = spin[i * 2]! + (landed ? 0 : age * spin[i * 2 + 1]!);
        dummy.position.set(pos[k]! + (landed ? 0 : Math.sin(phase) * 0.05), pos[k + 1]!, pos[k + 2]!);
        dummy.rotation.set(landed ? -Math.PI / 2 : phase, phase * 0.7, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
