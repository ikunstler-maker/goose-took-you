import * as THREE from 'three';
import { ROOM, WALL_HEIGHT, WINDOW_HEIGHT } from '../config';
import type { Level, Wall } from '../sim/level';
import { floorMaterial } from './floors';
import { box, cylinder, disposeTree, mat, sphere } from './kit';
import { buildProp } from './props';

const WALL = mat(0xf7f1e6);
const CAP = mat(0x30333c);
const FRAME = mat(0xfdfbf5);
const GLASS = mat(0xbfe9ff, { opacity: 0.22 });
const GRASS = mat(0x8fd16a);
const HILL = mat(0x7cc45c);
const TRUNK = mat(0x8a5a36);
const CANOPY = [mat(0x4fae52), mat(0x66c25a), mat(0x3c9a4b)];

function addWall(parent: THREE.Group, wall: Wall): void {
  const alongX = wall.w >= wall.d;
  const length = alongX ? wall.w : wall.d;

  if (wall.kind === 'wall') {
    parent.add(box(wall.w, WALL_HEIGHT, wall.d, WALL, wall.x, WALL_HEIGHT / 2, wall.z));
    parent.add(box(wall.w + 0.06, 0.07, wall.d + 0.06, CAP, wall.x, WALL_HEIGHT + 0.035, wall.z, false));
    return;
  }

  const height = wall.tall ? WINDOW_HEIGHT : WALL_HEIGHT;
  const sill = 0.22;
  parent.add(box(wall.w, sill, wall.d, FRAME, wall.x, sill / 2, wall.z));
  parent.add(box(wall.w + 0.04, 0.08, wall.d + 0.04, wall.tall ? FRAME : CAP, wall.x, height - 0.04, wall.z));
  const pane = box(alongX ? wall.w : 0.04, height - sill, alongX ? 0.04 : wall.d, GLASS, wall.x, (height + sill) / 2, wall.z, false);
  pane.receiveShadow = false;
  parent.add(pane);

  // Mullions; on tall windows they cast the striped sun patches onto the floor.
  const count = Math.max(1, Math.round(length / 2));
  for (let i = 0; i <= count; i++) {
    const offset = -length / 2 + (i * length) / count;
    const x = alongX ? wall.x + offset : wall.x;
    const z = alongX ? wall.z : wall.z + offset;
    parent.add(box(0.1, height, 0.1, FRAME, x, height / 2, z));
  }
}

function tree(scale: number, variant: number): THREE.Group {
  const g = new THREE.Group();
  g.add(cylinder(0.25, 0.4, 3, TRUNK, 0, 1.5, 0, 7));
  const crown = new THREE.Group();
  crown.add(sphere(2.1, CANOPY[variant % 3]!, 0, 4.4, 0));
  crown.add(sphere(1.5, CANOPY[(variant + 1) % 3]!, 1.3, 3.6, 0.5));
  crown.add(sphere(1.4, CANOPY[(variant + 2) % 3]!, -1.2, 3.8, -0.4));
  crown.userData.sway = 0.03;
  g.add(crown);
  g.scale.setScalar(scale);
  return g;
}

function park(size: number): THREE.Group {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size * 6, size * 6), GRASS);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(size / 2, -0.06, size / 2);
  ground.receiveShadow = true;
  ground.userData.ownsResources = true;
  g.add(ground);

  // Trees ring the building; the far (north and west) sides are densest.
  let n = 0;
  const place = (x: number, z: number): void => {
    n++;
    const jitter = ((n * 37) % 10) / 10;
    const item = tree(0.8 + jitter * 0.6, n);
    item.position.set(x + jitter * 2, 0, z - jitter * 2);
    g.add(item);
  };
  for (let i = -1; i <= 8; i++) {
    place(i * (size / 7), -5 - (i % 2) * 5);
    place(i * (size / 7) + 3, -17 - (i % 3) * 3);
    place(-5 - (i % 2) * 5, i * (size / 7));
    place(-17 - (i % 3) * 3, i * (size / 7) + 3);
  }
  for (let i = 0; i < 5; i++) {
    place(size + 9 + (i % 2) * 6, i * (size / 4));
    place(i * (size / 4), size + 9 + (i % 2) * 6);
  }
  // Rolling hills on the horizon.
  for (let i = 0; i < 6; i++) {
    const hill = sphere(14, HILL, -30 + i * 22, -9, -34 - (i % 2) * 8, 2);
    hill.castShadow = false;
    g.add(hill);
    const side = sphere(14, HILL, -34 - (i % 2) * 8, -9, -30 + i * 22, 2);
    side.castShadow = false;
    g.add(side);
  }
  return g;
}

export function buildOffice(level: Level): THREE.Group {
  const root = new THREE.Group();
  const flat = new THREE.PlaneGeometry(1, 1);
  flat.rotateX(-Math.PI / 2);

  const slab = new THREE.Mesh(flat, floorMaterial('corridor', level.size));
  slab.scale.set(level.size, 1, level.size);
  slab.position.set(level.size / 2, 0, level.size / 2);
  slab.receiveShadow = true;
  root.add(slab);

  for (const room of level.rooms) {
    const floor = new THREE.Mesh(flat, floorMaterial(room.type, ROOM));
    floor.scale.set(ROOM, 1, ROOM);
    floor.position.set(room.cx, 0.01, room.cz);
    floor.receiveShadow = true;
    root.add(floor);
  }

  for (const wall of level.walls) addWall(root, wall);

  for (const prop of level.props) {
    const object = buildProp(prop.kind);
    object.position.set(prop.x, 0, prop.z);
    object.rotation.y = (prop.rot * Math.PI) / 2;
    root.add(object);
  }

  root.add(park(level.size));
  root.userData.flat = flat;
  return root;
}

export function disposeOffice(root: THREE.Group): void {
  disposeTree(root);
  (root.userData.flat as THREE.BufferGeometry).dispose();
}

/** Parts that move every frame: swaying foliage and spinning fans. */
export function collectAnimated(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.userData.sway !== undefined || node.userData.spin !== undefined) out.push(node);
  });
  return out;
}

export function animate(parts: readonly THREE.Object3D[], time: number, dt: number): void {
  for (const part of parts) {
    if (part.userData.spin !== undefined) {
      part.rotation.z += (part.userData.spin as number) * dt;
    } else {
      const amount = part.userData.sway as number;
      const phase = part.id * 0.7;
      part.rotation.z = Math.sin(time * 1.3 + phase) * amount;
      part.rotation.x = Math.cos(time * 1.1 + phase) * amount * 0.6;
    }
  }
}
