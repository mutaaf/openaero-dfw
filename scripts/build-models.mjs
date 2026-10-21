// Optimises the aircraft models the game draws (src/aircraftModel.js).
//
//   node scripts/build-models.mjs
//
// Input: assets-src/models/<name>.glb, plain glTF exported from each source by
// scripts/models/blend-to-glb.py (sources, licences and steps: assets-src/models/README.md).
// Output: public/models/<name>-v<N>.glb, meshopt-compressed (EXT_meshopt_compression,
// quantized, decoded in the browser by three's bundled MeshoptDecoder: no CDN). Bump the
// version in the file name when a model changes so browsers never mix old and new.
// Textured models will add KTX2 here (needs KTX-Software's `toktx`); twinjet has none.
// The output is committed.
import { mkdirSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

export const MODELS = [{ src: 'assets-src/models/twinjet.glb', out: 'public/models/twinjet-v1.glb' }];

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
mkdirSync('public/models', { recursive: true });
for (const { src, out } of MODELS) {
  const doc = await io.read(src);
  await doc.transform(dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  console.log(`${src} (${statSync(src).size} B) -> ${out} (${statSync(out).size} B)`);
}
