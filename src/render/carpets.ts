import * as THREE from 'three';
import { CARPET_DIVE, CARPET_LONG, CARPET_SHORT } from '../config';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { canvasTexture, mat, withFog } from './kit';

export interface CarpetsView {
  root: THREE.Group;
  update(world: WorldState, time: number): void;
  dispose(): void;
}

/** Warm rug palettes: field, border, pattern. No colour hints at a rug's network. */
const PALETTES: readonly [string, string, string][] = [
  ['#c8553d', '#f2d0a4', '#3a6ea5'],
  ['#2f7f6f', '#f6e7c1', '#e0a458'],
  ['#7b4b94', '#f3d9b1', '#e86a92'],
  ['#d08c2d', '#fff1d0', '#5b8e7d'],
];

const RUG = new THREE.BoxGeometry(CARPET_LONG, 0.025, CARPET_SHORT);
const HUMP = new THREE.SphereGeometry(0.3, 12, 8);
const ARROW = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.32);
  shape.lineTo(0.2, 0.06);
  shape.lineTo(0.08, 0.06);
  shape.lineTo(0.08, -0.22);
  shape.lineTo(-0.08, -0.22);
  shape.lineTo(-0.08, 0.06);
  shape.lineTo(-0.2, 0.06);
  shape.closePath();
  // Lie flat, pointing towards +z.
  return new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
})();

const textures: THREE.Material[] = [];

/** Woven-looking rug face: border, field, diamonds and a fringe; one material per palette. */
function rugMaterial(variant: number): THREE.Material {
  let found = textures[variant];
  if (!found) {
    const [field, border, pattern] = PALETTES[variant]!;
    const texture = canvasTexture(
      256,
      (ctx) => {
        ctx.fillStyle = border;
        ctx.fillRect(0, 0, 256, 164);
        ctx.fillStyle = field;
        ctx.fillRect(14, 14, 228, 136);
        ctx.fillStyle = pattern;
        for (let i = 0; i < 4; i++) {
          const cx = 50 + i * 52;
          ctx.beginPath();
          ctx.moveTo(cx, 46);
          ctx.lineTo(cx + 18, 82);
          ctx.lineTo(cx, 118);
          ctx.lineTo(cx - 18, 82);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = border;
        ctx.lineWidth = 3;
        ctx.strokeRect(24, 24, 208, 116);
        // Fringe on the short sides.
        ctx.fillStyle = '#fff8e6';
        for (let y = 4; y < 164; y += 8) {
          ctx.fillRect(0, y, 6, 3);
          ctx.fillRect(250, y, 6, 3);
        }
      },
      164,
    );
    found = withFog(new THREE.MeshLambertMaterial({ map: texture }));
    textures[variant] = found;
  }
  return found;
}

const ARROW_MAT = withFog(new THREE.MeshLambertMaterial({ color: 0xff6a3d, emissive: 0xff6a3d, emissiveIntensity: 0.6, side: THREE.DoubleSide }));

/**
 * Rugs on the floor. The edge lifts when the Goose dives in or climbs out; a hump wiggles
 * while someone hides underneath; the hiding local Goose sees arrows to the linked rugs.
 */
export function createCarpets(world: WorldState): CarpetsView {
  const root = new THREE.Group();
  const views = world.carpets.map((c) => {
    // The pivot sits on one long edge so the rug lifts like a lid.
    const pivot = new THREE.Group();
    pivot.position.set(c.x, 0.0125, c.z);
    pivot.rotation.y = c.alongX ? 0 : Math.PI / 2;
    const hinge = new THREE.Group();
    hinge.position.z = -CARPET_SHORT / 2;
    const rug = new THREE.Mesh(RUG, [mat(0xe9d6b8), mat(0xe9d6b8), rugMaterial(c.id % PALETTES.length), mat(0xe9d6b8), mat(0xe9d6b8), mat(0xe9d6b8)]);
    rug.position.z = CARPET_SHORT / 2;
    rug.receiveShadow = true;
    hinge.add(rug);
    const hump = new THREE.Mesh(HUMP, rugMaterial(c.id % PALETTES.length));
    hump.scale.set(1.2, 0.3, 0.9);
    hump.visible = false;
    pivot.add(hinge, hump);

    const arrows = c.links.map((id) => {
      const to = world.carpets[id]!;
      const arrow = new THREE.Mesh(ARROW, ARROW_MAT);
      const angle = Math.atan2(to.x - c.x, to.z - c.z);
      arrow.position.set(c.x + Math.sin(angle) * 1.25, 0.06, c.z + Math.cos(angle) * 1.25);
      arrow.rotation.y = angle;
      arrow.visible = false;
      root.add(arrow);
      return arrow;
    });
    root.add(pivot);
    return { hinge, hump, arrows };
  });

  return {
    root,
    update(w, time) {
      const n = w.level.size;
      const self = w.participants[LOCAL_PLAYER]!;
      w.carpets.forEach((c, i) => {
        const view = views[i];
        if (!view) return;
        const seen = w.sight[LOCAL_PLAYER]!.cells[Math.floor(c.z) * n + Math.floor(c.x)] === 1;
        const lift = seen && c.lift > 0 ? Math.sin((c.lift / CARPET_DIVE) * Math.PI) : 0;
        view.hinge.rotation.x = -lift * 0.9;
        const hidden = w.participants.some((p) => p.under === c.id);
        view.hump.visible = hidden && seen;
        if (view.hump.visible) {
          view.hump.position.y = 0.02 + Math.abs(Math.sin(time * 5.3 + i)) * 0.03;
          view.hump.rotation.y = Math.sin(time * 3.1 + i) * 0.4;
        }
        const mine = self.under === c.id;
        for (const arrow of view.arrows) {
          arrow.visible = mine;
          if (mine) arrow.position.y = 0.06 + Math.abs(Math.sin(time * 4)) * 0.05;
        }
      });
    },
    dispose() {
      root.clear();
    },
  };
}
