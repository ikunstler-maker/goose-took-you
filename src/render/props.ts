import * as THREE from 'three';
import { t } from '../i18n';
import type { PropKind } from '../sim/prefabs';
import { box, cone, cylinder, mat, screen, sphere } from './kit';

// Every builder returns a group standing on the floor at the origin with its
// front facing +z. Sizes match the footprints declared in `sim/prefabs.ts`.

const WOOD = mat(0xd8a868);
const WOOD_DARK = mat(0x9a6b3c);
const WHITE = mat(0xfbf7ef);
const DARK = mat(0x2f3340);
const METAL = mat(0xb9c0cc);
const CHROME = mat(0xe6ebf2);
const SOIL = mat(0x5b4030);
const POT = mat(0xe9805a);

const LEAF = mat(0x3f9c4d);
const LEAF_DARK = mat(0x2b7d3f);
const LEAF_LIGHT = mat(0x79c861);
const CARDBOARD = mat(0xc99a62);
const TAPE = mat(0xe8d3a8);

const FAN_RING = new THREE.TorusGeometry(0.6, 0.05, 8, 28);
const RING_LIGHT = new THREE.TorusGeometry(0.3, 0.04, 8, 28);

const glow = (color: number): THREE.Material => mat(color, { emissive: color });

function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}

function at<T extends THREE.Object3D>(object: T, x: number, y: number, z: number, rotY = 0): T {
  object.position.set(x, y, z);
  object.rotation.y = rotY;
  return object;
}

function deskBase(w: number, d: number, top: THREE.Material = WOOD): THREE.Group {
  const g = group(box(w, 0.08, d, top, 0, 0.76, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.08, 0.72, 0.08, WHITE, sx * (w / 2 - 0.1), 0.36, sz * (d / 2 - 0.1)));
    }
  }
  return g;
}

function monitor(w: number, h: number, color: number): THREE.Group {
  return group(
    box(w, h, 0.06, DARK, 0, h / 2 + 0.2, 0),
    box(w - 0.08, h - 0.08, 0.02, glow(color), 0, h / 2 + 0.2, 0.035, false),
    box(0.08, 0.2, 0.06, DARK, 0, 0.1, 0),
    box(0.34, 0.03, 0.2, DARK, 0, 0.015, 0),
  );
}

function keyboard(x: number, z: number): THREE.Mesh {
  return box(0.5, 0.03, 0.17, WHITE, x, 0.815, z, false);
}

function leafBlob(r: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = sphere(r, material, x, y, z);
  mesh.rotation.set(x * 2, y * 3, z * 2);
  return mesh;
}

/** Indoor plants stand still (no wind inside), so they merge into static chunk geometry. */
function sway<T extends THREE.Object3D>(object: T, _amount = 0): T {
  return object;
}

function monstera(): THREE.Group {
  const leaves = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + (i % 2) * 0.3;
    const reach = 0.28 + (i % 3) * 0.08;
    const height = 0.75 + (i % 4) * 0.16;
    const leaf = sphere(0.24, i % 2 ? LEAF : LEAF_DARK, 0, 0, 0);
    leaf.scale.set(1, 0.14, 0.8);
    leaf.position.set(Math.cos(angle) * reach, height, Math.sin(angle) * reach);
    leaf.rotation.set(0.5 * Math.sin(angle), -angle, 0.5);
    leaves.add(leaf);
    const stem = cylinder(0.015, 0.02, height - 0.4, LEAF_DARK, Math.cos(angle) * reach * 0.5, (height + 0.4) / 2, Math.sin(angle) * reach * 0.5, 5);
    stem.rotation.z = -Math.cos(angle) * 0.35;
    stem.rotation.x = Math.sin(angle) * 0.35;
    leaves.add(stem);
  }
  return group(cylinder(0.3, 0.22, 0.42, POT, 0, 0.21, 0), cylinder(0.27, 0.27, 0.02, SOIL, 0, 0.42, 0), sway(leaves));
}

function ficus(): THREE.Group {
  const crown = group(
    leafBlob(0.42, LEAF, 0, 1.75, 0),
    leafBlob(0.32, LEAF_LIGHT, 0.26, 1.5, 0.12),
    leafBlob(0.3, LEAF_DARK, -0.25, 1.48, -0.1),
    leafBlob(0.26, LEAF_LIGHT, 0.02, 2.08, 0.06),
  );
  return group(
    box(0.62, 0.46, 0.62, WOOD_DARK, 0, 0.23, 0),
    box(0.54, 0.02, 0.54, SOIL, 0, 0.47, 0, false),
    cylinder(0.04, 0.06, 1.0, WOOD_DARK, 0, 0.96, 0, 6),
    sway(crown, 0.035),
  );
}

function bonsai(): THREE.Group {
  const trunk = cylinder(0.04, 0.07, 0.5, WOOD_DARK, 0.05, 0.42, 0, 6);
  trunk.rotation.z = -0.35;
  const pads = group(leafBlob(0.26, LEAF_DARK, 0.18, 0.74, 0), leafBlob(0.2, LEAF, -0.14, 0.6, 0.08), leafBlob(0.16, LEAF_LIGHT, 0.3, 0.52, -0.1));
  pads.children.forEach((pad) => pad.scale.set(1, 0.55, 1));
  return group(box(0.5, 0.16, 0.36, mat(0x4f6f8f), 0, 0.1, 0), trunk, sway(pads, 0.03));
}

function planter(): THREE.Group {
  const g = group(box(3.3, 0.5, 0.8, WOOD_DARK, 0, 0.25, 0), box(3.1, 0.02, 0.6, SOIL, 0, 0.51, 0, false));
  const bushes = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const x = -1.35 + i * 0.54;
    bushes.add(leafBlob(0.27 + (i % 3) * 0.05, [LEAF, LEAF_LIGHT, LEAF_DARK][i % 3]!, x, 0.72 + (i % 2) * 0.14, 0));
  }
  g.add(sway(bushes, 0.03));
  // Ivy spilling over the front edge.
  for (let i = 0; i < 9; i++) {
    const len = 0.14 + ((i * 7) % 5) * 0.06;
    g.add(box(0.1, len, 0.03, i % 2 ? LEAF : LEAF_LIGHT, -1.45 + i * 0.36, 0.5 - len / 2, 0.42, false));
  }
  return g;
}

/** Shared cargo box model; the vacation box (stage 3) differs only by its sticker. */
export function cardboardBox(size = 0.8): THREE.Group {
  return group(box(size, size, size, CARDBOARD, 0, size / 2, 0), box(size + 0.01, size + 0.01, 0.1, TAPE, 0, size / 2, 0, false));
}

function shelf(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.65, 0, 1.65]) g.add(box(0.08, 1.7, 0.9, METAL, x, 0.85, 0));
  [0.12, 0.72, 1.32].forEach((y, level) => {
    g.add(box(3.4, 0.05, 0.9, METAL, 0, y, 0));
    for (let i = 0; i < 4; i++) {
      if ((i + level) % 4 === 3) continue;
      const size = 0.42 + ((i + level) % 3) * 0.05;
      const crate = at(cardboardBox(size), -1.2 + i * 0.8, y + 0.03, 0.05 * ((i % 2) * 2 - 1), (i - level) * 0.12);
      g.add(crate);
    }
  });
  return g;
}

function rack(): THREE.Group {
  const g = group(box(0.9, 1.7, 0.9, DARK, 0, 0.85, 0));
  const colors = [0x4dffb0, 0x52d6ff, 0xff5fd2, 0x4dffb0, 0xffd84d];
  for (let i = 0; i < 5; i++) {
    g.add(box(0.74, 0.2, 0.02, mat(0x1b1e27), 0, 0.3 + i * 0.28, 0.455, false));
    g.add(box(0.5, 0.035, 0.02, glow(colors[i]!), -0.08, 0.3 + i * 0.28, 0.47, false));
    g.add(box(0.05, 0.05, 0.02, glow(0xff5a4d), 0.3, 0.3 + i * 0.28, 0.47, false));
  }
  return g;
}

function fan(): THREE.Group {
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = box(0.5, 0.16, 0.03, WHITE, 0.27, 0, 0, false);
    const arm = group(blade);
    arm.rotation.z = (i * Math.PI) / 2;
    blade.rotation.x = 0.4;
    blades.add(arm);
  }
  blades.position.set(0, 1.05, 0.12);
  blades.userData.spin = 9;
  const ring = new THREE.Mesh(FAN_RING, METAL);
  ring.position.set(0, 1.05, 0.12);
  ring.castShadow = true;
  return group(cylinder(0.5, 0.56, 0.08, DARK, 0, 0.04, 0), cylinder(0.05, 0.05, 1.0, METAL, 0, 0.5, 0, 8), box(0.24, 0.24, 0.3, DARK, 0, 1.05, -0.06), ring, blades);
}

const SOFA_COLORS = [0xf7b7a3, 0x9fc5e8, 0xb8dfa8, 0xd9b8f0];
const ACCENTS = [0xff8f6b, 0x6bbcff, 0x7ed99a, 0xffcf5c];

function sofa(variant: number): THREE.Group {
  const fabric = mat(SOFA_COLORS[variant % 4]!);
  const cushion = mat(0xfde2cf);
  return group(
    box(3.2, 0.4, 1.1, fabric, 0, 0.3, 0),
    box(3.2, 0.6, 0.28, fabric, 0, 0.7, -0.41),
    box(0.28, 0.5, 1.1, fabric, -1.46, 0.6, 0),
    box(0.28, 0.5, 1.1, fabric, 1.46, 0.6, 0),
    box(1.2, 0.14, 0.7, cushion, -0.66, 0.57, 0.12),
    box(1.2, 0.14, 0.7, cushion, 0.66, 0.57, 0.12),
  );
}

function drawBrand(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#ffd66b');
  sky.addColorStop(1, '#ff9d5c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff6d6';
  ctx.beginPath();
  ctx.ellipse(w * 0.2, h * 0.5, h * 0.2, h * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3312';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${h * 0.24}px system-ui, sans-serif`;
  // The last argument caps the text width so the name always fits the screen.
  ctx.fillText(t('decor.brand'), w * 0.36, h * 0.42, w * 0.58);
  ctx.font = `600 ${h * 0.12}px system-ui, sans-serif`;
  ctx.fillText(t('decor.brandSub'), w * 0.36, h * 0.66, w * 0.58);
}

function drawDashboard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#17202e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7dffb2';
  ctx.font = `800 ${h * 0.16}px system-ui, sans-serif`;
  ctx.fillText('ROI +400%', w * 0.04, h * 0.2);
  ctx.strokeStyle = '#7dffb2';
  ctx.lineWidth = 5;
  ctx.beginPath();
  const points = [0.8, 0.7, 0.74, 0.55, 0.6, 0.42, 0.46, 0.3, 0.2];
  points.forEach((y, i) => ctx[i ? 'lineTo' : 'moveTo'](w * (0.05 + i * 0.065), h * (0.25 + y * 0.65)));
  ctx.stroke();
  const bars = ['#ffcf5c', '#ff8fb1', '#74d3ff', '#7dffb2', '#ffcf5c', '#ff8fb1'];
  bars.forEach((color, i) => {
    const height = h * (0.2 + ((i * 37) % 50) / 100);
    ctx.fillStyle = color;
    ctx.fillRect(w * (0.64 + i * 0.055), h * 0.92 - height, w * 0.035, height);
  });
}

function drawKanban(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3a3f4d';
  ctx.font = `800 ${h * 0.11}px system-ui, sans-serif`;
  ctx.fillText(t('decor.kanban'), w * 0.04, h * 0.14);
  const cards = ['#ffd66b', '#ff9fb5', '#9fe3c4', '#a9c8ff'];
  for (let col = 0; col < 3; col++) {
    ctx.fillStyle = '#efe6d3';
    ctx.fillRect(w * (0.04 + col * 0.32), h * 0.2, w * 0.28, h * 0.74);
    for (let row = 0; row < 3 - col; row++) {
      ctx.fillStyle = cards[(col * 2 + row) % cards.length]!;
      ctx.fillRect(w * (0.06 + col * 0.32), h * (0.25 + row * 0.22), w * 0.24, h * 0.17);
    }
  }
}

function drawSticker(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#fff07a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3a3320';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${h * 0.2}px system-ui, sans-serif`;
  const words = t('decor.sticker').split(' ');
  const mid = Math.ceil(words.length / 2);
  ctx.fillText(words.slice(0, mid).join(' '), w / 2, h * 0.36);
  ctx.fillText(words.slice(mid).join(' '), w / 2, h * 0.66);
}

function drawBrief(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#fbf7ef';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3a2a14';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${h * 0.13}px system-ui, sans-serif`;
  ctx.fillText(t('decor.brief'), w / 2, h * 0.14, w * 0.92);
  // Seven "perpendicular" red lines, as promised to the client.
  ctx.strokeStyle = '#e8364a';
  ctx.lineWidth = h * 0.03;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI) / 7;
    ctx.beginPath();
    ctx.moveTo(w / 2 - Math.cos(a) * w * 0.3, h * 0.6 - Math.sin(a) * h * 0.3);
    ctx.lineTo(w / 2 + Math.cos(a) * w * 0.3, h * 0.6 + Math.sin(a) * h * 0.3);
    ctx.stroke();
  }
}

function drawBigWin(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#3b1240';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = h * 0.08;
  ctx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  ctx.fillStyle = '#ffe680';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${h * 0.5}px system-ui, sans-serif`;
  ctx.fillText(t('decor.bigWin'), w / 2, h / 2, w * 0.9);
}

function drawCameras(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#1d2430';
  ctx.fillRect(0, 0, w, h);
  const tints = ['#5d8a6b', '#6b7fa6', '#a68a5d', '#8a5d7f'];
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * (w / 2);
    const y = Math.floor(i / 2) * (h / 2);
    ctx.fillStyle = tints[i]!;
    ctx.fillRect(x + 6, y + 6, w / 2 - 12, h / 2 - 12);
    ctx.fillStyle = '#ff4b3e';
    ctx.beginPath();
    ctx.arc(x + 20, y + 20, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawUrgent(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#e5433d';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${h * 0.5}px system-ui, sans-serif`;
  ctx.fillText(t('decor.urgent'), w / 2, h / 2, w * 0.92);
}

function board(w: number, h: number, centreY: number, panel: THREE.Mesh): THREE.Group {
  return group(
    box(0.08, centreY, 0.08, METAL, -w / 2 + 0.2, centreY / 2, 0),
    box(0.08, centreY, 0.08, METAL, w / 2 - 0.2, centreY / 2, 0),
    box(w, h, 0.1, DARK, 0, centreY, 0),
    at(panel, 0, centreY, 0.06),
  );
}

function bookshelf(variant: number): THREE.Group {
  const g = group(box(2, 1.9, 0.5, WOOD_DARK, 0, 0.95, -0.03));
  const books = [0xff8f6b, 0x6bbcff, 0xffcf5c, 0x7ed99a, 0xd9b8f0, 0xf5efe6];
  for (let row = 0; row < 4; row++) {
    g.add(box(1.86, 0.04, 0.5, WOOD, 0, 0.2 + row * 0.44, 0.02));
    let x = -0.86;
    for (let i = 0; x < 0.8; i++) {
      const w = 0.08 + ((i * 7 + row * 3 + variant) % 4) * 0.03;
      const h = 0.24 + ((i * 5 + row + variant) % 3) * 0.05;
      if ((i + row + variant) % 6 !== 5) g.add(box(w, h, 0.3, mat(books[(i + row * 2 + variant) % books.length]!), x + w / 2, 0.22 + row * 0.44 + h / 2, 0.1, false));
      x += w + 0.02;
    }
  }
  return g;
}

function lockers(variant: number): THREE.Group {
  const g = group(box(2, 1.8, 0.56, METAL, 0, 0.9, 0));
  const doors = [0xa9d6f5, 0xf7c6a3, 0xb8e0b0, 0xf2b8d0];
  for (let i = 0; i < 4; i++) {
    g.add(box(0.44, 1.66, 0.03, mat(doors[(i + variant) % 4]!), -0.75 + i * 0.5, 0.9, 0.285, false));
    g.add(box(0.04, 0.12, 0.03, DARK, -0.6 + i * 0.5, 1.0, 0.31, false));
    g.add(box(0.26, 0.02, 0.03, DARK, -0.75 + i * 0.5, 1.5, 0.305, false));
    g.add(box(0.26, 0.02, 0.03, DARK, -0.75 + i * 0.5, 1.44, 0.305, false));
  }
  return g;
}

function palm(): THREE.Group {
  const trunk = cylinder(0.05, 0.08, 1.3, WOOD_DARK, 0.06, 1.0, 0, 6);
  trunk.rotation.z = -0.1;
  const g = group(cylinder(0.3, 0.24, 0.4, POT, 0, 0.2, 0), cylinder(0.27, 0.27, 0.02, SOIL, 0, 0.4, 0), trunk);
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const frond = sphere(0.36, i % 2 ? LEAF : LEAF_LIGHT, 0, 0, 0);
    frond.scale.set(1, 0.08, 0.32);
    const arm = group(frond);
    frond.position.set(0.32, 0, 0);
    frond.rotation.z = -0.5;
    arm.position.set(0.12, 1.66, 0);
    arm.rotation.y = angle;
    g.add(arm);
  }
  return g;
}

function cactus(variant: number): THREE.Group {
  const green = mat(0x5fae6a);
  const g = group(cylinder(0.24, 0.18, 0.3, mat(ACCENTS[variant % 4]!), 0, 0.15, 0), cylinder(0.13, 0.14, 0.8, green, 0, 0.7, 0, 10), sphere(0.13, green, 0, 1.1, 0));
  g.add(cylinder(0.06, 0.06, 0.3, green, 0.2, 0.75, 0, 8), sphere(0.06, green, 0.2, 0.9, 0), box(0.14, 0.06, 0.06, green, 0.13, 0.62, 0));
  g.add(cylinder(0.05, 0.05, 0.22, green, -0.19, 0.6, 0, 8), sphere(0.05, green, -0.19, 0.71, 0), box(0.12, 0.05, 0.05, green, -0.12, 0.5, 0));
  g.add(sphere(0.05, glow(0xff7fb0), 0.03, 1.24, 0.02, 0));
  return g;
}

function arcade(variant: number): THREE.Group {
  const body = mat([0x7a5cff, 0xff5c8a, 0x2fb8a8, 0xff9a3d][variant % 4]!);
  const scr = box(0.6, 0.46, 0.03, glow(0x7df9ff), 0, 1.32, 0.3, false);
  scr.rotation.x = -0.25;
  return group(
    box(0.8, 1.9, 0.8, body, 0, 0.95, -0.03),
    box(0.7, 0.56, 0.06, DARK, 0, 1.32, 0.34),
    scr,
    box(0.76, 0.06, 0.36, DARK, 0, 0.98, 0.42),
    cylinder(0.02, 0.02, 0.12, METAL, -0.15, 1.07, 0.44, 6),
    sphere(0.045, glow(0xff3b30), -0.15, 1.14, 0.44, 1),
    sphere(0.035, glow(0xffe14d), 0.1, 1.03, 0.46, 0),
    sphere(0.035, glow(0x4dff88), 0.22, 1.03, 0.42, 0),
    box(0.72, 0.22, 0.03, glow(0xffe14d), 0, 1.76, 0.385, false),
  );
}

function whiteboard(variant: number): THREE.Group {
  const g = board(2, 1.1, 1.35, box(1.86, 0.96, 0.02, mat(0xffffff, { emissive: 0x8a8a8a }), 0, 0, 0, false));
  const ink = [0xff5c5c, 0x3d8bff, 0x2fb86a, 0xff9a3d];
  for (let i = 0; i < 5; i++) {
    g.add(box(0.3 + ((i * 3 + variant) % 4) * 0.25, 0.04, 0.02, mat(ink[(i + variant) % 4]!), -0.35 + ((i + variant) % 3) * 0.18, 1.7 - i * 0.16, 0.08, false));
  }
  g.add(box(0.36, 0.3, 0.02, mat(0xfff07a), 0.62, 1.2, 0.08, false));
  return g;
}

const BUILDERS: Record<PropKind, (variant: number) => THREE.Group> = {
  bookshelf,
  lockers,
  palm,
  cactus,
  arcade,
  whiteboard,

  cooler: () =>
    group(
      box(0.44, 0.95, 0.44, WHITE, 0, 0.475, 0),
      cylinder(0.17, 0.17, 0.42, mat(0x9fd8ff, { emissive: 0x2a6f9c }), 0, 1.18, 0, 14),
      cylinder(0.08, 0.17, 0.08, mat(0x9fd8ff, { emissive: 0x2a6f9c }), 0, 0.99, 0, 14),
      box(0.06, 0.06, 0.04, glow(0x4d9bff), -0.08, 0.7, 0.23, false),
      box(0.06, 0.06, 0.04, glow(0xff5a4d), 0.08, 0.7, 0.23, false),
    ),

  printer: () =>
    group(
      box(0.9, 0.62, 0.7, WHITE, 0, 0.31, 0),
      box(0.8, 0.26, 0.6, mat(0xd7dce4), 0, 0.75, 0),
      box(0.5, 0.02, 0.36, mat(0xffffff, { emissive: 0x999999 }), 0, 0.9, 0.2, false),
      box(0.16, 0.05, 0.02, glow(0x4dff88), 0.26, 0.78, 0.31, false),
      box(0.8, 0.02, 0.02, DARK, 0, 0.42, 0.355, false),
    ),

  beanbag: (variant) => {
    const bag = sphere(0.44, mat(ACCENTS[variant % 4]!), 0, 0.3, 0, 2);
    bag.scale.set(1, 0.62, 1);
    const dent = sphere(0.3, mat(ACCENTS[variant % 4]!), 0, 0.52, -0.12, 2);
    dent.scale.set(1, 0.6, 0.8);
    return group(bag, dent);
  },

  rug: (variant) => {
    const base = cylinder(1.9, 1.9, 0.02, mat([0xf2c9a0, 0xb9d8f2, 0xcfe8b8, 0xf0c4dd][variant % 4]!), 0, 0.02, 0, 36);
    base.scale.z = 0.72;
    base.castShadow = false;
    const inner = cylinder(1.4, 1.4, 0.02, mat(0xfff6e6), 0, 0.03, 0, 36);
    inner.scale.z = 0.72;
    inner.castShadow = false;
    return group(base, inner);
  },

  lamp: (variant) =>
    group(
      cylinder(0.2, 0.22, 0.05, DARK, 0, 0.025, 0, 14),
      cylinder(0.02, 0.02, 1.5, METAL, 0, 0.8, 0, 6),
      cylinder(0.14, 0.24, 0.32, glow([0xfff0b8, 0xffd9a8, 0xe8f6ff, 0xffe9c7][variant % 4]!), 0, 1.66, 0, 14),
    ),

  cabinet: (variant) => {
    const g = group(box(0.9, 1.15, 0.56, METAL, 0, 0.575, 0));
    for (let i = 0; i < 3; i++) {
      g.add(box(0.8, 0.32, 0.03, mat(0xdfe5ee), 0, 0.2 + i * 0.37, 0.285, false), box(0.24, 0.04, 0.03, DARK, 0, 0.26 + i * 0.37, 0.305, false));
    }
    g.add(box(0.4, 0.06, 0.3, mat(ACCENTS[variant % 4]!), -0.15, 1.18, 0), box(0.36, 0.05, 0.28, WHITE, -0.13, 1.235, 0.02));
    return g;
  },

  crates: () => group(at(cardboardBox(0.8), -0.45, 0, 0, 0.1), at(cardboardBox(0.78), 0.45, 0, 0.05, -0.15), at(cardboardBox(0.6), -0.1, 0.8, 0, 0.4)),

  briefTablet: () => {
    const panel = screen(0.9, 0.6, drawBrief, 0.35);
    const tilt = group(box(0.98, 0.68, 0.05, DARK, 0, 0, -0.03), at(panel, 0, 0, 0.001));
    tilt.position.set(0, 1.12, 0);
    tilt.rotation.x = -0.75;
    return group(
      box(0.7, 0.06, 0.45, DARK, 0, 0.03, 0),
      cylinder(0.05, 0.05, 1.05, METAL, 0, 0.55, 0, 8),
      tilt,
    );
  },

  ringLight: () => {
    const ring = new THREE.Mesh(RING_LIGHT, glow(0xfff4d6));
    ring.position.set(0, 1.55, 0);
    ring.castShadow = true;
    const g = group(cylinder(0.02, 0.02, 1.3, DARK, 0, 0.65, 0, 6), ring);
    for (let i = 0; i < 3; i++) {
      const leg = cylinder(0.015, 0.015, 0.5, DARK, 0, 0.2, 0, 5);
      leg.rotation.z = 0.7;
      const pivot = group(leg);
      leg.position.set(0.15, 0.18, 0);
      pivot.rotation.y = (i * Math.PI * 2) / 3;
      g.add(pivot);
    }
    return g;
  },

  desk: () => group(deskBase(2, 1), at(monitor(0.8, 0.5, 0x8fd3ff), 0, 0.8, -0.25), keyboard(0, 0.2)),

  deskBuyer: () => {
    const g = group(deskBase(2.2, 1), at(monitor(0.7, 0.46, 0x7dffb2), -0.45, 0.8, -0.25, 0.2), at(monitor(0.7, 0.46, 0x8ea8ff), 0.45, 0.8, -0.25, -0.2), keyboard(0, 0.2));
    [0xff5a7a, 0x53d8ff, 0xb6ff5a].forEach((color, i) => g.add(cylinder(0.05, 0.05, 0.18, mat(color), 0.75 + (i % 2) * 0.13, 0.89, 0.15 + i * 0.1, 8)));
    return g;
  },

  deskCopy: () =>
    group(
      deskBase(2.4, 1, WHITE),
      at(monitor(0.8, 0.5, 0xff8fd8), -0.5, 0.8, -0.25, 0.15),
      at(monitor(0.8, 0.5, 0x6ff3ff), 0.5, 0.8, -0.25, -0.15),
      box(1.9, 0.02, 0.03, glow(0xff5fd2), 0, 0.81, 0.18, false),
      box(1.5, 0.02, 0.03, glow(0x4dffe1), 0.1, 0.81, 0.3, false),
      box(0.03, 0.02, 0.5, glow(0xffe14d), -0.9, 0.81, 0.15, false),
    ),

  ultrawide: () => {
    const g = group(deskBase(2.6, 1.1, WOOD_DARK));
    // Three angled panels read as one curved ultrawide screen.
    [-1, 0, 1].forEach((i) => g.add(at(monitor(0.72, 0.5, 0xb49cff), i * 0.68, 0.8, -0.3 + Math.abs(i) * 0.1, -i * 0.3)));
    g.add(box(0.6, 0.02, 0.4, DARK, -0.5, 0.81, 0.25, false), box(0.5, 0.01, 0.3, glow(0x556080), -0.5, 0.825, 0.25, false), keyboard(0.45, 0.25));
    return g;
  },

  dualStation: () => {
    const g = group(deskBase(4.6, 1.4, WHITE), at(monitor(0.9, 0.55, 0xff8f6b), -1.5, 0.8, -0.35), at(monitor(0.9, 0.55, 0x6bd6ff), 1.5, 0.8, -0.35), keyboard(-1.5, 0.25), keyboard(1.5, 0.25));
    const dome = sphere(0.32, glow(0x33e06a), 0, 0.88, 0.05, 2);
    dome.scale.y = 0.55;
    g.add(cylinder(0.42, 0.46, 0.1, METAL, 0, 0.85, 0.05), dome);
    return g;
  },

  rack,
  fan,
  shelf,
  box: () => at(cardboardBox(0.82), 0, 0, 0, 0.2),

  meetingTable: () => {
    const dome = sphere(0.26, glow(0xff3b30), 0, 0.9, 0, 2);
    dome.scale.y = 0.6;
    const sign = screen(1.3, 0.26, drawUrgent, 0.35);
    return group(
      cylinder(1.65, 1.65, 0.1, WOOD, 0, 0.77, 0, 28),
      cylinder(0.3, 0.5, 0.72, WOOD_DARK, 0, 0.36, 0, 12),
      cylinder(0.36, 0.4, 0.08, METAL, 0, 0.86, 0),
      dome,
      at(box(1.36, 0.32, 0.05, DARK, 0, 0, 0), 0, 0.98, 0.72),
      at(sign, 0, 0.98, 0.75),
    );
  },

  kanban: () => board(3.2, 1.5, 1.45, screen(3.05, 1.35, drawKanban, 0.2)),
  tv: () => board(5.4, 2.6, 2.1, screen(5.2, 2.4, drawBrand, 0.7)),
  dashboard: () => board(4, 1.6, 1.6, screen(3.85, 1.45, drawDashboard, 0.75)),
  stickerBoard: () => board(1.8, 0.9, 1.25, screen(1.7, 0.8, drawSticker, 0.25)),

  mirror: () => group(box(1.6, 2.0, 0.12, WOOD_DARK, 0, 1.0, 0), box(1.4, 1.8, 0.02, mat(0xcfefff, { emissive: 0x6f9fb5 }), 0, 1.0, 0.07, false)),

  reception: () => {
    const egg = sphere(0.2, glow(0xffc93d), 0.95, 1.2, 0, 2);
    egg.scale.y = 1.3;
    return group(box(3, 0.95, 1, WHITE, 0, 0.475, 0), box(3.1, 0.07, 1.1, WOOD, 0, 0.985, 0), at(monitor(0.6, 0.4, 0x8fd3ff), -0.7, 1.02, 0.05), egg);
  },

  bonsaiDeck: () => {
    const deck = cylinder(2.5, 2.5, 0.04, mat(0x8fcf7a), 0, 0.02, 0, 40);
    deck.castShadow = false;
    const ring = cylinder(1.25, 1.3, 0.14, WOOD_DARK, 0, 0.07, 0, 28);
    return group(deck, ring);
  },

  bonsai,

  espressoBar: () =>
    group(
      box(3.4, 0.9, 1, WOOD_DARK, 0, 0.45, 0),
      box(3.5, 0.06, 1.1, WHITE, 0, 0.93, 0),
      box(0.9, 0.6, 0.6, CHROME, -0.9, 1.26, -0.1),
      cylinder(0.06, 0.06, 0.2, DARK, -1.1, 1.06, 0.25, 8),
      cylinder(0.06, 0.06, 0.2, DARK, -0.7, 1.06, 0.25, 8),
      cylinder(0.16, 0.12, 0.3, mat(0x6b4a2f), -0.9, 1.7, -0.1, 10),
      cylinder(0.07, 0.05, 0.1, WHITE, 0.3, 1.01, 0.1, 10),
      cylinder(0.07, 0.05, 0.1, WHITE, 0.55, 1.01, 0.2, 10),
      cylinder(0.07, 0.05, 0.1, mat(0xffd66b), 0.85, 1.01, 0.05, 10),
    ),

  cornMachine: () => {
    const g = group(box(1.1, 1.7, 0.95, mat(0xffc93d), 0, 0.85, 0), box(0.8, 0.8, 0.02, mat(0xfff3c4, { emissive: 0x9c7a1e }), 0, 1.15, 0.485, false), box(0.5, 0.18, 0.04, DARK, 0, 0.35, 0.49, false));
    for (let i = 0; i < 14; i++) g.add(sphere(0.05, glow(0xffb400), -0.3 + (i % 5) * 0.15, 0.85 + Math.floor(i / 5) * 0.14, 0.5, 0));
    return g;
  },

  sofa,
  coffeeTable: () => group(cylinder(0.6, 0.6, 0.06, WOOD, 0, 0.42, 0, 20), cylinder(0.08, 0.2, 0.4, WOOD_DARK, 0, 0.2, 0, 8), cylinder(0.07, 0.05, 0.1, WHITE, 0.2, 0.5, 0.1, 10)),
  bench: () => group(box(2.6, 0.08, 0.8, WOOD, 0, 0.46, 0), box(0.12, 0.44, 0.7, WOOD_DARK, -1.1, 0.22, 0), box(0.12, 0.44, 0.7, WOOD_DARK, 1.1, 0.22, 0)),
  monstera,
  ficus,
  planter,
  stool: () => group(cylinder(0.24, 0.24, 0.08, mat(0xff9f7a), 0, 0.5, 0, 14), cylinder(0.04, 0.04, 0.46, METAL, 0, 0.23, 0, 6), cylinder(0.2, 0.2, 0.03, METAL, 0, 0.015, 0, 12)),

  thermometer: () =>
    group(
      box(0.5, 1.9, 0.1, WHITE, 0, 1.15, 0),
      box(0.1, 1.3, 0.04, mat(0xdfe5ee), 0, 1.3, 0.06, false),
      box(0.1, 1.0, 0.05, glow(0xff4b3e), 0, 1.15, 0.065, false),
      sphere(0.14, glow(0xff4b3e), 0, 0.5, 0.06, 1),
      box(0.08, 0.3, 0.08, METAL, 0, 0.1, 0),
      cone(0.2, 0.1, METAL, 0, 0.05, 0),
    ),

  // Satirical slot machine with a golden egg on top; no real-money mechanics.
  slotMachine: () => {
    const egg = sphere(0.18, glow(0xffc93d), 0, 2.05, 0, 2);
    egg.scale.y = 1.3;
    const g = group(
      box(1, 1.7, 0.8, mat(0xc0304a), 0, 0.85, 0),
      box(0.8, 0.4, 0.04, DARK, 0, 1.3, 0.41, false),
      box(1.05, 0.2, 0.85, mat(0xffd34d), 0, 1.78, 0),
      cylinder(0.03, 0.03, 0.5, METAL, 0.56, 1.25, 0.1, 6),
      sphere(0.07, glow(0xff3b30), 0.56, 1.52, 0.1, 1),
      box(0.8, 0.06, 0.3, DARK, 0, 0.95, 0.5),
      egg,
    );
    for (let i = 0; i < 3; i++) g.add(box(0.22, 0.32, 0.02, mat(0xffffff, { emissive: 0xbbbbbb }), -0.26 + i * 0.26, 1.3, 0.435, false));
    return g;
  },

  bigWinSign: () => {
    const panel = screen(3.6, 0.9, drawBigWin, 0.9);
    panel.position.set(0, 2, 0.08);
    return group(box(3.8, 1.05, 0.12, DARK, 0, 2, 0), panel);
  },

  cameraDesk: () => {
    const wall = screen(3.2, 1.2, drawCameras, 0.6);
    wall.position.set(0, 1.75, -0.39);
    return group(
      box(3.6, 0.8, 1.2, mat(0x5b6577), 0, 0.4, 0),
      box(3.7, 0.06, 1.25, DARK, 0, 0.83, 0),
      box(3.4, 1.4, 0.1, DARK, 0, 1.75, -0.46),
      wall,
      box(0.6, 0.03, 0.25, WHITE, 0, 0.88, 0.3, false),
      sphere(0.04, glow(0x4dff88), -0.8, 0.9, 0.35, 0),
      sphere(0.04, glow(0xff3b30), -0.65, 0.9, 0.35, 0),
    );
  },

  badgeScanner: () =>
    group(
      cylinder(0.5, 0.5, 0.08, mat(0x8a94a6), 0, 0.04, 0, 20),
      box(0.18, 1.1, 0.18, METAL, 0, 0.6, -0.3),
      box(0.4, 0.3, 0.12, DARK, 0, 1.2, -0.25),
      box(0.3, 0.06, 0.02, glow(0x4dff88), 0, 1.25, -0.185, false),
    ),
};

export function buildProp(kind: PropKind, variant: number): THREE.Group {
  return BUILDERS[kind](variant);
}
