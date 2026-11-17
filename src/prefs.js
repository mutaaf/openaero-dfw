// Player prefs (0022): sound, camera and the last mission flown, remembered between visits as
// openaero_prefs_v1 = { v: 1, sound, camera, mission, at }. Pure: the storage comes in through a
// getter (window.localStorage itself can throw in private mode), each field is validated on its
// own (a bad one falls back alone), and nothing here throws. The assist level and clean view keep
// their own keys (assists.js, viewPrefs.js); personal bests are landing.js's openaero_best.
export const PREFS_KEY = 'openaero_prefs_v1';

/** { sound, camera, mission }: sound on, the first camera and no mission unless stored and valid. */
export function loadPrefs(store, missionKeys, cameras) {
  let d;
  try { d = JSON.parse(store().getItem(PREFS_KEY)); } catch { /* unavailable or junk */ }
  if (d?.v !== 1) d = {};
  const c = d.camera;
  return {
    sound: d.sound !== false,
    camera: Number.isInteger(c) && c >= 0 && c < cameras ? c : 0,
    mission: missionKeys.includes(d.mission) ? d.mission : null,
  };
}

export function savePrefs(store, { sound, camera, mission }, at = Date.now()) {
  try { store().setItem(PREFS_KEY, JSON.stringify({ v: 1, sound, camera, mission, at })); } catch { /* private mode */ }
}
