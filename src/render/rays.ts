import * as THREE from 'three';
import { SUN_RAY_LAYERS, SUN_RAY_OPACITY, WINDOW_HEIGHT } from '../config';
import { GLASS, type Level } from '../sim/level';
import { withFog } from './kit';

/** Soft warm sheets; the per-vertex alpha fades each one out towards the floor. */
const RAY = withFog(
  new THREE.MeshBasicMaterial({
    color: 0xfff1c2,
    transparent: true,
    opacity: SUN_RAY_OPACITY,
    vertexColors: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
);

/** Horizontal travel of a sun ray per metre of fall: the sun stands in the south-west (see `stage.fitSun`). */
const DRIFT_X = 42 / 44;
const DRIFT_Z = -20 / 44;

/**
 * Sun shafts through the west and south facade windows: for every pane between
 * two mullions, a few slanted sheets from the glass down to the floor. One mesh.
 */
export function buildRays(level: Level): THREE.Mesh {
  const n = level.size;
  const positions: number[] = [];
  const colors: number[] = [];
  const quad = (ax: number, az: number, bx: number, bz: number, top: number): void => {
    const dx = top * DRIFT_X;
    const dz = top * DRIFT_Z;
    // a, b at the glass; c, d where the light lands.
    const v = [
      [ax, top, az, 1],
      [bx, top, bz, 1],
      [bx + dx, 0.04, bz + dz, 0.1],
      [ax + dx, 0.04, az + dz, 0.1],
    ] as const;
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(v[i]![0], v[i]![1], v[i]![2]);
      colors.push(1, 1, 1, v[i]![3]);
    }
  };
  const pane = (alongX: boolean, from: number, to: number): void => {
    for (let layer = 1; layer <= SUN_RAY_LAYERS; layer++) {
      const top = ((WINDOW_HEIGHT - 0.2) * layer) / SUN_RAY_LAYERS;
      // West facade panes run along z at x = 1; south facade panes run along x at z = n - 1.
      if (alongX) quad(from, n - 1, to, n - 1, top);
      else quad(1, from, 1, to, top);
    }
  };
  const run = (alongX: boolean): void => {
    const fixed = alongX ? n - 1 : 0;
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const cell = i < n ? (alongX ? fixed * n + i : i * n + fixed) : -1;
      const glass = cell >= 0 && level.cells[cell] === GLASS;
      if (glass && start < 0) start = i;
      if (!glass && start >= 0) {
        // Mullions stand every 2 m; each pane between them throws its own shaft.
        for (let k = start; k < i; k += 2) pane(alongX, k + 0.15, Math.min(i, k + 2) - 0.15);
        start = -1;
      }
    }
  };
  run(false);
  run(true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  const mesh = new THREE.Mesh(geometry, RAY);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  return mesh;
}
