// Browser loader for the JSBSim flight model (?fdm=jsbsim): a separate chunk, imported only
// once the player starts flying, that fetches the LGPL JSBSim .wasm (bundled from npm, own
// origin) and our aircraft files (public/jsbsim/), then hands back the adapter.
import { JSBSimSdk } from '@0x62/jsbsim-wasm';
import moduleUrl from '@0x62/jsbsim-wasm/wasm/module?url';
import wasmUrl from '@0x62/jsbsim-wasm/wasm/binary?url';
import { createJsbsimFdm, JSBSIM_FILES, JSBSIM_MODELS } from './jsbsim.js';

export async function loadJsbsim(base) {
  const text = (f) => fetch(`${base}jsbsim/${f}`).then((r) => {
    if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
    return r.text();
  });
  const [sdk, files] = await Promise.all([
    JSBSimSdk.create({ moduleUrl: new URL(moduleUrl, window.location.href), wasmUrl: new URL(wasmUrl, window.location.href), log: { console: false } }),
    Promise.all(JSBSIM_FILES.map(text)),
  ]);
  JSBSIM_FILES.forEach((f, i) => sdk.writeDataFile(f, files[i]));
  sdk.configurePaths({ rootDir: '/runtime', aircraftPath: 'aircraft', enginePath: 'engine', systemsPath: 'systems' });
  const fdm = createJsbsimFdm(sdk, 'c172');
  return { ...fdm, flies: (aircraftKey) => Object.prototype.hasOwnProperty.call(JSBSIM_MODELS, aircraftKey) };
}
