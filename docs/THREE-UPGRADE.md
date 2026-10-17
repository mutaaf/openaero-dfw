# three.js r128 → r186 upgrade

The prototype pinned three r128 (2021) because it loaded it from a CDN. Ticket 0005 moved
it to 0.186.1 in one step. The photoreal map (Google 3D Tiles via `3d-tiles-renderer`)
needs three ≥ 0.167.

## Breaking changes that touch this code

| Change (release) | Effect here | What we did |
|---|---|---|
| Colour management on by default (r152): hex colours are sRGB, lighting runs in linear, `renderer.outputColorSpace = SRGBColorSpace` | Lit materials render in true linear space; unlit colours are unchanged | Kept the defaults (correct pipeline) |
| `Texture.encoding` → `Texture.colorSpace` (r152) | Satellite tiles are sRGB images; left as `NoColorSpace` they look washed out | `tex.colorSpace = THREE.SRGBColorSpace` on every imagery tile |
| Legacy lights removed (r155 default, r165 removed) | Lambert/Standard BRDFs now divide by π, so r128 intensities render ~3x darker | `LIGHT_SCALE = Math.PI` multiplies every ambient/sun intensity, including the Day/Sunset/Night presets |
| `*BufferGeometry` aliases removed (r144) | Not used here | None |
| `renderer.debug.checkShaderErrors` cost | Sync GPU validation per program; under SwiftShader load a lost context logs empty "Shader Error" lines | Off in production builds, on in `npm run dev` |

## Verification

Before/after screenshots of Day, Sunset, Night and the chase camera at 1280x720 and
390x844 were compared by eye: same exposure and sky; imagery is slightly richer because
it is now decoded as sRGB. JS bundle: 146 → 161 kB gz (budget 180).

## Remaining steps

None blocking. Future candidates (not tickets yet): `MeshLambertMaterial` → a PBR ground
material, WebGPU renderer (out of scope per 0005).
