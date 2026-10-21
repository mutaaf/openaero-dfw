---
id: 0045
title: glTF aircraft pipeline (meshopt + KTX2, LOD, credits; first CC0 model)
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-10-18
pr:
---

## Why
The aircraft are built from three.js primitives in `main.js`. The people to impress are
on iPhones and iPads; a detailed, open-licensed model with moving control surfaces, gear
and props is the first thing they see in the chase view. Packaging existing assets beats
modelling our own (AGENTS.md § Package the best).

Research 2026-10-18 (no CC0/NASA 737, C172 or F-16 exists; best are CC-BY 4.0 on Sketchfab,
which needs a logged-in download by the operator):
- High-wing single: "FREE Cessna 172SP" by NLM-Group, 187k tris, 2k PBR, cockpit, "ready
  for animation" (sketchfab.com/3d-models/c9cadc2f026946da8cf9715a683739e9); lighter:
  "Cessna 172Kr" by TonyWony, 20k tris, cockpit, control surfaces (…/e104f0a64da5499d9b8b9d60dc896cf8).
- Twin-jet: "B737-800 Model" by hakai315, 239k tris (…/6cbe380405794ea69d6b0a3d144dd1af);
  AI/LOD1: "Boeing737" by manilov.ap, 28k (…/259de41be0c7410e86b7e79be33d6b3a).
- Fighter: "F-16D Block 60" by MirzaArrafiERV_45, 62k, cockpit (…/ea8edb08d79e4eafa9c794c581f88cf3).
- CC0, no login: OpenGameArt "jet airplane" by weirdybeardyman (gear up/down variants).
- Ruled out: FlightGear models (GPL-2.0), NASA 3D (no matching aircraft).
Trademarks: the CC licence covers the mesh, not the brand. Neutral names in the UI
("Twin-jet 738", "High-wing 172", "Viper"), no real airline or air-force liveries.

## What
1. `scripts/build-models.mjs` (devDependency `@gltf-transform/cli`): source `.glb` in
   `assets-src/models/` → `public/models/*.glb` with meshopt geometry, KTX2 textures
   (UASTC normals, ETC1S colour/ORM, ≤ 2048), LOD0 60–100k / LOD1 15–25k / LOD2 ~3k tris.
2. Self-hosted decoders (no CDN): copy three's `examples/jsm/libs/basis/` and the meshopt
   decoder into `public/`; `GLTFLoader` + `KTX2Loader.detectSupport(renderer)`.
3. `src/aircraftModel.js`: lazy-load after Start, keep the primitive model as the
   fallback until loaded, `THREE.LOD` with hysteresis, cockpit glb only in cockpit view.
   (Moving surfaces, gear and props are split out to 0063; this ticket only has to show
   the static model in the chase view.)
4. First asset shipped: the CC0 OpenGameArt jet (no login needed). The operator
   downloads the CC-BY models above into `assets-src/models/` for follow-up PRs;
   rigging (splitting surfaces in Blender) is noted per model in `assets-src/models/README.md`.
5. `public/CREDITS.md` (author, URL, licence, changes made) + an on-screen credits link.

## Acceptance criteria
- [ ] Boot JS budget unchanged (loaders and models lazy); each aircraft ≤ 3 MB on the wire
- [ ] No runtime request leaves our origin for models or decoders (e2e asserts)
- [ ] iPhone-size at 4x CPU throttle: frame time within budget; < 150 draw calls
- [ ] Credits visible from the start screen; licence of every shipped model is CC0/CC-BY/PD
- [ ] Works at 390x844, 844x390, 820x1180 touch and 1280x720 keyboard/mouse

## Test plan
Unit: articulation mapping (input → node rotation, signs). e2e: model loads with zero
console errors, network log has only same-origin model/decoder URLs, screenshot of
the chase view at phone and iPad sizes.

## Out of scope
Articulated control surfaces, gear and props (0063). Liveries editor, new aircraft types, ground vehicles (0043).
