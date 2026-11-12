import * as THREE from 'three';

// Shared geometry and material caches: props are built from a few primitives,
// so identical shapes and colours reuse the same GPU resources.

const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.Material>();

// --- Fog of war -----------------------------------------------------------
// Every material samples one shared texture (a texel per map cell) by world
// position and fades to pale grey where the player has no line of sight.

export const fogUniforms = {
  uFogMap: { value: null as THREE.Texture | null },
  uFogSize: { value: 1 },
};

/** Makes a material fade out of sight. Call once per material. */
export function withFog<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogMap = fogUniforms.uFogMap;
    shader.uniforms.uFogSize = fogUniforms.uFogSize;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogXZ;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 fogWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fogWorld = instanceMatrix * fogWorld;
        #endif
        vFogXZ = (modelMatrix * fogWorld).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uFogMap;\nuniform float uFogSize;\nvarying vec2 vFogXZ;')
      .replace(
        '#include <dithering_fragment>',
        `float seen = smoothstep(0.15, 0.85, texture2D(uFogMap, vFogXZ / uFogSize).r);
        float grey = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 faded = mix(vec3(grey), vec3(0.72, 0.74, 0.78), 0.55) * 0.82;
        gl_FragColor.rgb = mix(faded, gl_FragColor.rgb, seen);
        #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'fog';
  return material;
}

// --- Materials and primitives ---------------------------------------------

function geometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let found = geometries.get(key);
  if (!found) {
    found = make();
    geometries.set(key, found);
  }
  return found;
}

/**
 * Cached flat-colour material. `userData.merge` tells the office builder how
 * static meshes with this material can be merged: 'lit' or 'glow'.
 */
export function mat(color: number, options: { emissive?: number; opacity?: number } = {}): THREE.Material {
  const key = `${color}:${options.emissive ?? ''}:${options.opacity ?? ''}`;
  let found = materials.get(key);
  if (!found) {
    found = withFog(
      new THREE.MeshLambertMaterial({
        color,
        emissive: options.emissive ?? 0x000000,
        transparent: options.opacity !== undefined,
        opacity: options.opacity ?? 1,
        depthWrite: options.opacity === undefined,
      }),
    );
    if (options.opacity === undefined) found.userData.merge = options.emissive === undefined ? 'lit' : 'glow';
    materials.set(key, found);
  }
  return found;
}

function finish(mesh: THREE.Mesh, x: number, y: number, z: number, shadow: boolean): THREE.Mesh {
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Box centred on (x, y, z). */
export function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  shadow = true,
): THREE.Mesh {
  const geo = geometry(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  return finish(new THREE.Mesh(geo, material), x, y, z, shadow);
}

export function cylinder(
  rTop: number,
  rBottom: number,
  h: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  segments = 16,
): THREE.Mesh {
  const geo = geometry(`c:${rTop}:${rBottom}:${h}:${segments}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, segments));
  return finish(new THREE.Mesh(geo, material), x, y, z, true);
}

export function sphere(r: number, material: THREE.Material, x = 0, y = 0, z = 0, detail = 1): THREE.Mesh {
  const geo = geometry(`s:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail));
  return finish(new THREE.Mesh(geo, material), x, y, z, true);
}

export function smoothSphere(r: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = geometry(`ss:${r}`, () => new THREE.SphereGeometry(r, 24, 16));
  return finish(new THREE.Mesh(geo, material), x, y, z, true);
}

export function cone(r: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = geometry(`k:${r}:${h}`, () => new THREE.ConeGeometry(r, h, 12));
  return finish(new THREE.Mesh(geo, material), x, y, z, true);
}

/** Canvas-backed texture; `draw` paints a canvas `size` wide and `height` tall. */
export function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  height = size,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Flat panel showing a canvas drawing, facing +z. Not cached: text varies. */
export function screen(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, pxW: number, pxH: number) => void,
  glow = 0.55,
): THREE.Mesh {
  const pxW = 512;
  const pxH = Math.max(64, Math.round((512 * h) / w));
  const texture = canvasTexture(pxW, (ctx) => draw(ctx, pxW, pxH), pxH);
  const material = withFog(
    new THREE.MeshLambertMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: glow }),
  );
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.userData.ownsResources = true;
  return mesh;
}

/** Frees per-office resources: merged geometry, screens and their textures. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.ownsResources) return;
    mesh.geometry.dispose();
    // Materials without a map come from the shared cache and stay alive.
    const material = mesh.material as THREE.MeshLambertMaterial;
    if (!mesh.userData.sharedMaterial && !Array.isArray(material) && material.map) {
      material.map.dispose();
      material.dispose();
    }
  });
}

/** Small deterministic generator for texture noise (rendering only). */
export function noise(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}
