import * as THREE from 'three';
import {
  CAMERA_FOLLOW_RATE,
  CAMERA_PITCH,
  CAMERA_YAW,
  CAMERA_ZOOM_DEFAULT,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  EMERGENCY_BOOST,
  EMERGENCY_RATE,
  EMERGENCY_TINT,
  GLOOM_FADE,
  PORTRAIT_FIT,
  SHADOW_MAP,
  TOUCH_PIXEL_RATIO,
  TOUCH_SHADOW_MAP,
  GLOOM_SKY,
  GLOOM_SKY_LIGHT,
  GLOOM_SUN_LIGHT,
  SKY_LIGHT,
  SUN_LIGHT,
} from '../config';

export interface Stage {
  scene: THREE.Scene;
  /** Snaps the camera to a point (used after a rebuild). */
  focus(x: number, z: number): void;
  /** Eases the camera towards a point. */
  follow(x: number, z: number, dt: number): void;
  zoomBy(factor: number): void;
  /** Aims the sun and its shadow frustum at the building. */
  fitSun(size: number): void;
  /** Redraws the sun's shadow map on the next frame; it is static otherwise. */
  refreshShadows(): void;
  /** Eases the lights towards day (0) or the overheat blackout (1). */
  setGloom(target: number, dt: number): void;
  /** While the blackout lasts the emergency light pulses red; call every frame with the clock. */
  pulseEmergency(time: number): void;
  /** Lighter rendering for phones: fewer pixels, a smaller shadow map. */
  setTouch(on: boolean): void;
  render(): void;
}

const CAMERA_DISTANCE = 120;

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The office is static, so shadows are only redrawn on request.
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe6ff);

  const sky = new THREE.HemisphereLight(0xf2f9ff, 0xe6d3a3, SKY_LIGHT);
  scene.add(sky);
  const dayColor = new THREE.Color(0xbfe6ff);
  const gloomColor = new THREE.Color(GLOOM_SKY);
  const skyColor = new THREE.Color(0xf2f9ff);
  const emergencyColor = new THREE.Color(0xff3b2e);
  let gloom = 0;
  const sun = new THREE.DirectionalLight(0xfff0cf, SUN_LIGHT);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const offset = new THREE.Vector3(
    Math.cos(CAMERA_PITCH) * Math.sin(CAMERA_YAW),
    Math.sin(CAMERA_PITCH),
    Math.cos(CAMERA_PITCH) * Math.cos(CAMERA_YAW),
  ).multiplyScalar(CAMERA_DISTANCE);
  const target = new THREE.Vector3();
  let zoom = CAMERA_ZOOM_DEFAULT;

  const applyCamera = (): void => {
    const aspect = window.innerWidth / window.innerHeight;
    // A tall phone screen: keep the width and show more above and below instead.
    const half = aspect >= PORTRAIT_FIT ? zoom : (zoom * PORTRAIT_FIT) / aspect;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  };

  const resize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    applyCamera();
  };
  window.addEventListener('resize', resize);
  resize();

  return {
    scene,
    focus(x, z) {
      target.set(x, 0.6, z);
      applyCamera();
    },
    follow(x, z, dt) {
      const k = 1 - Math.exp(-CAMERA_FOLLOW_RATE * dt);
      target.x += (x - target.x) * k;
      target.z += (z - target.z) * k;
      applyCamera();
    },
    zoomBy(factor) {
      zoom = Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, zoom * factor));
      applyCamera();
    },
    fitSun(size) {
      // Sun stands in the south-west: it shines through the tall west windows
      // and still lights the south faces the camera looks at.
      const half = size / 2;
      sun.target.position.set(half, 0, half);
      sun.position.set(half - 42, 44, half + 20);
      const reach = size * 0.82;
      const shadowCamera = sun.shadow.camera;
      shadowCamera.left = -reach;
      shadowCamera.right = reach;
      shadowCamera.top = reach;
      shadowCamera.bottom = -reach;
      shadowCamera.near = 1;
      shadowCamera.far = 160;
      shadowCamera.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true;
    },
    setGloom(target, dt) {
      if (gloom === target) return;
      const step = dt / GLOOM_FADE;
      gloom = target > gloom ? Math.min(target, gloom + step) : Math.max(target, gloom - step);
      sky.intensity = SKY_LIGHT + (GLOOM_SKY_LIGHT - SKY_LIGHT) * gloom;
      sun.intensity = SUN_LIGHT + (GLOOM_SUN_LIGHT - SUN_LIGHT) * gloom;
      (scene.background as THREE.Color).copy(dayColor).lerp(gloomColor, gloom);
    },
    pulseEmergency(time) {
      // A slow red breath over the dark office; gone as the lights come back.
      const pulse = gloom * (0.5 + 0.5 * Math.sin(time * Math.PI * 2 * EMERGENCY_RATE));
      sky.color.copy(skyColor).lerp(emergencyColor, pulse * EMERGENCY_TINT);
      sky.intensity = SKY_LIGHT + (GLOOM_SKY_LIGHT - SKY_LIGHT) * gloom + pulse * EMERGENCY_BOOST;
    },
    setTouch(on) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, on ? TOUCH_PIXEL_RATIO : 2));
      const size = on ? TOUCH_SHADOW_MAP : SHADOW_MAP;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        renderer.shadowMap.needsUpdate = true;
      }
      resize();
    },
    refreshShadows() {
      renderer.shadowMap.needsUpdate = true;
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
