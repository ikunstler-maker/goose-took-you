import * as THREE from 'three';
import { LOCAL_PLAYER, type WorldState } from '../sim/world';
import { box, mat } from './kit';

export interface BadgesView {
  root: THREE.Group;
  update(world: WorldState, time: number, dt: number): void;
  /** Lifts the barrier arm of the turnstile that is prop `prop`: someone's card went through. */
  swing(prop: number): void;
  dispose(): void;
}

/** Seconds the arm takes to go up, stays up, and takes to come down. */
const ARM_UP = 0.22;
const ARM_HOLD = 0.7;
const ARM_DOWN = 0.4;
const ARM_ANGLE = 1.25;

/** How far the arm is lifted (0..1) `t` seconds after a swipe. */
function armLift(t: number): number {
  if (t < ARM_UP) return t / ARM_UP;
  if (t < ARM_UP + ARM_HOLD) return 1;
  const down = (t - ARM_UP - ARM_HOLD) / ARM_DOWN;
  return down >= 1 ? 0 : 1 - down * down;
}

/**
 * The moving bits of the «Сканер бейджа» task: the barrier arms of the
 * turnstiles (static furniture is merged and cannot move) and the key card a
 * chick carries in its wing from the rack to the reader.
 */
export function createBadges(world: WorldState): BadgesView {
  const root = new THREE.Group();
  const red = mat(0xe5433d);
  const white = mat(0xfbf7ef);
  const arms = new Map<number, { hinge: THREE.Group; t: number }>();
  world.level.props.forEach((prop, index) => {
    if (prop.kind !== 'badgeScanner') return;
    const post = new THREE.Group();
    post.position.set(prop.x, 0, prop.z);
    post.rotation.y = (prop.rot * Math.PI) / 2;
    // The hinge sits on the face of the post; the two bars reach out across the passage.
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.7, 0.25);
    hinge.add(box(0.06, 0.06, 0.9, red, 0, 0.1, 0.45, false), box(0.06, 0.06, 0.9, white, 0, -0.1, 0.45, false));
    post.add(hinge);
    root.add(post);
    arms.set(index, { hinge, t: Infinity });
  });

  const cardMaterial = mat(0xfbf7ef, { emissive: 0x4a4636 });
  const stripe = mat(0x4dbf7a);
  const cards = world.participants.map(() => {
    const card = new THREE.Group();
    card.add(box(0.26, 0.36, 0.02, cardMaterial, 0, 0, 0, false), box(0.26, 0.07, 0.025, stripe, 0, 0.1, 0, false));
    card.visible = false;
    root.add(card);
    return card;
  });

  return {
    root,
    update(w, time, dt) {
      for (const arm of arms.values()) {
        if (arm.t === Infinity) continue;
        arm.t += dt;
        const lift = armLift(arm.t);
        arm.hinge.rotation.x = -lift * ARM_ANGLE;
        if (lift === 0 && arm.t > ARM_UP) arm.t = Infinity;
      }
      const n = w.level.size;
      const sight = w.sight[LOCAL_PLAYER]!.cells;
      w.participants.forEach((p, i) => {
        const card = cards[i];
        if (!card) return;
        // The card is in the wing from the moment it leaves the rack until it is swiped at the reader.
        const holds = w.tasks.some((t) => t.owner === p.id && t.kind === 'badge' && !t.done && w.stations[t.station]?.kind === 'gate');
        const seen = p.id === LOCAL_PLAYER || sight[Math.floor(p.z) * n + Math.floor(p.x)] === 1;
        card.visible = holds && p.alive && p.under === null && seen;
        if (!card.visible) return;
        // Held in whichever wing is on the camera's side (the camera looks from +x +z), so the chick's
        // own body never hides it; it sways with the walk.
        const flip = Math.cos(p.facing) - Math.sin(p.facing) < 0 ? -1 : 1;
        const side = 0.55 * flip;
        const ahead = 0.15;
        card.position.set(
          p.x + Math.cos(p.facing) * side + Math.sin(p.facing) * ahead,
          0.8 + (p.moving ? Math.abs(Math.sin(time * 9 + i)) * 0.05 : 0),
          p.z - Math.sin(p.facing) * side + Math.cos(p.facing) * ahead,
        );
        // The camera always looks from the same side (yaw 45°): the card shows it its face, never its edge.
        card.rotation.set(0, Math.PI / 4, p.moving ? Math.sin(time * 9 + i) * 0.25 : 0.12);
      });
    },
    swing(prop) {
      const arm = arms.get(prop);
      if (arm) arm.t = 0;
    },
    dispose() {
      root.clear();
    },
  };
}
