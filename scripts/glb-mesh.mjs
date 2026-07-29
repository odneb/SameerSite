/**
 * Turn the source room capture into an asset the browser can afford to load.
 *
 * The Meshy export is ~60MB: 917k triangles, a 4K base colour and a 4K normal
 * map. It renders behind a dense splat field and is graded almost to black, so
 * almost none of that detail survives to the screen. This collapses it to a few
 * percent of the weight:
 *
 *   - simplify the geometry to a fraction of its triangles
 *   - drop the normal, roughness and emissive maps, and the tangents that only
 *     existed to serve the normal map
 *   - resize and re-encode the base colour
 *   - quantize and compress the vertex streams with meshopt
 *
 * Node transforms are baked into the vertices so object space here is the same
 * object space glb-bake.mjs solved its camera in. The two must agree or the mesh
 * and the splats will not line up.
 *
 * Usage:
 *   npm run scene:mesh -- --glb <path> [--ratio 0.12] [--texture 2048]
 */

import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  flatten,
  join,
  meshopt,
  prune,
  simplify,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) args[token.slice(2)] = argv[++i];
    else args._.push(token);
  }
  return args;
}

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function stats(document) {
  let triangles = 0;
  let vertices = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      const indices = primitive.getIndices();
      vertices += position ? position.getCount() : 0;
      triangles += indices
        ? indices.getCount() / 3
        : (position?.getCount() ?? 0) / 3;
    }
  }
  return { triangles, vertices };
}

/**
 * Strip everything the runtime shader will not read.
 *
 * The backdrop is shaded by the same three practicals as the splats, from the
 * base colour alone, so the PBR maps are dead weight. Tangents go with the
 * normal map; vertex normals stay because the lighting needs them.
 */
function stripMaterials(document) {
  for (const material of document.getRoot().listMaterials()) {
    material.setNormalTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setEmissiveTexture(null);
    material.setOcclusionTexture(null);
    material.setMetallicFactor(0);
    material.setRoughnessFactor(0.85);
    material.setEmissiveFactor([0, 0, 0]);
  }

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getAttribute("TANGENT")) primitive.setAttribute("TANGENT", null);
      for (const semantic of primitive.listSemantics()) {
        if (semantic.startsWith("TEXCOORD_") && semantic !== "TEXCOORD_0") {
          primitive.setAttribute(semantic, null);
        }
        if (semantic.startsWith("COLOR_")) primitive.setAttribute(semantic, null);
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.glb;
  if (!source) throw new Error("pass --glb <path>");

  const ratio = Number(args.ratio ?? 0.12);
  const error = Number(args.error ?? 0.004);
  const textureSize = Number(args.texture ?? 2048);
  const out = args.out ?? "public/scene/room.glb";

  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  // The compression extension picks its codec up off the IO's dependency map.
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });
  console.log(`loading ${source} (${megabytes(fs.statSync(source).size)})`);
  const document = await io.read(source);

  const before = stats(document);
  console.log(`in  tris=${before.triangles} verts=${before.vertices}`);

  for (const node of document.getRoot().listNodes()) {
    const matrix = node.getMatrix();
    const identity = matrix.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9);
    if (!identity) console.log(`baking node transform on "${node.getName()}"`);
  }

  await document.transform(
    // flatten + join bake the node hierarchy into the vertices, so the exported
    // object space matches the one the camera was solved against.
    flatten(),
    dedup(),
    join(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }),
  );

  stripMaterials(document);

  await document.transform(
    prune({ keepAttributes: false, keepLeaves: false }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [textureSize, textureSize],
      quality: Number(args.quality ?? 82),
    }),
  );

  // Quantized + compressed vertex streams. Decoded at runtime by three's
  // MeshoptDecoder, which the GLTFLoader is wired to in scene-context.
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: "high" }));

  const after = stats(document);
  console.log(
    `out tris=${after.triangles} verts=${after.vertices} (${((after.triangles / before.triangles) * 100).toFixed(1)}% of source)`,
  );

  for (const texture of document.getRoot().listTextures()) {
    console.log(
      `tex ${texture.getName()} ${texture.getMimeType()} ${texture.getSize()?.join("x")} ${megabytes(texture.getImage()?.byteLength ?? 0)}`,
    );
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const glb = await io.writeBinary(document);
  fs.writeFileSync(out, glb);
  console.log(`wrote ${out} (${megabytes(glb.byteLength)})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
