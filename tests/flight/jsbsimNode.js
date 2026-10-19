// Loads JSBSim (WASM) in Node for the flight test cards, with the same data files the
// browser fetches (public/jsbsim/). See src/fdm/jsbsim.js.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSBSimSdk } from '@0x62/jsbsim-wasm';
import { wasmModuleUrl, wasmBinaryUrl } from '@0x62/jsbsim-wasm/wasm';
import { createJsbsimFdm, JSBSIM_FILES } from '../../src/fdm/jsbsim.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

export async function nodeJsbsim(model = 'c172') {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl,
    wasmUrl: wasmBinaryUrl,
    log: { console: false },
  });
  for (const f of JSBSIM_FILES) sdk.writeDataFile(f, readFileSync(join(root, 'public/jsbsim', f), 'utf8'));
  sdk.configurePaths({ rootDir: '/runtime', aircraftPath: 'aircraft', enginePath: 'engine', systemsPath: 'systems' });
  return createJsbsimFdm(sdk, model);
}
