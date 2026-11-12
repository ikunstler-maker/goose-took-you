import * as THREE from 'three';
import type { Accessory } from '../config';
import type { Emotion } from '../sim/world';
import { t } from '../i18n';
import { box, canvasTexture, cone, cylinder, mat, smoothSphere, sphere, withFog } from './kit';

export interface ChickView {
  root: THREE.Group;
  /** `neck` 0..1 stretches the Goose's neck; `bubble` is the text shown above the head, or null. */
  update(
    x: number,
    z: number,
    facing: number,
    moving: boolean,
    emotion: Emotion,
    time: number,
    dt: number,
    neck?: number,
    bubble?: string | null,
  ): void;
}

const BUBBLE = new THREE.PlaneGeometry(1.5, 0.7);
const bubbles = new Map<string, THREE.Material>();

/** Speech/thought bubble («га-га?», «?», «♥»…); one material per text. */
function bubbleMaterial(text: string): THREE.Material {
  let found = bubbles.get(text);
  if (!found) {
    const texture = canvasTexture(
      256,
      (ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#3a2a14';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 86, 40);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(110, 92);
        ctx.lineTo(128, 116);
        ctx.lineTo(146, 92);
        ctx.fill();
        ctx.fillStyle = '#3a2a14';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 46px system-ui, sans-serif';
        ctx.fillText(text, 128, 52, 220);
      },
      120,
    );
    found = withFog(new THREE.MeshLambertMaterial({ map: texture, transparent: true, emissive: 0xffffff, emissiveMap: texture }));
    bubbles.set(text, found);
  }
  return found;
}

const ARC = new THREE.TorusGeometry(0.11, 0.028, 8, 16, Math.PI);
const BAND = new THREE.TorusGeometry(0.53, 0.035, 8, 24, Math.PI);
const BAND_PAD = new THREE.TorusGeometry(0.53, 0.06, 8, 12, Math.PI / 3);
const LENS_RIM = new THREE.TorusGeometry(0.175, 0.035, 8, 24);
const MUG_HANDLE = new THREE.TorusGeometry(0.065, 0.022, 8, 16);
const COLLAR = new THREE.TorusGeometry(0.32, 0.05, 8, 24).rotateX(Math.PI / 2);
const SEAM = new THREE.TorusGeometry(0.482, 0.012, 6, 32).rotateY(Math.PI / 2);

/** Half-width and half-height of the chick's egg body, metres. */
const EGG_R = 0.5;
const EGG_H = 0.58;
/** Height of the egg's underside above the floor. */
const GROUND = 0.16;
/** Egg: a sphere that is a little wider below the middle than above it. */
const EGG = (() => {
  const g = new THREE.SphereGeometry(1, 28, 20);
  const pos = g.attributes.position!;
  const normal = g.attributes.normal!;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const taper = 1 - 0.1 * y;
    pos.setXYZ(i, x * EGG_R * taper, y * EGG_H, z * EGG_R * taper);
    n.set(x / EGG_R, y / EGG_H, z / EGG_R).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
})();

/** Chick eye centres in face coordinates (egg centre at the origin). */
const EYE_X = 0.2;
const EYE_Y = 0.12;
const EYE_Z = 0.43;

/** Accessory in face coordinates: egg centre at the origin, crown of the egg at y = 0.58. */
function buildAccessory(kind: Accessory): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'headphones': {
      const orange = mat(0xf58a3c);
      const cream = mat(0xfbf3e4);
      const band = new THREE.Mesh(BAND, cream);
      const pad = new THREE.Mesh(BAND_PAD, orange);
      pad.rotation.z = Math.PI / 3;
      // Stretched as a pair so the band clears the crown of the egg.
      const arch = new THREE.Group();
      arch.scale.y = 1.16;
      arch.add(band, pad);
      g.add(arch);
      for (const side of [-1, 1]) {
        const rim = cylinder(0.2, 0.2, 0.06, cream, side * 0.47, 0, 0, 20);
        const cup = cylinder(0.16, 0.18, 0.12, orange, side * 0.53, 0, 0, 20);
        rim.rotation.z = Math.PI / 2;
        cup.rotation.z = (side * Math.PI) / 2;
        g.add(rim, cup);
      }
      break;
    }
    case 'cap': {
      const red = mat(0xe5433d);
      const cream = mat(0xfbf7ef);
      const dome = smoothSphere(0.36, red, 0, 0.38, -0.02);
      dome.scale.set(1, 0.75, 1);
      const front = smoothSphere(0.3, cream, 0, 0.4, 0.09);
      front.scale.set(1, 0.78, 0.9);
      const brim = smoothSphere(0.24, red, 0, 0.36, 0.42);
      brim.scale.set(1, 0.12, 1.1);
      brim.rotation.x = 0.12;
      // Brim swung round past the ear: backwards, but still in the silhouette.
      const peak = new THREE.Group();
      peak.rotation.y = -1.9;
      peak.add(brim);
      g.add(dome, front, peak, sphere(0.045, red, 0, 0.66, -0.02, 1));
      g.rotation.z = 0.12;
      break;
    }
    case 'glasses': {
      const rim = mat(0x7b5fd6);
      for (const side of [-1, 1]) {
        const ring = new THREE.Mesh(LENS_RIM, rim);
        ring.position.set(side * EYE_X, EYE_Y, EYE_Z + 0.02);
        ring.rotation.y = side * 0.4;
        g.add(ring);
      }
      break;
    }
    case 'crown': {
      const gold = mat(0xf2c14a, { emissive: 0x6a4500 });
      g.add(cylinder(0.15, 0.13, 0.1, gold, 0, 0, 0, 12));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const x = Math.sin(a) * 0.125;
        const z = Math.cos(a) * 0.125;
        g.add(cone(0.045, 0.14, gold, x, 0.11, z), sphere(0.026, gold, x * 1.05, 0.19, z * 1.05, 1));
      }
      // Small and tipped to one side.
      g.position.set(0.13, 0.57, 0);
      g.rotation.z = -0.25;
      break;
    }
    case 'sprout': {
      const leaf = mat(0x7ccb4f);
      const soil = smoothSphere(0.14, mat(0x6b4226), 0, 0.555, 0);
      soil.scale.set(1.2, 0.4, 1.2);
      g.add(soil, cylinder(0.025, 0.035, 0.2, mat(0x5aa83c), 0, 0.68, 0, 6));
      for (const side of [-1, 1]) {
        const l = smoothSphere(0.13, leaf, side * 0.13, 0.82, 0);
        l.scale.set(1.25, 0.3, 0.75);
        l.rotation.z = side * 0.5;
        g.add(l);
      }
      break;
    }
    case 'coffee': {
      const cream = mat(0xf3e6d2);
      const handle = new THREE.Mesh(MUG_HANDLE, cream);
      handle.position.set(0.17, 0.7, 0);
      g.add(
        cylinder(0.14, 0.14, 0.26, cream, 0, 0.7, 0, 20),
        cylinder(0.115, 0.115, 0.01, mat(0x4a2c1a), 0, 0.831, 0, 20),
        handle,
      );
      break;
    }
  }
  return g;
}
const SHADOW = new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2);

/** Fixed colours of the Goose's disguise, whatever chick the others see. */
const GOOSE_SUIT = 0xfbe88c;
const GOOSE_CREST = 0xffe04a;

/**
 * Clay chick: one egg-shaped body with a goofy face per emotion.
 * With `goose` the same rig wears the Goose's true look — a white head poking
 * out of a yellow chick suit — at the same footprint and height.
 */
export function createChick(color = 0xffd84a, accessory: Accessory | null = null, goose = false): ChickView {
  const body = mat(goose ? GOOSE_SUIT : color);
  const skin = goose ? mat(0xffffff) : body;
  const wingMat = goose ? body : mat(new THREE.Color(color).multiplyScalar(0.92).getHex());
  const orange = mat(0xf58a3c);
  const black = mat(0x1d1a22);
  const white = mat(0xffffff, { emissive: 0xdddddd });
  const pink = mat(0xff8fa3);
  const star = mat(0xffe14d, { emissive: 0xffe14d });

  const root = new THREE.Group();
  const shadow = new THREE.Mesh(SHADOW, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.position.y = 0.03;
  root.add(shadow);

  const bob = new THREE.Group();
  root.add(bob);

  // Everything that tilts with the emotion: the whole egg for a chick, head and neck for the Goose.
  const lean = new THREE.Group();
  const leanY = goose ? 0.88 : GROUND;
  lean.position.y = leanY;
  bob.add(lean);
  // The face is modelled once at chick size; the Goose's smaller head scales it down.
  const face = new THREE.Group();
  const faceY = goose ? 0.14 : EGG_H;
  face.position.y = faceY;
  const marks = new THREE.Group();
  const marksY = goose ? 0.15 : EGG_H + 0.08;
  marks.position.y = marksY;
  lean.add(face, marks);

  let egg: THREE.Mesh | null = null;
  if (goose) {
    const suit = smoothSphere(0.48, body, 0, GROUND + 0.42, 0);
    suit.scale.set(1, 0.875, 1);
    const seam = new THREE.Mesh(SEAM, mat(0xe6cf6e));
    seam.position.y = GROUND + 0.42;
    seam.scale.y = 0.875;
    const collar = new THREE.Mesh(COLLAR, body);
    collar.position.y = 0.86;
    bob.add(suit, seam, collar);
    // The neck runs down inside the suit, so stretching only shows more of it.
    lean.add(cylinder(0.3, 0.3, 0.64, skin, 0, -0.18, 0, 20), smoothSphere(0.3, skin, 0, faceY, 0));
    const crest = mat(GOOSE_CREST);
    for (const [x, turn] of [[-0.09, 0.55], [0, 0], [0.09, -0.55]] as const) {
      const feather = smoothSphere(0.1, crest, x, faceY + 0.38 - Math.abs(x) * 0.4, 0);
      feather.scale.set(0.42, 1.25, 0.14);
      feather.rotation.z = turn;
      lean.add(feather);
    }
    face.scale.setScalar(0.7);
  } else {
    egg = new THREE.Mesh(EGG, body);
    egg.position.y = EGG_H;
    lean.add(egg);
    if (accessory) face.add(buildAccessory(accessory));
  }

  const wingHost = goose ? bob : lean;
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (goose ? 0.45 : 0.47), goose ? 0.66 : 0.5, 0);
    const wing = smoothSphere(0.14, wingMat, side * 0.03, -0.09, 0);
    wing.scale.set(0.4, 1, 0.75);
    pivot.add(wing);
    wingHost.add(pivot);
    return { pivot, side };
  });

  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, GROUND + 0.02, 0);
    pivot.add(cylinder(0.03, 0.03, 0.12, orange, 0, -0.06, 0, 6));
    if (goose) {
      // Webbed foot.
      const web = smoothSphere(0.09, orange, 0, -0.13, 0.06);
      web.scale.set(1.15, 0.3, 1.6);
      pivot.add(web);
    } else {
      for (const a of [-0.55, 0, 0.55]) {
        const toe = smoothSphere(0.05, orange, Math.sin(a) * 0.05, -0.13, 0.03 + Math.cos(a) * 0.04);
        toe.scale.set(0.7, 0.5, 1.5);
        toe.rotation.y = a;
        pivot.add(toe);
      }
    }
    root.add(pivot);
    return { pivot, side };
  });

  // --- Face ---
  const eyeX = EYE_X;
  const eyeY = EYE_Y;
  // The Goose's head is narrower than the egg, and its eyes bulge more.
  const eyeZ = goose ? 0.36 : EYE_Z;
  const big = goose ? 1.2 : 1;
  const whites = [-1, 1].map((side) => {
    const eye = smoothSphere(0.15, white, side * eyeX, eyeY, eyeZ - 0.02);
    face.add(eye);
    return eye;
  });
  const pupils = [-1, 1].map((side) => {
    const pupil = smoothSphere(0.06, black, side * eyeX, eyeY, eyeZ);
    face.add(pupil);
    return pupil;
  });
  // Happy eyes: upside-down arcs.
  const arcs = [-1, 1].map((side) => {
    const arc = new THREE.Mesh(ARC, black);
    arc.position.set(side * eyeX, eyeY - 0.03, eyeZ + 0.01);
    face.add(arc);
    return arc;
  });
  // Dizzy eyes: crosses.
  const crosses = [-1, 1].map((side) => {
    const cross = new THREE.Group();
    const a = box(0.24, 0.045, 0.03, black);
    const b = box(0.24, 0.045, 0.03, black);
    a.rotation.z = Math.PI / 4;
    b.rotation.z = -Math.PI / 4;
    cross.add(a, b);
    cross.position.set(side * eyeX, eyeY, eyeZ + 0.01);
    cross.rotation.y = side * 0.4;
    face.add(cross);
    return cross;
  });
  // Bored eyes: heavy lids over the top half.
  const lids = [-1, 1].map((side) => {
    const lid = smoothSphere(0.16, skin, side * eyeX, eyeY + 0.07 * big, eyeZ - 0.02);
    lid.scale.set(1.05, 0.62, 0.75).multiplyScalar(big);
    face.add(lid);
    return lid;
  });

  // Beak: a small open one for chicks, a wide flat bill for the Goose.
  const beakTop = smoothSphere(goose ? 0.2 : 0.085, orange, 0, goose ? -0.2 : -0.07, goose ? 0.56 : 0.5);
  const beakBottom = smoothSphere(goose ? 0.17 : 0.07, orange);
  const gape = smoothSphere(0.05, mat(0xd9566b), 0, goose ? -0.25 : -0.105, goose ? 0.6 : 0.5);
  const tongue = sphere(0.04, pink, 0, 0, 0, 1);
  if (goose) {
    beakTop.scale.set(1.25, 0.32, 1.5);
    beakBottom.scale.set(1.15, 0.24, 1.35);
    gape.scale.set(3.2, 0.5, 3);
  } else {
    beakTop.scale.set(1.15, 0.6, 1.2);
    beakBottom.scale.set(1.05, 0.5, 1);
    gape.scale.set(1.1, 0.8, 1);
  }
  face.add(beakTop, beakBottom, gape, tongue);

  // --- Marks that float above the head ---
  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = sphere(0.07, star, Math.cos((i * Math.PI * 2) / 3) * 0.42, 0, Math.sin((i * Math.PI * 2) / 3) * 0.42, 0);
    stars.add(s);
  }
  stars.position.y = 0.78;
  const bang = new THREE.Group();
  bang.add(box(0.09, 0.3, 0.09, mat(0xff4b3e, { emissive: 0xff4b3e }), 0, 0.2, 0), box(0.09, 0.09, 0.09, mat(0xff4b3e, { emissive: 0xff4b3e }), 0, -0.03, 0));
  bang.position.set(0.1, 0.86, 0);
  const snooze = new THREE.Group();
  const ink = mat(0x7a8fb8, { emissive: 0x7a8fb8 });
  const diagonal = box(0.26, 0.05, 0.03, ink);
  diagonal.rotation.z = Math.PI / 4;
  snooze.add(box(0.2, 0.05, 0.03, ink, 0, 0.09, 0), diagonal, box(0.2, 0.05, 0.03, ink, 0, -0.09, 0));
  snooze.position.set(0.42, 0.8, 0);
  marks.add(stars, bang, snooze);
  const talk = new THREE.Mesh(BUBBLE, bubbleMaterial(t('goose.tell')));
  let talkText: string | null = null;
  talk.position.set(0, 1.15, 0);
  talk.visible = false;
  marks.add(talk);

  // The chick's shadow is the blob underneath: the sun's shadow map is static.
  root.traverse((node) => {
    node.castShadow = false;
  });

  let stride = 0;
  let heading = 0;
  let shown: Emotion | null = null;

  const show = (emotion: Emotion): void => {
    shown = emotion;
    const openEyes = emotion === 'calm' || emotion === 'surprised' || emotion === 'bored';
    const wide = big * (emotion === 'surprised' ? 1.25 : 1);
    for (const eye of whites) {
      eye.visible = openEyes;
      eye.scale.set(1, 1.05, 0.7).multiplyScalar(wide);
    }
    pupils.forEach((pupil, i) => {
      pupil.visible = openEyes;
      const side = i === 0 ? -1 : 1;
      // Calm: each pupil wanders its own way. Surprised: pinpricks. Bored: staring at the floor.
      const dx = emotion === 'calm' ? (i === 0 ? -0.045 : 0.02) : 0;
      const dy = emotion === 'calm' ? (i === 0 ? 0.03 : -0.04) : emotion === 'bored' ? -0.06 : 0;
      pupil.position.set(side * eyeX + dx * big, eyeY + dy * big, eyeZ - 0.032 + 0.105 * wide);
      pupil.scale.set(1, 1, 0.4).multiplyScalar(emotion === 'surprised' ? 0.6 : 1);
    });
    for (const arc of arcs) arc.visible = emotion === 'happy';
    for (const cross of crosses) cross.visible = emotion === 'dizzy';
    for (const lid of lids) lid.visible = emotion === 'bored';
    // Calm chicks keep the beak slightly open, like the clay reference; bored ones shut it.
    const open = emotion === 'happy' || emotion === 'surprised' || emotion === 'dizzy' ? 1 : emotion === 'bored' ? 0 : 0.4;
    if (goose) {
      beakBottom.position.set(0, -0.27 - open * 0.09, 0.5);
      beakBottom.rotation.x = open * 0.25;
    } else {
      beakBottom.position.set(0, -0.118 - open * 0.055, 0.485);
    }
    gape.visible = open > 0;
    tongue.visible = emotion === 'happy' || emotion === 'dizzy';
    tongue.position.set(emotion === 'dizzy' ? 0.07 : 0, goose ? -0.3 : -0.15, goose ? 0.74 : 0.535);
    stars.visible = emotion === 'dizzy';
    bang.visible = emotion === 'surprised';
    snooze.visible = emotion === 'bored';
  };
  show('calm');

  return {
    root,
    update(x, z, facing, moving, emotion, time, dt, stretch = 0, bubble = null) {
      if (emotion !== shown) show(emotion);
      root.position.set(x, 0, z);
      // Turn towards the heading along the shortest arc.
      const delta = Math.atan2(Math.sin(facing - heading), Math.cos(facing - heading));
      heading += delta * Math.min(1, dt * 14);
      root.rotation.y = heading;

      stride += moving ? dt * 15 : 0;
      const swing = moving ? Math.sin(stride) : 0;
      for (const leg of legs) leg.pivot.rotation.x = swing * 0.8 * leg.side;
      const flap = moving ? 0.6 + Math.abs(Math.sin(stride)) * 0.6 : 0.12 + Math.sin(time * 2) * 0.05;
      for (const wing of wings) wing.pivot.rotation.z = flap * wing.side;
      bob.position.y = moving ? Math.abs(Math.sin(stride)) * 0.08 : Math.sin(time * 2) * 0.012;

      // Body acting per emotion.
      let tilt = swing * 0.1;
      let nod = 0;
      let lift = 0;
      if (emotion === 'dizzy') {
        tilt = Math.sin(time * 9) * 0.28;
        nod = Math.cos(time * 9) * 0.12;
        stars.rotation.y = time * 6;
      } else if (emotion === 'surprised') {
        lift = Math.abs(Math.sin(time * 14)) * 0.07;
        nod = -0.12;
        bang.position.y = 0.86 + Math.sin(time * 12) * 0.03;
      } else if (emotion === 'bored') {
        tilt = 0.22 + Math.sin(time * 1.2) * 0.04;
        nod = 0.14;
        snooze.position.y = 0.8 + ((time * 0.25) % 1) * 0.2;
        snooze.scale.setScalar(0.7 + ((time * 0.25) % 1) * 0.6);
      } else if (emotion === 'calm') {
        tilt = Math.sin(time * 1.5) * 0.05;
      }
      // The Goose's neck pivots at the collar, so it leans less to stay inside the suit.
      const sway = goose ? 0.5 : 0.7;
      lean.rotation.z = tilt * sway;
      lean.rotation.x = nod * sway;
      // Neck out, then back. The Goose's head rides up on its neck; a chick-shaped
      // disguise stretches tall and thin, carrying its face up with it.
      const reach = stretch * 0.45;
      if (egg) {
        const tall = 1 + reach / (EGG_H * 2);
        egg.scale.y = tall;
        egg.position.y = EGG_H * tall;
        face.position.y = faceY + reach * 0.85;
        marks.position.y = marksY + reach;
        lean.position.y = leanY + lift;
      } else {
        lean.position.y = leanY + lift + reach;
      }
      talk.visible = bubble !== null;
      if (bubble !== null && bubble !== talkText) {
        talkText = bubble;
        talk.material = bubbleMaterial(bubble);
      }
      talk.rotation.y = -heading + Math.PI / 4;
      // Floating marks face the camera regardless of where the chick looks.
      bang.rotation.y = -heading + Math.PI / 4;
      snooze.rotation.y = -heading + Math.PI / 4;
    },
  };
}
