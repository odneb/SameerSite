/**
 * Sources of splat geometry.
 *
 * Two paths land in the exact same buffer layout:
 *
 *   1. `buildFromPlate` — derives a volumetric splat field from a single image
 *      plus the authored depth regions in config.ts. This is what ships today.
 *   2. `parseSplatFile` — reads a real gaussian-splat capture (`.splat`, the
 *      32-bytes-per-splat layout). Drop a capture in and the renderer, shaders
 *      and interaction all keep working unchanged.
 */

import { plateLensDistance } from "./plate-camera";
import {
  DEPTH_BASE,
  DEPTH_REGIONS,
  MASK_REGIONS,
  WORLD,
  type DepthRegion,
} from "./config";
import { roomDepthToWorldZ, type RoomDepth } from "./room";
import { buildTuning, type BuildTuning } from "./tuning";

export type SplatBuffers = {
  count: number;
  /** xyz, world units */
  position: Float32Array;
  /** linear rgb */
  color: Float32Array;
  /** splat radii (rx, ry) in world units */
  scale: Float32Array;
  /** splat orientation in radians */
  rotation: Float32Array;
  /** three uncorrelated randoms per splat, for phase offsets */
  seed: Float32Array;
  /** perceptual luminance, drives lighting response and shimmer weight */
  luma: Float32Array;
  /** world-space bounds, used to fit the camera */
  bounds: { width: number; height: number; depth: number };
};

/** Deterministic PRNG so a given plate always yields the same cloud. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Two-octave value noise. Cheap, and only ever runs once at build time. */
function valueNoise(x: number, y: number) {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < 2; octave++) {
    const fx = x * frequency;
    const fy = y * frequency;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smoothstep(0, 1, fx - ix);
    const ty = smoothstep(0, 1, fy - iy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    total += (top + (bottom - top) * ty) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.7;
  }
  return total / norm;
}

/** Soft rectangular mask with feathered edges. */
function regionMask(region: DepthRegion, u: number, v: number) {
  const [u0, u1] = region.u;
  const [v0, v1] = region.v;
  const f = Math.max(region.feather, 0.0001);
  const inU = smoothstep(u0 - f, u0 + f, u) * (1 - smoothstep(u1 - f, u1 + f, u));
  const inV = smoothstep(v0 - f, v0 + f, v) * (1 - smoothstep(v1 - f, v1 + f, v));
  return inU * inV;
}

function maskAt(u: number, v: number) {
  for (const region of MASK_REGIONS) {
    if (u >= region.u[0] && u <= region.u[1] && v >= region.v[0] && v <= region.v[1]) {
      return region;
    }
  }
  return null;
}

/** Radius of the erosion window, in pixels. Must exceed the text stroke width. */
const TEXT_ERODE_RADIUS = 4;

/**
 * Maps every pixel to the pixel it should take its colour from.
 *
 * Outside the masked areas that is the pixel itself. Inside them, it is the
 * darkest pixel in a small neighbourhood, which erodes the thin bright strokes
 * of the baked-in interface away while leaving the underlying room intact.
 * Mirroring or cutting holes both fail here: the masks overlap real content.
 */
function buildSourceMap(imgW: number, imgH: number, data: Uint8ClampedArray) {
  const map = new Int32Array(imgW * imgH);
  const lumaOf = (index: number) => {
    const p = index * 4;
    return 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  };

  for (let y = 0; y < imgH; y++) {
    const v = (y + 0.5) / imgH;
    for (let x = 0; x < imgW; x++) {
      const index = y * imgW + x;

      if (!maskAt((x + 0.5) / imgW, v)) {
        map[index] = index;
        continue;
      }

      let darkestIndex = index;
      let darkest = lumaOf(index);
      const y0 = Math.max(0, y - TEXT_ERODE_RADIUS);
      const y1 = Math.min(imgH - 1, y + TEXT_ERODE_RADIUS);
      const x0 = Math.max(0, x - TEXT_ERODE_RADIUS);
      const x1 = Math.min(imgW - 1, x + TEXT_ERODE_RADIUS);

      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const candidate = ny * imgW + nx;
          const luma = lumaOf(candidate);
          if (luma < darkest) {
            darkest = luma;
            darkestIndex = candidate;
          }
        }
      }

      map[index] = darkestIndex;
    }
  }

  return map;
}

/** Blend the authored regions front-to-back into a single depth value. */
function depthAt(u: number, v: number) {
  let depth = DEPTH_BASE;
  for (const region of DEPTH_REGIONS) {
    const mask = regionMask(region, u, v);
    if (mask > 0) depth += (region.depth - depth) * mask;
  }
  return depth;
}

function srgbToLinear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export type PlateBuildOptions = {
  /** Splat budget. The builder gets within a few percent of this. */
  targetCount: number;
  /**
   * The build-time half of the tuning, snapshotted by the caller. Defaults to
   * the live values, which are the config's until somebody moves a slider.
   */
  build?: BuildTuning;
  /** Optional depth plate; see readDepthPlate for the two accepted layouts. */
  depthData?: ImageData | null;
  /**
   * Where the room capture's surfaces sit, as fractions of the lens distance.
   * With this, a covered pixel is placed on the geometry itself. Without it the
   * plate is read as authored-space grayscale, which is what an external depth
   * pass dropped in via NEXT_PUBLIC_DEPTH_URL will be.
   */
  roomDepth?: RoomDepth | null;
  seed?: number;
};

type DepthPlate = {
  width: number;
  height: number;
  /** 1 = nearest surface, 0 = furthest. Normalised to the plate's own extent. */
  depth: Float32Array;
  /** How much to trust `depth` at this pixel vs. the authored regions. */
  coverage: Float32Array;
};

/**
 * Split a depth plate into depth and confidence.
 *
 * The pass we bake from the room mesh carries depth in red and coverage in
 * green, with blue pinned to zero — the mesh holds only the two figures and the
 * bed, so the wall, the lamp and the blinded window have no geometry there and
 * have to keep their authored depth. Any other grayscale image is taken as
 * trusted everywhere.
 */
function readDepthPlate(image: ImageData): DepthPlate {
  const { width, height, data } = image;
  const pixels = width * height;

  let hasBlue = false;
  const stride = Math.max(1, Math.floor(pixels / 4096));
  for (let i = 0; i < pixels; i += stride) {
    if (data[i * 4 + 2] > 4) {
      hasBlue = true;
      break;
    }
  }

  const depth = new Float32Array(pixels);
  const coverage = new Float32Array(pixels);

  for (let i = 0; i < pixels; i++) {
    depth[i] = data[i * 4] / 255;
    coverage[i] = hasBlue ? 1 : data[i * 4 + 1] / 255;
  }

  return { width, height, depth, coverage };
}

/**
 * Turn a photographic plate into a splat field.
 *
 * Density follows luminance, so lit regions resolve into detail while shadow
 * thins out into individual motes. Depth comes from the authored regions plus
 * luminance relief and a low-frequency noise field, which keeps surfaces from
 * reading as flat cards when the camera drifts.
 */
export function buildFromPlate(
  plate: ImageData,
  options: PlateBuildOptions,
): SplatBuffers {
  const { width: imgW, height: imgH, data } = plate;
  const random = mulberry32(options.seed ?? 0x5a3ee7);
  const build = options.build ?? buildTuning();

  const worldWidth = build.worldWidth;
  const worldHeight = worldWidth * (imgH / imgW);
  const worldDepth = build.worldDepth;
  const worldCenter = build.worldCenter;
  const roomDepth = options.roomDepth ?? null;

  /**
   * The distance the lens that took this photograph would have been at. Splats
   * are scaled about this point by their depth, so viewed from here the cloud
   * reproduces the plate exactly — and any camera movement away from it reveals
   * true parallax rather than a stack of sliding cards.
   */
  const lensDistance = plateLensDistance(worldHeight, build.fov);

  const sourceMap = buildSourceMap(imgW, imgH, data);
  const luminance = new Float32Array(imgW * imgH);
  let keepBudget = 0;

  for (let index = 0; index < luminance.length; index++) {
    const p = sourceMap[index] * 4;
    const luma =
      (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
    luminance[index] = luma;
    keepBudget += keepProbability(luma, build);
  }

  // Scale the per-pixel probability so we land on the requested budget. Above
  // 1.0 we supersample within each pixel, which is how the field stays dense
  // enough to read as high resolution on a large display.
  const densityScale = keepBudget > 0 ? options.targetCount / keepBudget : 1;
  const samplesPerPixel = Math.max(1, Math.ceil(densityScale));
  const perSampleScale = densityScale / samplesPerPixel;

  const capacity = Math.ceil(options.targetCount * 1.2) + 4096;
  const position = new Float32Array(capacity * 3);
  const color = new Float32Array(capacity * 3);
  const scale = new Float32Array(capacity * 2);
  const rotation = new Float32Array(capacity);
  const seed = new Float32Array(capacity * 3);
  const luma = new Float32Array(capacity);

  const depthPlate = options.depthData ? readDepthPlate(options.depthData) : null;
  let count = 0;

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const index = y * imgW + x;
      const pixelLuma = luminance[index];
      const probability = keepProbability(pixelLuma, build) * perSampleScale;
      if (probability <= 0) continue;

      for (let s = 0; s < samplesPerPixel; s++) {
        if (random() > probability) continue;
        if (count >= capacity) break;

        // Jitter inside the pixel footprint so supersampling does not stack.
        const u = (x + random()) / imgW;
        const v = (y + random()) / imgH;

        // Authored depth is a layer index; the mesh gives a real position. They
        // are blended in world space rather than in depth space, because the two
        // are on different scales and only metres are comparable.
        let z = (depthAt(u, v) - 0.5) * worldDepth + worldCenter;
        let measured = 0;
        if (depthPlate && roomDepth) {
          const dx = Math.min(depthPlate.width - 1, (u * depthPlate.width) | 0);
          const dy = Math.min(depthPlate.height - 1, (v * depthPlate.height) | 0);
          const index = dy * depthPlate.width + dx;
          measured = depthPlate.coverage[index];
          if (measured > 0) {
            const sample = depthPlate.depth[index];
            const zMeasured = roomDepth
              ? roomDepthToWorldZ(sample, roomDepth, lensDistance)
              : (sample - 0.5) * worldDepth + worldCenter;
            z += (zMeasured - z) * measured;
          }
        }

        // Where real geometry drives the depth it already carries the surface
        // relief, so the luminance-and-noise stand-in is faded out to avoid
        // roughening a shape that is already correct.
        const invented = 1 - measured * 0.8;
        z +=
          ((pixelLuma - 0.5) * build.reliefFromLuma * 0.1 +
            (valueNoise(u * 7.3, v * 7.3) - 0.5) * build.reliefNoise * 0.1) *
          invented;

        // Foreshorten by depth so every layer projects back onto the plate.
        const perspective = (lensDistance - z) / lensDistance;

        const p3 = count * 3;
        position[p3] = (u - 0.5) * worldWidth * perspective;
        position[p3 + 1] = (0.5 - v) * worldHeight * perspective;
        position[p3 + 2] = z;

        const src = sourceMap[index] * 4;
        // Slight saturation lift keeps the sepia palette from going muddy once
        // the tonemapper has its way with it.
        const r = srgbToLinear(data[src]);
        const g = srgbToLinear(data[src + 1]);
        const b = srgbToLinear(data[src + 2]);
        const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        color[p3] = grey + (r - grey) * 1.12;
        color[p3 + 1] = grey + (g - grey) * 1.12;
        color[p3 + 2] = grey + (b - grey) * 1.12;

        const jitter = 1 - build.radiusJitter * 0.5 + random() * build.radiusJitter;
        // Foreshortened alongside position, so screen-space splat size stays
        // even across the depth of the volume.
        const radius =
          build.baseRadius * jitter * perspective * (1 + pixelLuma * build.radiusLumaGain);
        const aspect = build.aspectMin + random() * (build.aspectMax - build.aspectMin);
        const p2 = count * 2;
        scale[p2] = radius;
        scale[p2 + 1] = radius * aspect;
        rotation[count] = random() * Math.PI;

        seed[p3] = random();
        seed[p3 + 1] = random();
        seed[p3 + 2] = random();
        luma[count] = pixelLuma;
        count++;
      }
      if (count >= capacity) break;
    }
    if (count >= capacity) break;
  }

  count = addDust(
    { position, color, scale, rotation, seed, luma },
    count,
    capacity,
    Math.floor(options.targetCount * build.dustRatio),
    { worldWidth, worldHeight, worldDepth, worldCenter, lensDistance },
    build,
    random,
  );

  return {
    count,
    position: position.subarray(0, count * 3),
    color: color.subarray(0, count * 3),
    scale: scale.subarray(0, count * 2),
    rotation: rotation.subarray(0, count),
    seed: seed.subarray(0, count * 3),
    luma: luma.subarray(0, count),
    bounds: { width: worldWidth, height: worldHeight, depth: worldDepth },
  };
}

function keepProbability(pixelLuma: number, build: BuildTuning) {
  if (pixelLuma >= build.lumaKeepAlways) return 1;
  const t = smoothstep(build.lumaFloor, 1, pixelLuma);
  return Math.pow(t, build.lumaBias);
}

type MutableBuffers = {
  position: Float32Array;
  color: Float32Array;
  scale: Float32Array;
  rotation: Float32Array;
  seed: Float32Array;
  luma: Float32Array;
};

/**
 * Suspended motes filling the volume between the plate surfaces. Without these
 * the cloud has no air in it, and air is most of what sells depth.
 */
function addDust(
  buffers: MutableBuffers,
  startCount: number,
  capacity: number,
  dustCount: number,
  world: {
    worldWidth: number;
    worldHeight: number;
    worldDepth: number;
    worldCenter: number;
    lensDistance: number;
  },
  build: BuildTuning,
  random: () => number,
) {
  let count = startCount;
  for (let i = 0; i < dustCount && count < capacity; i++) {
    const p3 = count * 3;
    // Biased toward the centre of frame and the front half of the volume.
    const u = 0.5 + (random() - 0.5) * 1.15;
    const v = 0.5 + (random() - 0.5) * 1.1;
    const z =
      world.worldCenter + (Math.pow(random(), 0.7) - 0.35) * world.worldDepth;
    const perspective = (world.lensDistance - z) / world.lensDistance;

    buffers.position[p3] = (u - 0.5) * world.worldWidth * perspective;
    buffers.position[p3 + 1] = (0.5 - v) * world.worldHeight * perspective;
    buffers.position[p3 + 2] = z;

    // Dust should be felt, not counted. Anything brighter reads as snow.
    const warmth = 0.4 + random() * 0.6;
    buffers.color[p3] = 0.1 * warmth;
    buffers.color[p3 + 1] = 0.075 * warmth;
    buffers.color[p3 + 2] = 0.042 * warmth;

    const radius = build.baseRadius * perspective * (0.4 + random() * 0.9);
    const p2 = count * 2;
    buffers.scale[p2] = radius;
    buffers.scale[p2 + 1] = radius * (0.8 + random() * 0.5);
    buffers.rotation[count] = random() * Math.PI;
    buffers.seed[p3] = random();
    buffers.seed[p3 + 1] = random();
    buffers.seed[p3 + 2] = random();
    buffers.luma[count] = 0.25 + random() * 0.3;
    count++;
  }
  return count;
}

/**
 * Parse a real gaussian-splat capture in the 32-byte `.splat` layout:
 * position (3 × f32), scale (3 × f32), colour (4 × u8), rotation (4 × u8 quat).
 *
 * The cloud is recentred and scaled to the same world box the plate field uses,
 * so swapping sources needs no other change.
 */
export function parseSplatFile(buffer: ArrayBuffer): SplatBuffers {
  const BYTES_PER_SPLAT = 32;
  const total = Math.floor(buffer.byteLength / BYTES_PER_SPLAT);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const random = mulberry32(0x51a7);

  const rawPosition = new Float32Array(total * 3);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < total; i++) {
    const base = i * BYTES_PER_SPLAT;
    const x = view.getFloat32(base, true);
    const y = view.getFloat32(base + 4, true);
    const z = view.getFloat32(base + 8, true);
    rawPosition[i * 3] = x;
    rawPosition[i * 3 + 1] = y;
    rawPosition[i * 3 + 2] = z;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const spanX = Math.max(maxX - minX, 1e-4);
  const spanY = Math.max(maxY - minY, 1e-4);
  const spanZ = Math.max(maxZ - minZ, 1e-4);
  const fit = Math.min(WORLD.width / spanX, WORLD.height / spanY, WORLD.depth / spanZ);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const centreZ = (minZ + maxZ) / 2;

  const position = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const scale = new Float32Array(total * 2);
  const rotation = new Float32Array(total);
  const seed = new Float32Array(total * 3);
  const luma = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const base = i * BYTES_PER_SPLAT;
    const p3 = i * 3;
    position[p3] = (rawPosition[p3] - centreX) * fit;
    position[p3 + 1] = (rawPosition[p3 + 1] - centreY) * fit;
    position[p3 + 2] = (rawPosition[p3 + 2] - centreZ) * fit;

    const r = srgbToLinear(bytes[base + 24]);
    const g = srgbToLinear(bytes[base + 25]);
    const b = srgbToLinear(bytes[base + 26]);
    color[p3] = r;
    color[p3 + 1] = g;
    color[p3 + 2] = b;
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Covariance is stored as three axis scales; the two largest describe the
    // ellipse we draw. Good enough without full covariance projection.
    const sx = Math.abs(view.getFloat32(base + 12, true)) * fit;
    const sy = Math.abs(view.getFloat32(base + 16, true)) * fit;
    const sz = Math.abs(view.getFloat32(base + 20, true)) * fit;
    const axes = [sx, sy, sz].sort((a, c) => c - a);
    const p2 = i * 2;
    scale[p2] = Math.max(axes[0], 1e-4);
    scale[p2 + 1] = Math.max(axes[1], 1e-4);

    const qw = (bytes[base + 28] - 128) / 128;
    const qx = (bytes[base + 29] - 128) / 128;
    const qy = (bytes[base + 30] - 128) / 128;
    rotation[i] = Math.atan2(2 * (qw * qx + qy * qw), 1 - 2 * (qx * qx + qy * qy));

    seed[p3] = random();
    seed[p3 + 1] = random();
    seed[p3 + 2] = random();
  }

  return {
    count: total,
    position,
    color,
    scale,
    rotation,
    seed,
    luma,
    bounds: { width: spanX * fit, height: spanY * fit, depth: spanZ * fit },
  };
}

/** Decode an image URL into pixels, off the main thread where supported. */
export async function loadImageData(url: string): Promise<ImageData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`plate fetch failed: ${response.status}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement("canvas"), {
          width: bitmap.width,
          height: bitmap.height,
        });

  const context = (canvas as HTMLCanvasElement).getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | null;
  if (!context) throw new Error("2d context unavailable");

  context.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return imageData;
}
