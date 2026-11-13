import * as THREE from 'three';
import { BOX_SIZE } from '../config';
import { getLang, t } from '../i18n';
import type { Box } from '../sim/cargo';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { canvasTexture, withFog } from './kit';
import { cardboardBox } from './props';

export interface BoxesView {
  root: THREE.Group;
  update(world: WorldState, time: number): void;
  dispose(): void;
}

/** Boxes outside the local player's sight are not drawn, like the chicks carrying them. */
function isSeen(world: WorldState, x: number, z: number): boolean {
  return world.sight[LOCAL_PLAYER]!.cells[Math.floor(z) * world.level.size + Math.floor(x)] === 1;
}

const STICKER = new THREE.PlaneGeometry(BOX_SIZE * 0.8, BOX_SIZE * 0.36).rotateX(-Math.PI / 2);
const stickers = new Map<string, THREE.Material>();

/** «ГАРЯЧА ВІДПУСТКА» label, one shared material per language. Small on purpose: from afar it is just a box. */
function stickerMaterial(): THREE.Material {
  const lang = getLang();
  let found = stickers.get(lang);
  if (!found) {
    const texture = canvasTexture(
      256,
      (ctx) => {
        ctx.fillStyle = '#ff6a3d';
        ctx.fillRect(0, 0, 256, 116);
        ctx.fillStyle = '#fff6d8';
        ctx.fillRect(6, 6, 244, 104);
        ctx.fillStyle = '#e5433d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 34px system-ui, sans-serif';
        const [a, b] = t('box.vacation').split(' ');
        ctx.fillText(a ?? '', 128, 38, 236);
        ctx.fillText(b ?? '', 128, 80, 236);
      },
      116,
    );
    found = withFog(new THREE.MeshLambertMaterial({ map: texture }));
    stickers.set(lang, found);
  }
  return found;
}

/** Cargo and vacation boxes share one model; only the sticker on the lid differs. */
export function createBoxes(): BoxesView {
  const root = new THREE.Group();
  const meshes = new Map<number, THREE.Group>();

  const make = (box: Box): THREE.Group => {
    const model = cardboardBox(BOX_SIZE);
    if (box.kind === 'vacation') {
      const sticker = new THREE.Mesh(STICKER, stickerMaterial());
      sticker.position.y = BOX_SIZE + 0.006;
      model.add(sticker);
    }
    // Shadows are redrawn only on demand, so moving boxes do not cast them.
    model.traverse((node) => (node.castShadow = false));
    root.add(model);
    return model;
  };

  return {
    root,
    update(world, time) {
      const alive = new Set<number>();
      for (const box of world.boxes) {
        alive.add(box.id);
        let model = meshes.get(box.id);
        if (!model) {
          model = make(box);
          meshes.set(box.id, model);
        }
        const carrier = box.carrier === null ? null : world.participants[box.carrier];
        model.visible = isSeen(world, box.x, box.z);
        if (carrier) {
          const { facing } = carrier;
          // Held in front of the chest; bounces with the step and knocks from side to side.
          const bounce = Math.abs(Math.sin(time * 9)) * 0.08;
          model.position.set(box.x + Math.sin(facing) * 0.5, 0.45 + bounce, box.z + Math.cos(facing) * 0.5);
          model.rotation.set(Math.sin(time * 13) * 0.06, facing, Math.sin(time * 9) * 0.1);
        } else {
          model.position.set(box.x, 0, box.z);
          model.rotation.set(0, box.id * 0.7, 0);
        }
      }
      for (const [id, model] of meshes) {
        if (alive.has(id)) continue;
        root.remove(model);
        meshes.delete(id);
      }
    },
    dispose() {
      // Geometry and materials come from the shared caches.
      root.clear();
      meshes.clear();
    },
  };
}
