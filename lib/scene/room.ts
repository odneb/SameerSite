/**
 * The room mesh: the solid scene the splat cloud is a surface of.
 *
 * `scripts/glb-bake.mjs` solves a camera against the plate's composition and
 * writes what it found to `room-transform.json`. Two things read that file. The
 * splat sampler uses it to give every covered pixel the depth of the geometry
 * underneath it, and this module uses it to put the geometry itself into the
 * same world.
 *
 * The placement rests on one fact: scaling a scene uniformly about the camera's
 * own position does not change its projection. So the mesh can be blown up from
 * capture scale to the site's twelve-unit-wide world without a pixel of the
 * composition moving, as long as the scale is taken about the plate's lens. That
 * is what makes the cloud and the mesh occupy one space instead of two that
 * happen to line up from a single angle.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

import { ROOM } from "./config";
import { roomFragmentShader, roomVertexShader } from "./shaders";

export type RoomTransform = {
  source: string;
  camera: {
    fov: number;
    yaw: number;
    pitch: number;
    distance: number;
    targetX: number;
    targetY: number;
    aspect: number;
  };
  /** Column-major view matrix, in capture units. */
  view: number[];
  depth: { near: number; far: number; span: number; coverage: number };
  bounds: { min: number[]; max: number[]; size: number[] };
};

/**
 * Where the geometry sits, as fractions of the bake camera's distance to its
 * target. Scale-invariant, so the splat sampler can turn them into world depths
 * using whatever lens the site is currently using.
 */
export type RoomDepth = {
  /** Nearest surface, as a fraction of the lens distance. */
  near: number;
  /** Furthest surface, same units. */
  far: number;
};

export function roomDepthRatios(transform: RoomTransform): RoomDepth {
  const distance = Math.max(transform.camera.distance, 1e-6);
  return {
    near: transform.depth.near / distance,
    far: transform.depth.far / distance,
  };
}

/**
 * World z of a baked depth sample, where 1 is nearest — the inverse of what the
 * bake wrote out. This is the function that makes a splat land on the mesh.
 */
export function roomDepthToWorldZ(
  depth: number,
  ratios: RoomDepth,
  lensDistance: number,
) {
  const span = ratios.far - ratios.near;
  const viewRatio = ratios.near + (1 - depth) * span;
  return lensDistance * (1 - viewRatio);
}

export async function loadRoomTransform(url: string): Promise<RoomTransform> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`room transform ${response.status}`);
  return (await response.json()) as RoomTransform;
}

/**
 * The capture's object space to the site's world.
 *
 * `model = translate(lens) * scale(lens / captureLens) * bakeView`, which lands
 * the bake camera's target on the origin and reproduces its framing exactly.
 */
export function roomPlacement(transform: RoomTransform, lensDistance: number) {
  const scale = lensDistance / Math.max(transform.camera.distance, 1e-6);
  const view = new THREE.Matrix4().fromArray(transform.view);
  const model = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(view);
  return new THREE.Matrix4().makeTranslation(0, 0, lensDistance).multiply(model);
}

let loader: GLTFLoader | null = null;

function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export type RoomOptions = {
  url: string;
  transform: RoomTransform;
  lensDistance: number;
  /** Shared with the splat material so both are lit by one rig, in step. */
  uniforms: Record<string, THREE.IUniform>;
  maxAnisotropy?: number;
};

export type Room = {
  object: THREE.Object3D;
  dispose: () => void;
};

/**
 * Load the mesh and dress it in the scene's own lighting.
 *
 * Whatever material the file shipped with is discarded; only the base colour
 * survives, because the shader here has to agree with the splats about where the
 * light is coming from.
 */
export async function loadRoom(options: RoomOptions): Promise<Room> {
  const gltf = await gltfLoader().loadAsync(options.url);

  const disposables: Array<{ dispose: () => void }> = [];
  let map: THREE.Texture | null = null;

  gltf.scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material as THREE.MeshStandardMaterial | undefined;
    if (material?.map && !map) map = material.map;
  });

  if (map) {
    const texture = map as THREE.Texture;
    // Decoded in the shader, so three must upload the bytes untouched rather
    // than picking an sRGB internal format and decoding them again in hardware.
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = Math.min(options.maxAnisotropy ?? 4, 8);
    texture.needsUpdate = true;
  }

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTime: options.uniforms.uTime,
      uReveal: options.uniforms.uReveal,
      uAmbient: options.uniforms.uAmbient,
      uDepthHaze: options.uniforms.uDepthHaze,
      uLightPos: options.uniforms.uLightPos,
      uLightColor: options.uniforms.uLightColor,
      uLightParams: options.uniforms.uLightParams,
      uBrightness: { value: ROOM.brightness },
      uSaturation: { value: ROOM.saturation },
      uHighlight: { value: ROOM.highlight },
      uTint: { value: new THREE.Vector3(...ROOM.tint) },
      uGrainAmount: { value: ROOM.grainAmount },
      uGrainScale: { value: ROOM.grainScale },
      uRimStrength: { value: ROOM.rimStrength },
      uRimPower: { value: ROOM.rimPower },
      uLightWrap: { value: ROOM.lightWrap },
      uBreathAmount: { value: ROOM.breathAmount },
      uBreathSpeed: { value: ROOM.breathSpeed },
    },
    vertexShader: roomVertexShader,
    fragmentShader: roomFragmentShader,
    // Opaque and depth-written, so the mesh occludes itself correctly. The
    // splats ignore depth entirely and always composite over the top.
    transparent: false,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  disposables.push(material);

  gltf.scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const previous = child.material as THREE.Material | THREE.Material[];
    if (Array.isArray(previous)) previous.forEach((m) => disposables.push(m));
    else disposables.push(previous);
    child.material = material;
    child.frustumCulled = false;
    disposables.push(child.geometry);
  });

  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.matrix.copy(roomPlacement(options.transform, options.lensDistance));
  group.add(gltf.scene);
  // Drawn before the cloud, always.
  group.renderOrder = -1;

  return {
    object: group,
    dispose: () => {
      for (const item of disposables) item.dispose();
      map?.dispose();
    },
  };
}
