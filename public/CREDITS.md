# OpenAero DFW: third-party credits

## JSBSim flight dynamics (`?fdm=jsbsim`)

- **JSBSim** (https://github.com/JSBSim-Team/jsbsim), © the JSBSim team, licensed under the
  **GNU Lesser General Public License v2.1** (https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html).
  The game loads it as a separate WebAssembly file (`assets/jsbsim_wasm-*.wasm`) only when
  `?fdm=jsbsim` is used. That file can be replaced with your own build of JSBSim. The JSBSim
  source is at the link above, and the exact build scripts are in the package below.
- **@0x62/jsbsim-wasm** 1.2.4-beta.4 (https://github.com/0x62/jsbsim-wasm), © Benedict Lewis,
  MIT. It is the Emscripten build of JSBSim and its TypeScript SDK.
- The aircraft, engine and propeller files JSBSim flies (`jsbsim/`) were written for
  OpenAero DFW from the Cessna 172S POH, Roskam's *Airplane Flight Dynamics* (Part I,
  App. B), the Lycoming type certificate data and NACA TR-640. They are MIT, like the rest of
  the repository, and are not derived from the GPL aircraft that ship with JSBSim.

## Imagery and elevation

- Satellite imagery © Esri, Maxar, Earthstar Geographics.
- Elevation: USGS 3DEP via AWS Terrain Tiles.
- Photorealistic 3D Tiles © Google (credited on screen while shown).
