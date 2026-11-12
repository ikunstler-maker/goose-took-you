import * as THREE from 'three';
import type { Emotion } from '../sim/world';
import { box, cone, cylinder, mat, smoothSphere, sphere } from './kit';

export interface ChickView {
  root: THREE.Group;
  update(x: number, z: number, facing: number, moving: boolean, emotion: Emotion, time: number, dt: number): void;
}

const ARC = new THREE.TorusGeometry(0.11, 0.028, 8, 16, Math.PI);
const SHADOW = new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2);

/** Chibi chick: a huge head on a tiny body, with a goofy face per emotion. */
export function createChick(color = 0xffd84a): ChickView {
  const body = mat(color);
  const wingMat = mat(0xf2c23a);
  const orange = mat(0xff9a2e);
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

  const torso = smoothSphere(0.25, body, 0, 0.3, 0);
  torso.scale.set(1.05, 0.95, 0.95);
  bob.add(torso);

  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.24, 0.36, 0);
    const wing = smoothSphere(0.13, wingMat, side * 0.04, -0.07, 0);
    wing.scale.set(0.45, 1, 0.8);
    pivot.add(wing);
    bob.add(pivot);
    return { pivot, side };
  });

  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.11, 0.14, 0);
    const foot = cone(0.08, 0.05, orange, 0, -0.12, 0.05);
    foot.scale.set(1, 1, 1.5);
    pivot.add(cylinder(0.03, 0.03, 0.12, orange, 0, -0.06, 0, 6), foot);
    root.add(pivot);
    return { pivot, side };
  });

  // --- Head: everything on it tilts and bobs together ---
  const head = new THREE.Group();
  head.position.set(0, 0.92, 0.02);
  bob.add(head);
  head.add(smoothSphere(0.5, body, 0, 0, 0));
  for (const [x, lean] of [[-0.08, 0.4], [0, 0], [0.08, -0.4]] as const) {
    const tuft = cone(0.05, 0.2, body, x, 0.56, 0);
    tuft.rotation.z = lean;
    head.add(tuft);
  }
  for (const side of [-1, 1]) {
    const cheek = smoothSphere(0.08, pink, side * 0.33, -0.1, 0.36);
    cheek.scale.set(1, 0.6, 0.4);
    head.add(cheek);
  }

  const eyeX = 0.2;
  const eyeY = 0.06;
  const eyeZ = 0.44;
  const whites = [-1, 1].map((side) => {
    const eye = smoothSphere(0.15, white, side * eyeX, eyeY, eyeZ - 0.03);
    eye.scale.set(1, 1.1, 0.45);
    head.add(eye);
    return eye;
  });
  const pupils = [-1, 1].map((side) => {
    const pupil = smoothSphere(0.07, black, side * eyeX, eyeY, eyeZ + 0.035);
    pupil.scale.set(1, 1, 0.5);
    head.add(pupil);
    return pupil;
  });
  // Happy eyes: upside-down arcs.
  const arcs = [-1, 1].map((side) => {
    const arc = new THREE.Mesh(ARC, black);
    arc.position.set(side * eyeX, eyeY - 0.03, eyeZ + 0.01);
    head.add(arc);
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
    head.add(cross);
    return cross;
  });
  // Bored eyes: heavy lids over the top half.
  const lids = [-1, 1].map((side) => {
    const lid = smoothSphere(0.16, body, side * eyeX, eyeY + 0.07, eyeZ - 0.02);
    lid.scale.set(1.05, 0.62, 0.5);
    head.add(lid);
    return lid;
  });

  const beakTop = cone(0.09, 0.2, orange, 0, -0.12, 0.5);
  beakTop.rotation.x = Math.PI / 2;
  const beakBottom = cone(0.075, 0.15, orange, 0, -0.17, 0.47);
  beakBottom.rotation.x = Math.PI / 2;
  const tongue = sphere(0.045, pink, 0, -0.16, 0.5, 1);
  head.add(beakTop, beakBottom, tongue);

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
  head.add(stars, bang, snooze);

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
    for (const eye of whites) {
      eye.visible = openEyes;
      eye.scale.setScalar(1).multiply(new THREE.Vector3(1, 1.1, 0.45)).multiplyScalar(emotion === 'surprised' ? 1.3 : 1);
    }
    pupils.forEach((pupil, i) => {
      pupil.visible = openEyes;
      const side = i === 0 ? -1 : 1;
      // Calm: each pupil wanders its own way. Surprised: pinpricks. Bored: staring at the floor.
      const dx = emotion === 'calm' ? (i === 0 ? -0.04 : -0.01) : 0;
      const dy = emotion === 'calm' ? (i === 0 ? 0.04 : -0.045) : emotion === 'bored' ? -0.06 : 0;
      pupil.position.set(side * eyeX + dx, eyeY + dy, eyeZ + (emotion === 'surprised' ? 0.055 : 0.035));
      pupil.scale.set(1, 1, 0.5).multiplyScalar(emotion === 'surprised' ? 0.5 : 1);
    });
    for (const arc of arcs) arc.visible = emotion === 'happy';
    for (const cross of crosses) cross.visible = emotion === 'dizzy';
    for (const lid of lids) lid.visible = emotion === 'bored';
    const mouthOpen = emotion === 'happy' || emotion === 'surprised' || emotion === 'dizzy';
    beakBottom.rotation.x = Math.PI / 2 + (mouthOpen ? 0.55 : 0);
    beakBottom.position.y = mouthOpen ? -0.21 : -0.17;
    tongue.visible = emotion === 'happy' || emotion === 'dizzy';
    tongue.position.set(emotion === 'dizzy' ? 0.07 : 0, mouthOpen ? -0.2 : -0.16, 0.5);
    stars.visible = emotion === 'dizzy';
    bang.visible = emotion === 'surprised';
    snooze.visible = emotion === 'bored';
  };
  show('calm');

  return {
    root,
    update(x, z, facing, moving, emotion, time, dt) {
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

      // Head acting per emotion.
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
      head.rotation.z = tilt;
      head.rotation.x = nod;
      head.position.y = 0.92 + lift;
      // Floating marks face the camera regardless of where the chick looks.
      bang.rotation.y = -heading + Math.PI / 4;
      snooze.rotation.y = -heading + Math.PI / 4;
    },
  };
}
