import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CUTAWAY_REACH, VISION_RADIUS, WALL_HEIGHT, WALL_LOW, WINDOW_HEIGHT } from '../config';
import { FLOOR, GLASS, SOLID, type Level } from '../sim/level';
import type { RoomType } from '../sim/prefabs';
import { me, type WorldState } from '../sim/world';
import { FLOOR_DENSITY, floorMaterial } from './floors';
import { box, cylinder, disposeTree, fogUniforms, mat, sphere, withFog } from './kit';
import { buildProp } from './props';
import { buildRays } from './rays';

const WALL = mat(0xffffff);
// Wall tops win depth ties against the side faces of neighbouring cells,
// otherwise slivers of the light sides flicker along every seam.
const CAP = withFog(
  new THREE.MeshLambertMaterial({ color: 0x30333c, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
);
const FRAME = mat(0xfdfbf5);
const GLASS_PANE = mat(0xbfe9ff, { opacity: 0.22 });
const GRASS = mat(0x8fd16a);
const HILL = mat(0x7cc45c);
const TRUNK = mat(0x8a5a36);
const CANOPY = [0x4fae52, 0x66c25a, 0x3c9a4b];

/** Tint of the walls that enclose each room; other walls stay neutral. */
const WALL_TINT: Record<RoomType, number> = {
  lobby: 0xffe9c4,
  buying: 0xd5e2ff,
  copycat: 0xd2f5e8,
  news: 0xffdede,
  cargo: 0xe6e0d4,
  motion: 0xdcd6ff,
  meeting: 0xffe3c9,
  lounge: 0xffd9c9,
  greenhouse: 0xd9f2c9,
};
const WALL_NEUTRAL = 0xf7f1e6;

// Static props are merged into a few vertex-coloured meshes per map chunk.
const MERGED_LIT = withFog(new THREE.MeshLambertMaterial({ vertexColors: true }));
const MERGED_GLOW = withFog(new THREE.MeshBasicMaterial({ vertexColors: true }));
const CHUNKS = 4;

export interface OfficeView {
  root: THREE.Group;
  /** Advances fog, wall cutaways and animated parts. Returns true when shadows must be redrawn. */
  update(world: WorldState, time: number, dt: number): boolean;
  dispose(): void;
}

function coloured(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

/** Flat quads with world-space UVs, one per listed cell. */
function floorGeometry(cells: [number, number, number, number][], y: number, density: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  cells.forEach(([x0, z0, x1, z1], i) => {
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x1, z0]] as const) {
      positions.push(x, y, z);
      normals.push(0, 1, 0);
      uvs.push(x * density, z * density);
    }
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

function buildFloors(level: Level, root: THREE.Group): void {
  const n = level.size;
  const add = (type: RoomType | 'corridor', cells: [number, number, number, number][], y: number): void => {
    const mesh = new THREE.Mesh(floorGeometry(cells, y, FLOOR_DENSITY[type]), floorMaterial(type));
    mesh.receiveShadow = true;
    mesh.userData.ownsResources = true;
    mesh.userData.sharedMaterial = true;
    root.add(mesh);
  };
  add('corridor', [[0, 0, n, n]], 0);
  for (const room of level.rooms) {
    const cells: [number, number, number, number][] = [];
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) if (level.zone[z * n + x] === room.id) cells.push([x, z, x + 1, z + 1]);
    }
    add(room.type, cells, 0.012);
  }
}

/** Facade windows: one framed pane per straight run of glass cells. */
function buildGlass(level: Level, parent: THREE.Group): void {
  const n = level.size;
  const h = WINDOW_HEIGHT;
  const run = (alongX: boolean, fixed: number): void => {
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const cell = i < n ? (alongX ? fixed * n + i : i * n + fixed) : -1;
      const glass = cell >= 0 && level.cells[cell] === GLASS;
      if (glass && start < 0) start = i;
      if (!glass && start >= 0) {
        const length = i - start;
        const mid = start + length / 2;
        const x = alongX ? mid : fixed + 0.5;
        const z = alongX ? fixed + 0.5 : mid;
        const w = alongX ? length : 0.3;
        const d = alongX ? 0.3 : length;
        parent.add(box(w, 0.25, d, FRAME, x, 0.125, z), box(w, 0.1, d, FRAME, x, h - 0.05, z));
        const pane = box(alongX ? length : 0.05, h - 0.25, alongX ? 0.05 : length, GLASS_PANE, x, h / 2 + 0.125, z, false);
        pane.receiveShadow = false;
        parent.add(pane);
        for (let k = 0; k <= length; k += 2) {
          parent.add(box(0.12, h, 0.12, FRAME, alongX ? start + k : x, h / 2, alongX ? z : start + k));
        }
        start = -1;
      }
    }
  };
  for (const fixed of [0, n - 1]) {
    run(true, fixed);
    run(false, fixed);
  }
}

const crownCache = new Map<number, THREE.BufferGeometry>();

function crownGeometry(variant: number): THREE.BufferGeometry {
  let geometry = crownCache.get(variant);
  if (!geometry) {
    const blobs: [number, number, number, number][] = [
      [2.1, 0, 4.4, 0],
      [1.5, 1.3, 3.6, 0.5],
      [1.4, -1.2, 3.8, -0.4],
    ];
    geometry = mergeGeometries(
      blobs.map(([r, x, y, z], i) =>
        coloured(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), new THREE.Color(CANOPY[(variant + i) % 3]!)),
      ),
    );
    crownCache.set(variant, geometry);
  }
  return geometry;
}

function buildPark(size: number, statics: THREE.Group, root: THREE.Group): void {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size * 5, size * 5), GRASS);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(size / 2, -0.06, size / 2);
  ground.receiveShadow = true;
  ground.userData.ownsResources = true;
  root.add(ground);

  let count = 0;
  const plant = (x: number, z: number): void => {
    count++;
    const jitter = ((count * 37) % 10) / 10;
    const scale = 0.8 + jitter * 0.6;
    const px = x + jitter * 3;
    const pz = z - jitter * 3;
    const trunk = cylinder(0.25, 0.4, 3, TRUNK, px, 1.5 * scale, pz, 7);
    trunk.scale.setScalar(scale);
    statics.add(trunk);
    // Crowns sway in the wind, so they stay separate from the merged statics.
    const crown = new THREE.Mesh(crownGeometry(count % 3), MERGED_LIT);
    crown.position.set(px, 0, pz);
    crown.scale.setScalar(scale);
    crown.castShadow = true;
    crown.userData.sway = 0.03;
    root.add(crown);
  };
  for (let t = -8; t <= size + 8; t += 9) {
    plant(t, -6 - ((t / 9) % 2) * 5);
    plant(t + 4, -18 - ((t / 9) % 3) * 3);
    plant(-6 - ((t / 9) % 2) * 5, t);
    plant(-18 - ((t / 9) % 3) * 3, t + 4);
    if ((t / 9) % 2 === 0) {
      plant(size + 9, t);
      plant(t, size + 9);
    }
  }
  for (let i = 0; i < 8; i++) {
    for (const [x, z] of [[-30 + i * 24, -40 - (i % 2) * 8], [-40 - (i % 2) * 8, -30 + i * 24]] as const) {
      const hill = sphere(15, HILL, x, -9, z, 2);
      hill.castShadow = false;
      statics.add(hill);
    }
  }
}

/**
 * Bakes static meshes into a few vertex-coloured meshes per chunk; anything
 * animated, textured or transparent is moved over to `root` unchanged.
 */
function mergeStatics(source: THREE.Group, root: THREE.Group, size: number): void {
  source.updateMatrixWorld(true);
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  const chunk = size / CHUNKS;
  const origin = new THREE.Vector3();

  const visit = (node: THREE.Object3D): void => {
    if (node.userData.spin !== undefined || node.userData.sway !== undefined) {
      keep.push(node);
      return;
    }
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      const kind = material.userData.merge as string | undefined;
      if (!kind || mesh.userData.ownsResources) {
        keep.push(mesh);
      } else {
        origin.setFromMatrixPosition(mesh.matrixWorld);
        const cx = Math.min(CHUNKS - 1, Math.max(0, Math.floor(origin.x / chunk)));
        const cz = Math.min(CHUNKS - 1, Math.max(0, Math.floor(origin.z / chunk)));
        const key = `${cx}:${cz}:${kind}:${mesh.castShadow ? 1 : 0}`;
        const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        source.applyMatrix4(mesh.matrixWorld);
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(coloured(source, material.color));
      }
      return;
    }
    for (const child of [...node.children]) visit(child);
  };
  visit(source);

  for (const [key, list] of buckets) {
    const [, , kind, shadow] = key.split(':');
    const merged = new THREE.Mesh(mergeGeometries(list), kind === 'lit' ? MERGED_LIT : MERGED_GLOW);
    for (const geometry of list) geometry.dispose();
    merged.castShadow = shadow === '1';
    merged.receiveShadow = kind === 'lit';
    merged.userData.ownsResources = true;
    root.add(merged);
  }
  root.updateMatrixWorld(true);
  for (const node of keep) root.attach(node);
}

export function buildOffice(level: Level): OfficeView {
  const n = level.size;
  const root = new THREE.Group();
  buildFloors(level, root);

  // --- Walls: one instanced box per solid cell, height animated for cutaways ---
  const instanceOf = new Int32Array(n * n).fill(-1);
  let count = 0;
  for (let i = 0; i < n * n; i++) if (level.cells[i] === SOLID) instanceOf[i] = count++;
  const wallGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const walls = new THREE.InstancedMesh(wallGeometry, [WALL, WALL, CAP, WALL, WALL, WALL], count);
  walls.castShadow = true;
  walls.receiveShadow = true;
  walls.frustumCulled = false;
  const heights = new Float32Array(count).fill(WALL_HEIGHT);
  const targets = new Float32Array(count).fill(WALL_HEIGHT);
  const cellOf = new Int32Array(count);
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  const setWall = (instance: number): void => {
    const cell = cellOf[instance]!;
    matrix.makeScale(1, heights[instance]!, 1).setPosition((cell % n) + 0.5, 0, Math.floor(cell / n) + 0.5);
    walls.setMatrixAt(instance, matrix);
  };
  for (let cell = 0; cell < n * n; cell++) {
    const instance = instanceOf[cell]!;
    if (instance < 0) continue;
    cellOf[instance] = cell;
    setWall(instance);
    const owner = level.wallOwner[cell]!;
    walls.setColorAt(instance, tint.setHex(owner >= 0 ? WALL_TINT[level.rooms[owner]!.type] : WALL_NEUTRAL));
  }
  root.add(walls);

  // --- Props, windows and park ---
  const statics = new THREE.Group();
  for (const prop of level.props) {
    const object = buildProp(prop.kind, prop.variant);
    object.position.set(prop.x, 0, prop.z);
    object.rotation.y = (prop.rot * Math.PI) / 2;
    statics.add(object);
  }
  buildGlass(level, statics);
  buildPark(n, statics, root);
  mergeStatics(statics, root, n);
  const rays = buildRays(level);
  root.add(rays);

  const animated: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.userData.sway !== undefined || node.userData.spin !== undefined) animated.push(node);
  });

  // --- Fog of war texture: one texel per cell, eased towards what is visible ---
  const fogData = new Uint8Array(n * n);
  const fogNow = new Float32Array(n * n);
  const fogGoal = new Uint8Array(n * n);
  const fogTexture = new THREE.DataTexture(fogData, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  fogTexture.magFilter = THREE.LinearFilter;
  fogTexture.minFilter = THREE.LinearFilter;
  fogTexture.needsUpdate = true;
  fogUniforms.uFogMap.value = fogTexture;
  fogUniforms.uFogSize.value = n;

  let seenVersion = -1;
  let lowered: number[] = [];
  const moving = new Set<number>();

  const refreshVisibility = (world: WorldState): void => {
    const visible = world.visible;
    // Fog goal: seen floor, plus the walls and windows that border it.
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const cell = z * n + x;
        let seen = visible[cell]!;
        if (!seen && level.cells[cell] !== FLOOR) {
          for (let dz = -1; dz <= 1 && !seen; dz++) {
            for (let dx = -1; dx <= 1 && !seen; dx++) {
              const nx = x + dx;
              const nz = z + dz;
              if (nx >= 0 && nz >= 0 && nx < n && nz < n) seen = visible[nz * n + nx]!;
            }
          }
        }
        fogGoal[cell] = seen;
      }
    }

    // Cutaway: a wall between the camera and visible floor drops to a kerb.
    for (const instance of lowered) {
      targets[instance] = WALL_HEIGHT;
      moving.add(instance);
    }
    lowered = [];
    const reach = Math.ceil(VISION_RADIUS) + CUTAWAY_REACH + 1;
    const px = Math.floor(me(world).x);
    const pz = Math.floor(me(world).z);
    for (let z = Math.max(1, pz - reach); z <= Math.min(n - 1, pz + reach); z++) {
      for (let x = Math.max(1, px - reach); x <= Math.min(n - 1, px + reach); x++) {
        const instance = instanceOf[z * n + x]!;
        if (instance < 0) continue;
        let hides = false;
        for (let k = 1; k <= CUTAWAY_REACH && !hides; k++) {
          const bx = x - k;
          const bz = z - k;
          if (bx < 0 || bz < 0) break;
          hides = visible[bz * n + bx] === 1 || visible[bz * n + bx + 1] === 1 || visible[(bz + 1) * n + bx] === 1;
        }
        if (hides) {
          targets[instance] = WALL_LOW;
          lowered.push(instance);
          moving.add(instance);
        }
      }
    }
  };

  return {
    root,
    update(world, time, dt) {
      // No sun shafts while the lights are out.
      rays.visible = world.sabotage?.kind !== 'overheat';
      if (world.visibleVersion !== seenVersion) {
        seenVersion = world.visibleVersion;
        refreshVisibility(world);
      }

      const fogRate = Math.min(1, dt * 7);
      for (let i = 0; i < fogNow.length; i++) {
        const goal = fogGoal[i]!;
        const now = fogNow[i]!;
        if (now === goal) continue;
        const next = Math.abs(goal - now) < 0.02 ? goal : now + (goal - now) * fogRate;
        fogNow[i] = next;
        fogData[i] = Math.round(next * 255);
      }
      fogTexture.needsUpdate = true;

      let wallsMoved = false;
      const wallRate = Math.min(1, dt * 12);
      for (const instance of moving) {
        const goal = targets[instance]!;
        const diff = goal - heights[instance]!;
        if (Math.abs(diff) < 0.02) {
          heights[instance] = goal;
          moving.delete(instance);
        } else {
          heights[instance]! += diff * wallRate;
        }
        setWall(instance);
        wallsMoved = true;
      }
      if (wallsMoved) walls.instanceMatrix.needsUpdate = true;

      for (const part of animated) {
        if (part.userData.spin !== undefined) {
          part.rotation.z += (part.userData.spin as number) * dt;
        } else {
          const amount = part.userData.sway as number;
          const phase = part.id * 0.7;
          part.rotation.z = Math.sin(time * 1.3 + phase) * amount;
          part.rotation.x = Math.cos(time * 1.1 + phase) * amount * 0.6;
        }
      }
      return wallsMoved;
    },
    dispose() {
      disposeTree(root);
      wallGeometry.dispose();
      walls.dispose();
      fogTexture.dispose();
    },
  };
}
