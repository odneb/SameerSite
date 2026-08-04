/**
 * Offline bake of the room capture into assets the browser can afford.
 *
 * The source GLB is ~60MB of 917k triangles and four 4K textures. None of that
 * goes to the client. Instead it is rasterised here, once, from a camera fitted
 * to the plate's own composition, and the results are committed:
 *
 *   depth   depth in red, coverage in green (white = near). Gives every splat a
 *           real position on the room's geometry instead of an authored guess.
 *   meta    room-transform.json — the camera that was solved, which the runtime
 *           needs to place the mesh in the same space it put those splats.
 *   albedo  a colour render from the same camera, for checking the mesh and the
 *           painted plate actually line up
 *   survey  a contact sheet of orbit angles, for finding the framing at all
 *
 * The mesh the site renders is produced separately, by glb-mesh.mjs. Both read
 * the same source file and must be re-run together if it changes.
 *
 * Usage:
 *   npm run scene:survey -- --glb <path>
 *   npm run scene:bake   -- --glb <path> [--yaw 0 --pitch 0 --fov 32]
 */

import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const COMPONENT = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};

const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGlb(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error("not a glb");

  let offset = 12;
  let json = null;
  let bin = null;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(buffer.toString("utf8", start, start + length));
    else if (type === 0x004e4942) bin = buffer.subarray(start, start + length);
    offset = start + length;
  }

  if (!json || !bin) throw new Error("glb missing JSON or BIN chunk");
  return { json, bin };
}

/** Read an accessor into a flat typed array, honouring interleaved strides. */
function readAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  const spec = COMPONENT[accessor.componentType];
  const components = NUM_COMPONENTS[accessor.type];
  const view = json.bufferViews[accessor.bufferView];
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? components * spec.size;
  const out = new spec.array(accessor.count * components);

  const packed = stride === components * spec.size;
  if (packed) {
    const source = new spec.array(
      bin.buffer,
      bin.byteOffset + base,
      accessor.count * components,
    );
    out.set(source);
    return out;
  }

  for (let i = 0; i < accessor.count; i++) {
    const source = new spec.array(bin.buffer, bin.byteOffset + base + i * stride, components);
    out.set(source, i * components);
  }
  return out;
}

function loadMesh(file) {
  const { json, bin } = readGlb(file);
  const primitive = json.meshes[0].primitives[0];

  const position = readAccessor(json, bin, primitive.attributes.POSITION);
  const uv =
    primitive.attributes.TEXCOORD_0 != null
      ? readAccessor(json, bin, primitive.attributes.TEXCOORD_0)
      : null;
  const normal =
    primitive.attributes.NORMAL != null
      ? readAccessor(json, bin, primitive.attributes.NORMAL)
      : null;
  const index =
    primitive.indices != null ? readAccessor(json, bin, primitive.indices) : null;

  // Base colour is the only map we need for a sanity render.
  let albedo = null;
  const material = json.materials?.[primitive.material ?? 0];
  const textureIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index;
  const imageIndex =
    textureIndex != null ? json.textures[textureIndex].source : findImage(json, "base_color");

  if (imageIndex != null) {
    const image = json.images[imageIndex];
    const view = json.bufferViews[image.bufferView];
    const start = view.byteOffset ?? 0;
    const raw = bin.subarray(start, start + view.byteLength);
    albedo = jpeg.decode(raw, { useTArray: true, formatAsRGBA: true });
  }

  return { position, uv, normal, index, albedo };
}

function findImage(json, name) {
  const found = json.images?.findIndex((image) => image.name === name);
  return found != null && found >= 0 ? found : null;
}

function bounds(position) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const value = position[i + a];
      if (value < min[a]) min[a] = value;
      if (value > max[a]) max[a] = value;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/* ---------------------------------------------------------------- matrices */

function multiply(a, b) {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function perspective(fovDeg, aspect, near, far) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const out = new Float64Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** World -> view, matching three.js camera conventions (-Z forward, Y up). */
function lookAtView(eye, target, up = [0, 1, 0]) {
  const back = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const right = normalize(cross(up, back));
  const trueUp = cross(back, right);

  const out = new Float64Array(16);
  out[0] = right[0];
  out[4] = right[1];
  out[8] = right[2];
  out[1] = trueUp[0];
  out[5] = trueUp[1];
  out[9] = trueUp[2];
  out[2] = back[0];
  out[6] = back[1];
  out[10] = back[2];
  out[12] = -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]);
  out[13] = -(trueUp[0] * eye[0] + trueUp[1] * eye[1] + trueUp[2] * eye[2]);
  out[14] = -(back[0] * eye[0] + back[1] * eye[1] + back[2] * eye[2]);
  out[15] = 1;
  return out;
}

/* -------------------------------------------------------------- rasteriser */

/**
 * Z-buffered triangle fill with perspective-correct UVs.
 *
 * A rasteriser beats raycasting here by an order of magnitude: almost every
 * triangle in a 917k-tri mesh lands sub-pixel at these resolutions, so this is
 * effectively a scatter over ~1M points.
 */
function rasterize(mesh, camera, width, height, triangleStride = 1) {
  const { position, uv, normal, index } = mesh;
  const viewProjection = multiply(camera.projection, camera.view);

  const depth = new Float32Array(width * height).fill(Infinity);
  const outUv = uv ? new Float32Array(width * height * 2) : null;
  const outNormal = normal ? new Float32Array(width * height * 3) : null;
  const hit = new Uint8Array(width * height);

  const vertexCount = position.length / 3;
  const clip = new Float64Array(vertexCount * 4);
  const screen = new Float64Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    const x = position[i * 3];
    const y = position[i * 3 + 1];
    const z = position[i * 3 + 2];
    const cx = viewProjection[0] * x + viewProjection[4] * y + viewProjection[8] * z + viewProjection[12];
    const cy = viewProjection[1] * x + viewProjection[5] * y + viewProjection[9] * z + viewProjection[13];
    const cz = viewProjection[2] * x + viewProjection[6] * y + viewProjection[10] * z + viewProjection[14];
    const cw = viewProjection[3] * x + viewProjection[7] * y + viewProjection[11] * z + viewProjection[15];
    clip[i * 4] = cx;
    clip[i * 4 + 1] = cy;
    clip[i * 4 + 2] = cz;
    clip[i * 4 + 3] = cw;

    const invW = cw !== 0 ? 1 / cw : 0;
    screen[i * 3] = (cx * invW * 0.5 + 0.5) * width;
    screen[i * 3 + 1] = (1 - (cy * invW * 0.5 + 0.5)) * height;
    // View-space distance in front of the lens; clip w is exactly that.
    screen[i * 3 + 2] = cw;
  }

  const triangles = index ? index.length / 3 : vertexCount / 3;

  for (let t = 0; t < triangles; t += triangleStride) {
    const i0 = index ? index[t * 3] : t * 3;
    const i1 = index ? index[t * 3 + 1] : t * 3 + 1;
    const i2 = index ? index[t * 3 + 2] : t * 3 + 2;

    const w0 = screen[i0 * 3 + 2];
    const w1 = screen[i1 * 3 + 2];
    const w2 = screen[i2 * 3 + 2];
    // Anything crossing the lens plane is discarded rather than clipped; at
    // these framings nothing of interest is ever behind the camera.
    if (w0 <= camera.near || w1 <= camera.near || w2 <= camera.near) continue;

    const x0 = screen[i0 * 3];
    const y0 = screen[i0 * 3 + 1];
    const x1 = screen[i1 * 3];
    const y1 = screen[i1 * 3 + 1];
    const x2 = screen[i2 * 3];
    const y2 = screen[i2 * 3 + 1];

    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) continue;

    let minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    let maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
    let minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    let maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;

    const invArea = 1 / area;
    const inv0 = 1 / w0;
    const inv1 = 1 / w1;
    const inv2 = 1 / w2;

    for (let py = minY; py <= maxY; py++) {
      const sy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const sx = px + 0.5;

        let b0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) * invArea;
        let b1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) * invArea;
        let b2 = 1 - b0 - b1;
        if (b0 < 0 || b1 < 0 || b2 < 0) continue;

        // Perspective-correct weights.
        const invW = b0 * inv0 + b1 * inv1 + b2 * inv2;
        if (invW <= 0) continue;
        const z = 1 / invW;

        const pixel = py * width + px;
        if (z >= depth[pixel]) continue;

        depth[pixel] = z;
        hit[pixel] = 1;

        const c0 = (b0 * inv0) / invW;
        const c1 = (b1 * inv1) / invW;
        const c2 = (b2 * inv2) / invW;

        if (outUv) {
          outUv[pixel * 2] = c0 * uv[i0 * 2] + c1 * uv[i1 * 2] + c2 * uv[i2 * 2];
          outUv[pixel * 2 + 1] = c0 * uv[i0 * 2 + 1] + c1 * uv[i1 * 2 + 1] + c2 * uv[i2 * 2 + 1];
        }
        if (outNormal) {
          outNormal[pixel * 3] = c0 * normal[i0 * 3] + c1 * normal[i1 * 3] + c2 * normal[i2 * 3];
          outNormal[pixel * 3 + 1] =
            c0 * normal[i0 * 3 + 1] + c1 * normal[i1 * 3 + 1] + c2 * normal[i2 * 3 + 1];
          outNormal[pixel * 3 + 2] =
            c0 * normal[i0 * 3 + 2] + c1 * normal[i1 * 3 + 2] + c2 * normal[i2 * 3 + 2];
        }
      }
    }
  }

  return { depth, uv: outUv, normal: outNormal, hit, width, height };
}

/* ------------------------------------------------------------------ output */

function writePng(file, width, height, rgba) {
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

function sampleAlbedo(albedo, u, v) {
  const x = Math.min(albedo.width - 1, Math.max(0, (u - Math.floor(u)) * albedo.width | 0));
  const y = Math.min(albedo.height - 1, Math.max(0, (v - Math.floor(v)) * albedo.height | 0));
  const p = (y * albedo.width + x) * 4;
  return [albedo.data[p], albedo.data[p + 1], albedo.data[p + 2]];
}

function albedoImage(raster, albedo) {
  const { width, height, hit, uv, normal } = raster;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    if (!hit[i]) {
      rgba[p + 3] = 255;
      continue;
    }
    let color = albedo && uv ? sampleAlbedo(albedo, uv[i * 2], uv[i * 2 + 1]) : [180, 180, 180];
    if (normal) {
      // Cheap headlight so form reads even where the texture is flat.
      const nz = Math.abs(normal[i * 3 + 2]);
      const shade = 0.45 + 0.55 * Math.min(1, nz);
      color = color.map((c) => Math.min(255, c * shade));
    }
    rgba[p] = color[0];
    rgba[p + 1] = color[1];
    rgba[p + 2] = color[2];
    rgba[p + 3] = 255;
  }
  return rgba;
}

/* ------------------------------------------------------------------ camera */

function makeCamera(box, { yaw, pitch, fov, aspect, distanceScale, targetY }) {
  const centre = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2 + targetY * box.size[1],
    (box.min[2] + box.max[2]) / 2,
  ];

  // Frame the model's width and height the way the site frames the plate.
  const halfFov = (fov * Math.PI) / 360;
  const distForHeight = box.size[1] / 2 / Math.tan(halfFov);
  const distForWidth = box.size[0] / 2 / (Math.tan(halfFov) * aspect);
  const distance = Math.max(distForHeight, distForWidth) * distanceScale;

  const y = Math.sin(pitch) * distance;
  const horizontal = Math.cos(pitch) * distance;
  const eye = [
    centre[0] + Math.sin(yaw) * horizontal,
    centre[1] + y,
    centre[2] + Math.cos(yaw) * horizontal,
  ];

  const near = Math.max(0.01, distance * 0.02);
  const far = distance * 4;
  return {
    view: lookAtView(eye, centre),
    projection: perspective(fov, aspect, near, far),
    near,
    far,
    eye,
    centre,
    distance,
  };
}

/* --------------------------------------------------------------- landmarks */

/**
 * Hollywood office — three correspondences that pin the solve. Keep the count
 * low; more points with a bad mesh-to-plate pairing only over-constrains noise.
 */
const LANDMARKS = [
  {
    name: "left shutter",
    select: (p) => p[0] < -0.45 && p[0] > -0.78 && p[1] > 0.05 && p[1] < 0.45,
    target: [0.115, 0.42],
    weight: 4,
  },
  {
    name: "right shutter",
    select: (p) => p[0] > 0.45 && p[1] > 0.05 && p[1] < 0.45,
    target: [0.885, 0.42],
    weight: 4,
  },
  {
    name: "corkboard top",
    select: (p) => p[0] < -0.05 && p[0] > -0.55 && p[1] > 0.35,
    target: [0.19, 0.155],
    weight: 1,
  },
  {
    name: "desk front",
    select: (p) => p[0] > -0.78 && p[0] < -0.05 && p[1] > -0.05 && p[1] < 0.25,
    target: [0.345, 0.585],
    weight: 1,
  },
];

/**
 * Bounding-box centre per landmark rather than vertex centroid: mesh density
 * varies wildly between the retopologised faces and the flat bedding, and we
 * are matching "where does this read on screen", not centre of mass.
 */
function centroids(position) {
  const boxes = LANDMARKS.map(() => ({
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
    n: 0,
  }));

  for (let i = 0; i < position.length; i += 3) {
    const p = [position[i], position[i + 1], position[i + 2]];
    LANDMARKS.forEach((landmark, index) => {
      if (!landmark.select(p)) return;
      const box = boxes[index];
      box.n++;
      for (let a = 0; a < 3; a++) {
        if (p[a] < box.min[a]) box.min[a] = p[a];
        if (p[a] > box.max[a]) box.max[a] = p[a];
      }
    });
  }

  return boxes.map((box, index) => {
    if (!box.n) throw new Error(`landmark "${LANDMARKS[index].name}" selected nothing`);
    return {
      name: LANDMARKS[index].name,
      point: [0, 1, 2].map((a) => (box.min[a] + box.max[a]) / 2),
      target: LANDMARKS[index].target,
      weight: LANDMARKS[index].weight ?? 1,
      count: box.n,
    };
  });
}

function projectToUv(matrix, point) {
  const [x, y, z] = point;
  const cx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const cy = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const cw = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (cw <= 0) return null;
  return [(cx / cw) * 0.5 + 0.5, 1 - ((cy / cw) * 0.5 + 0.5)];
}

function cameraFromParams(box, params, fov, aspect) {
  const centre = [
    (box.min[0] + box.max[0]) / 2 + params.targetX,
    (box.min[1] + box.max[1]) / 2 + params.targetY,
    (box.min[2] + box.max[2]) / 2,
  ];
  const y = Math.sin(params.pitch) * params.distance;
  const horizontal = Math.cos(params.pitch) * params.distance;
  const eye = [
    centre[0] + Math.sin(params.yaw) * horizontal,
    centre[1] + y,
    centre[2] + Math.cos(params.yaw) * horizontal,
  ];
  return {
    view: lookAtView(eye, centre),
    projection: perspective(fov, aspect, Math.max(0.01, params.distance * 0.02), params.distance * 4),
    near: Math.max(0.01, params.distance * 0.02),
    far: params.distance * 4,
    eye,
    centre,
    distance: params.distance,
  };
}

function fitError(box, params, marks, fov, aspect) {
  const camera = cameraFromParams(box, params, fov, aspect);
  const matrix = multiply(camera.projection, camera.view);
  let error = 0;
  let weightSum = 0;
  for (const mark of marks) {
    const uv = projectToUv(matrix, mark.point);
    if (!uv) return Infinity;
    const w = mark.weight ?? 1;
    error += w * ((uv[0] - mark.target[0]) ** 2 + (uv[1] - mark.target[1]) ** 2);
    weightSum += w;
  }
  return error / Math.max(weightSum, 1);
}

/** Coarse random search then shrinking local refinement. Deterministic seed. */
function fitCamera(box, marks, fov, aspect, randomSamples = 60000, localPasses = 900) {
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  let best = { yaw: 0, pitch: 0, distance: 3, targetX: 0, targetY: 0 };
  let bestError = fitError(box, best, marks, fov, aspect);

  const ranges = {
    yaw: [-0.9, 0.9],
    pitch: [-0.5, 0.6],
    distance: [1.2, 8],
    targetX: [-0.8, 0.8],
    targetY: [-0.6, 0.6],
  };

  for (let i = 0; i < randomSamples; i++) {
    const candidate = {
      yaw: ranges.yaw[0] + random() * (ranges.yaw[1] - ranges.yaw[0]),
      pitch: ranges.pitch[0] + random() * (ranges.pitch[1] - ranges.pitch[0]),
      distance: ranges.distance[0] + random() * (ranges.distance[1] - ranges.distance[0]),
      targetX: ranges.targetX[0] + random() * (ranges.targetX[1] - ranges.targetX[0]),
      targetY: ranges.targetY[0] + random() * (ranges.targetY[1] - ranges.targetY[0]),
    };
    const error = fitError(box, candidate, marks, fov, aspect);
    if (error < bestError) {
      bestError = error;
      best = candidate;
    }
  }

  let step = 0.25;
  for (let pass = 0; pass < localPasses; pass++) {
    let improved = false;
    for (const key of Object.keys(best)) {
      for (const direction of [1, -1]) {
        const scale = key === "distance" ? 4 : 1;
        const candidate = { ...best, [key]: best[key] + direction * step * scale * 0.35 };
        const error = fitError(box, candidate, marks, fov, aspect);
        if (error < bestError) {
          bestError = error;
          best = candidate;
          improved = true;
        }
      }
    }
    if (!improved) step *= 0.6;
    if (step < 1e-6) break;
  }

  return { params: best, error: bestError, rms: Math.sqrt(bestError) };
}

/** Sweep vertical FOV — with only a few landmarks, scale and FOV are coupled. */
function fitCameraWithFov(box, marks, aspect, fovHint = 32) {
  let coarseFov = fovHint;
  let coarseError = Infinity;

  for (let fov = 26; fov <= 50; fov += 2) {
    const result = fitCamera(box, marks, fov, aspect, 12000, 400);
    if (result.error < coarseError) {
      coarseError = result.error;
      coarseFov = fov;
    }
  }

  let best = { params: null, fov: coarseFov, error: Infinity, rms: Infinity };
  for (let fov = coarseFov - 2.5; fov <= coarseFov + 2.5; fov += 0.25) {
    const result = fitCamera(box, marks, fov, aspect);
    if (result.error < best.error) {
      best = { params: result.params, fov, error: result.error, rms: result.rms };
    }
  }

  return best;
}

function plateSize(args) {
  const width = Number(args.width ?? 1024);
  const height = Number(args.height ?? Math.round(width / (16 / 9)));
  return { width, height, aspect: width / height };
}

/** Compare a low-res render against the plate luminance where the mesh hits. */
function renderScore(mesh, box, params, fov, aspect, plate, width, height, triangleStride = 1) {
  const camera = cameraFromParams(box, params, fov, aspect);
  const raster = rasterize(mesh, camera, width, height, triangleStride);
  const render = albedoImage(raster, mesh.albedo);
  let error = 0;
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!raster.hit[i]) continue;
      const px = Math.min(plate.width - 1, ((x / width) * plate.width) | 0);
      const py = Math.min(plate.height - 1, ((y / height) * plate.height) | 0);
      const q = (py * plate.width + px) * 4;
      const p = i * 4;
      const pluma =
        (0.2126 * plate.data[q] + 0.7152 * plate.data[q + 1] + 0.0722 * plate.data[q + 2]) /
        255;
      const rluma =
        (0.2126 * render[p] + 0.7152 * render[p + 1] + 0.0722 * render[p + 2]) / 255;
      error += (pluma - rluma) ** 2;
      count++;
    }
  }

  return count ? error / count : Infinity;
}

/** Refine landmark fit by matching overall render tone, and sweep FOV. */
function refineCamera(mesh, box, marks, plate, start, fovStart, aspect, width, height) {
  let bestFov = fovStart;
  let best = { ...start };
  let bestError = Infinity;

  const sampleWidth = 224;
  const sampleHeight = Math.max(64, Math.round(sampleWidth / aspect));
  const stride = 12;

  for (let fov = fovStart - 4; fov <= fovStart + 4; fov += 2) {
    const landmark = fitCamera(box, marks, fov, aspect).params;
    for (const distScale of [0.9, 1, 1.1]) {
      let candidate = { ...landmark, distance: landmark.distance * distScale };
      let error = renderScore(
        mesh,
        box,
        candidate,
        fov,
        aspect,
        plate,
        sampleWidth,
        sampleHeight,
        stride,
      );
      if (error < bestError) {
        bestError = error;
        best = candidate;
        bestFov = fov;
      }

      const steps = [
        { key: "yaw", delta: 0.015 },
        { key: "pitch", delta: 0.012 },
        { key: "distance", delta: 0.08 },
        { key: "targetX", delta: 0.02 },
        { key: "targetY", delta: 0.02 },
      ];

      for (let pass = 0; pass < 24; pass++) {
        let improved = false;
        for (const step of steps) {
          for (const direction of [1, -1]) {
            const trial = { ...candidate, [step.key]: candidate[step.key] + direction * step.delta };
            const trialError = renderScore(
              mesh,
              box,
              trial,
              fov,
              aspect,
              plate,
              sampleWidth,
              sampleHeight,
              stride,
            );
            if (trialError < error) {
              error = trialError;
              candidate = trial;
              improved = true;
              if (error < bestError) {
                bestError = error;
                best = candidate;
                bestFov = fov;
              }
            }
          }
        }
        if (!improved) break;
      }
    }
  }

  const landmarkError = fitError(box, best, marks, bestFov, aspect);
  return {
    params: best,
    fov: bestFov,
    renderError: bestError,
    rms: Math.sqrt(landmarkError / marks.length),
  };
}

/* -------------------------------------------------------------------- main */

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) args[token.slice(2)] = argv[++i];
    else args._.push(token);
  }
  return args;
}

function survey(mesh, box, args) {
  const width = Number(args.width ?? 320);
  const height = Number(args.height ?? 180);
  const angles = [];
  for (const pitch of [0.35, 0, -0.15]) {
    for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      angles.push({ yaw, pitch });
    }
  }

  const columns = 5;
  const rows = Math.ceil(angles.length / columns);
  const sheet = new Uint8Array(width * columns * height * rows * 4);
  const sheetWidth = width * columns;

  angles.forEach(({ yaw, pitch }, i) => {
    const camera = makeCamera(box, {
      yaw,
      pitch,
      fov: Number(args.fov ?? 32),
      aspect: width / height,
      distanceScale: Number(args.distanceScale ?? 1.15),
      targetY: 0,
    });
    const raster = rasterize(mesh, camera, width, height);
    const tile = albedoImage(raster, mesh.albedo);

    const ox = (i % columns) * width;
    const oy = Math.floor(i / columns) * height;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from = (y * width + x) * 4;
        const to = ((oy + y) * sheetWidth + ox + x) * 4;
        sheet[to] = tile[from];
        sheet[to + 1] = tile[from + 1];
        sheet[to + 2] = tile[from + 2];
        sheet[to + 3] = 255;
      }
    }
    process.stdout.write(
      `view yaw=${yaw.toFixed(2)} pitch=${pitch.toFixed(2)} hits=${raster.hit.reduce((a, b) => a + b, 0)}\n`,
    );
  });

  const out = args.out ?? "scripts/out/survey.png";
  writePng(out, sheetWidth, height * rows, sheet);
  console.log(`wrote ${out} (${sheetWidth}x${height * rows})`);
}

/** Percentile over hit depths, so a few stray triangles cannot set the range. */
function depthRange(depth, hit, low = 0.005, high = 0.995) {
  const values = [];
  for (let i = 0; i < depth.length; i++) if (hit[i]) values.push(depth[i]);
  if (!values.length) throw new Error("nothing was hit — check the camera");
  values.sort((a, b) => a - b);
  return {
    near: values[Math.floor(values.length * low)],
    far: values[Math.floor(values.length * high)],
    median: values[Math.floor(values.length * 0.5)],
    coverage: values.length / depth.length,
  };
}

/**
 * Fill unhit pixels by pushing the nearest known depth outward.
 *
 * Holes left black would read as a wall of splats at the far plane and cut
 * hard silhouettes into the volume; growing the neighbours keeps the field
 * continuous where the mesh simply has no surface.
 */
function fillHoles(depth, hit, width, height, passes = 64) {
  const filled = Float32Array.from(depth);
  const known = Uint8Array.from(hit);

  for (let pass = 0; pass < passes; pass++) {
    let changed = 0;
    const next = Uint8Array.from(known);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (known[i]) continue;
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (!known[n]) continue;
            sum += filled[n];
            count++;
          }
        }
        if (count) {
          filled[i] = sum / count;
          next[i] = 1;
          changed++;
        }
      }
    }
    known.set(next);
    if (!changed) break;
  }

  // Anything still unknown sits at the back of the room.
  let fallback = 0;
  let n = 0;
  for (let i = 0; i < filled.length; i++) {
    if (!known[i]) continue;
    fallback += filled[i];
    n++;
  }
  fallback = n ? fallback / n : 1;
  for (let i = 0; i < filled.length; i++) if (!known[i]) filled[i] = fallback;

  return filled;
}

/** Separable box blur. Softens the stair-stepping decimation leaves behind. */
function blur(data, width, height, radius) {
  if (radius <= 0) return data;
  const temp = new Float32Array(data.length);
  const out = new Float32Array(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let d = -radius; d <= radius; d++) {
        const nx = x + d;
        if (nx < 0 || nx >= width) continue;
        sum += data[y * width + nx];
        count++;
      }
      temp[y * width + x] = sum / count;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let d = -radius; d <= radius; d++) {
        const ny = y + d;
        if (ny < 0 || ny >= height) continue;
        sum += temp[ny * width + x];
        count++;
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

function paramsFromArgs(args, fitted) {
  return {
    yaw: Number(args.yaw ?? fitted.yaw),
    pitch: Number(args.pitch ?? fitted.pitch),
    distance: Number(args.distance ?? fitted.distance),
    targetX: Number(args.targetX ?? fitted.targetX),
    targetY: Number(args.targetY ?? fitted.targetY),
  };
}

/** Blend the render over the plate so misalignment is obvious at a glance. */
function overlayImage(raster, mesh, plate, marks, matrix) {
  const { width, height, hit } = raster;
  const render = albedoImage(raster, mesh.albedo);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      const px = Math.min(plate.width - 1, ((x / width) * plate.width) | 0);
      const py = Math.min(plate.height - 1, ((y / height) * plate.height) | 0);
      const q = (py * plate.width + px) * 4;

      if (hit[i]) {
        // Mesh in cyan-ish over the plate, so overlap reads immediately.
        rgba[p] = Math.min(255, plate.data[q] * 0.35 + render[p] * 0.5);
        rgba[p + 1] = Math.min(255, plate.data[q + 1] * 0.35 + render[p + 1] * 0.85);
        rgba[p + 2] = Math.min(255, plate.data[q + 2] * 0.35 + render[p + 2] * 0.95);
      } else {
        rgba[p] = plate.data[q] * 0.75;
        rgba[p + 1] = plate.data[q + 1] * 0.75;
        rgba[p + 2] = plate.data[q + 2] * 0.75;
      }
      rgba[p + 3] = 255;
    }
  }

  const dot = (u, v, color, size) => {
    const cx = (u * width) | 0;
    const cy = (v * height) | 0;
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (Math.abs(dx) !== size && Math.abs(dy) !== size) continue;
        const p = (y * width + x) * 4;
        rgba[p] = color[0];
        rgba[p + 1] = color[1];
        rgba[p + 2] = color[2];
      }
    }
  };

  for (const mark of marks) {
    dot(mark.target[0], mark.target[1], [255, 40, 40], 7);
    const uv = projectToUv(matrix, mark.point);
    if (uv) dot(uv[0], uv[1], [60, 255, 90], 5);
  }

  return rgba;
}

function loadPlate(file) {
  return jpeg.decode(fs.readFileSync(file), { useTArray: true, formatAsRGBA: true });
}

function fit(mesh, box, args) {
  const { width, height, aspect } = plateSize(args);
  const fov = Number(args.fov ?? 32);
  const plate = loadPlate(args.plate ?? "public/scene/hero-plate.jpg");
  const marks = centroids(mesh.position);

  for (const mark of marks) {
    console.log(
      `landmark ${mark.name.padEnd(14)} verts=${String(mark.count).padStart(7)} at [${mark.point.map((v) => v.toFixed(3)).join(", ")}] -> plate ${JSON.stringify(mark.target)}`,
    );
  }

  const landmark = fitCameraWithFov(box, marks, aspect, fov);
  const useRefine = args.refine === "true";
  const refined = useRefine
    ? refineCamera(mesh, box, marks, plate, landmark.params, landmark.fov, aspect, width, height)
    : { params: landmark.params, fov: landmark.fov, renderError: 0, rms: landmark.rms };
  const p = refined.params;
  const fitFov = refined.fov;
  console.log(
    `\nlandmark rms=${landmark.rms.toFixed(4)}  render mse=${refined.renderError.toFixed(5)}  fov=${fitFov.toFixed(1)}`,
  );
  console.log(
    `  --fov ${fitFov.toFixed(2)} --yaw ${p.yaw.toFixed(4)} --pitch ${p.pitch.toFixed(4)} --distance ${p.distance.toFixed(4)} --targetX ${p.targetX.toFixed(4)} --targetY ${p.targetY.toFixed(4)}`,
  );

  const camera = cameraFromParams(box, p, fitFov, aspect);
  const matrix = multiply(camera.projection, camera.view);
  for (const mark of marks) {
    const uv = projectToUv(matrix, mark.point);
    console.log(
      `  ${mark.name.padEnd(14)} want ${mark.target.map((v) => v.toFixed(3)).join(",")}  got ${uv ? uv.map((v) => v.toFixed(3)).join(",") : "behind camera"}`,
    );
  }

  const raster = rasterize(mesh, cameraFromParams(box, p, fitFov, aspect), width, height);
  const out = args.out ?? "scripts/out/overlay.png";
  writePng(
    out,
    width,
    height,
    overlayImage(
      raster,
      mesh,
      plate,
      marks,
      multiply(
        cameraFromParams(box, p, fitFov, aspect).projection,
        cameraFromParams(box, p, fitFov, aspect).view,
      ),
    ),
  );
  console.log(`\nwrote ${out}`);
}

function bake(mesh, box, args) {
  const { width, height, aspect } = plateSize(args);
  const fov = Number(args.fov ?? 32);
  const plate = loadPlate(args.plate ?? "public/scene/hero-plate.jpg");
  const marks = centroids(mesh.position);
  const landmark = fitCameraWithFov(box, marks, aspect, fov);
  const useRefine = args.refine === "true";
  const refined = useRefine
    ? refineCamera(mesh, box, marks, plate, landmark.params, landmark.fov, aspect, width, height)
    : { params: landmark.params, fov: landmark.fov, renderError: 0, rms: landmark.rms };
  const fitFov = refined.fov;
  const params = paramsFromArgs(args, refined.params);
  console.log(
    `camera --fov ${fitFov.toFixed(2)} --yaw ${params.yaw.toFixed(4)} --pitch ${params.pitch.toFixed(4)} --distance ${params.distance.toFixed(4)} --targetX ${params.targetX.toFixed(4)} --targetY ${params.targetY.toFixed(4)}`,
  );
  console.log(
    `landmark rms=${landmark.rms.toFixed(4)}  render mse=${refined.renderError.toFixed(5)}`,
  );
  const camera = cameraFromParams(box, params, fitFov, aspect);

  const raster = rasterize(mesh, camera, width, height);
  const range = depthRange(raster.depth, raster.hit);
  console.log(
    `camera eye=[${camera.eye.map((v) => v.toFixed(3)).join(", ")}] distance=${camera.distance.toFixed(3)}`,
  );
  console.log(
    `depth near=${range.near.toFixed(4)} far=${range.far.toFixed(4)} coverage=${(range.coverage * 100).toFixed(1)}%`,
  );

  const outDir = args.outDir ?? "public/scene";
  const filled = fillHoles(raster.depth, raster.hit, width, height);
  const smoothed = blur(filled, width, height, Number(args.blur ?? 2));

  // The mesh only contains the two figures and the bed. Everything else — the
  // wall, the lamp, the blinded window — has no geometry, so we ship a coverage
  // mask alongside and let the renderer keep its authored depth out there.
  const coverage = new Float32Array(raster.hit.length);
  for (let i = 0; i < coverage.length; i++) coverage[i] = raster.hit[i] ? 1 : 0;
  const feathered = blur(coverage, width, height, Number(args.coverageBlur ?? 6));

  const span = Math.max(range.far - range.near, 1e-6);
  const rgba = new Uint8Array(width * height * 4);
  const preview = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    // White = near, matching what buildFromPlate expects from a depth plate.
    const normalized = Math.min(1, Math.max(0, 1 - (smoothed[i] - range.near) / span));
    const depthByte = Math.round(normalized * 255);
    const coverByte = Math.round(Math.min(1, Math.max(0, feathered[i])) * 255);
    const p = i * 4;

    // Red carries depth, green carries confidence. Not meant to be looked at.
    rgba[p] = depthByte;
    rgba[p + 1] = coverByte;
    rgba[p + 2] = 0;
    rgba[p + 3] = 255;

    preview[p] = depthByte;
    preview[p + 1] = depthByte;
    preview[p + 2] = depthByte;
    preview[p + 3] = 255;
  }

  const depthFile = path.join(outDir, "hero-depth.png");
  writePng(depthFile, width, height, rgba);
  console.log(`wrote ${depthFile}`);
  writePng("scripts/out/depth-preview.png", width, height, preview);

  if (args.albedo !== "false") {
    const out = args.albedoOut ?? "scripts/out/albedo.png";
    writePng(out, width, height, albedoImage(raster, mesh.albedo));
    console.log(`wrote ${out}`);
  }

  // Everything the runtime needs to place the mesh in the site's world so it
  // lines up behind the splats under the same lens.
  const meta = {
    source: path.basename(args.glb),
    camera: { fov: fitFov, ...params, aspect },
    view: Array.from(camera.view),
    depth: { near: range.near, far: range.far, span, coverage: range.coverage },
    bounds: { min: box.min, max: box.max, size: box.size },
  };
  const metaFile = path.join(outDir, "room-transform.json");
  fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`wrote ${metaFile}`);
  console.log(
    `depth span/distance = ${(span / params.distance).toFixed(3)} (site volume ratio is worldDepth/lensDistance)`,
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? "bake";
  const glb = args.glb;
  if (!glb) throw new Error("pass --glb <path>");

  console.log(`loading ${glb}`);
  const mesh = loadMesh(glb);
  const box = bounds(mesh.position);
  console.log(
    `mesh verts=${mesh.position.length / 3} tris=${(mesh.index ? mesh.index.length : mesh.position.length) / 3}`,
  );
  console.log(
    `bounds size=[${box.size.map((v) => v.toFixed(3)).join(", ")}] albedo=${mesh.albedo ? `${mesh.albedo.width}x${mesh.albedo.height}` : "none"}`,
  );

  if (command === "survey") survey(mesh, box, args);
  else if (command === "fit") fit(mesh, box, args);
  else if (command === "bake") bake(mesh, box, args);
  else throw new Error(`unknown command: ${command}`);
}

main();
