# Aircraft model sources (ticket 0045)

Each model here is the plain glTF exported from its source; `node scripts/build-models.mjs`
turns it into the compressed file the game loads from `public/models/`. Credits for every
shipped model are in `public/CREDITS.md` (shown from the start screen's Credits link).

| File | Source | Licence | Drawn for |
|---|---|---|---|
| `twinjet.glb` | "jet airplane" by weirdybeardyman, https://opengameart.org/content/jet-airplane (`passengerjet_gear_down.blend`) | CC0 1.0 | `b738` |

## Rebuilding `twinjet.glb`

The source `.blend` is not committed (it references livery images it doesn't contain, and
the export below is all we use). With Blender's Python module (Python 3.13):

    curl -LO https://opengameart.org/sites/default/files/passengerjet_gear_down.blend
    uv venv -p 3.13 .bpy && uv pip install -p .bpy/bin/python bpy
    .bpy/bin/python -I scripts/models/blend-to-glb.py -- passengerjet_gear_down.blend assets-src/models/twinjet.glb twinjet
    node scripts/build-models.mjs

`blend-to-glb.py` repaints it plainly (no airline livery: the CC licence or CC0 dedication
covers the mesh, never a brand), names the nodes `body`, `engines`, `gear_*`, and puts it in
the physics body frame (nose -Z, metres, lowest wheel at -gearHeight). The unit test
`tests/unit/aircraftModel.test.js` checks the shipped file against all of that.

## Rules for the next models

- Licence CC0, CC-BY or public domain only (FlightGear's models are GPL: ruled out). Neutral
  names, no real airline or air-force liveries.
- ≤ 3 MB per aircraft on the wire; a model above ~25k triangles gets LODs (THREE.LOD with
  hysteresis), textures go to KTX2 (needs KTX-Software's `toktx` in build-models.mjs).
- Moving parts (0063) are separate nodes named `ctl_aileron_L/R`, `ctl_elevator`,
  `ctl_rudder`, `ctl_flap_L/R`, `gear_*`, `prop`, `fan_L/R`, pivots on the hinge lines.
- The CC-BY candidates the operator can download (Sketchfab login) are listed in
  `docs/backlog/0045-gltf-aircraft-pipeline.md`.
