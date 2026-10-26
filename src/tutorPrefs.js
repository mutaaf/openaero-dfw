// The autopilot tutor's remembered on/off (openaero_tutor_v1) and its blank state, at boot;
// the tutor itself (apTutor.js) is a lazy chunk. Pure apart from the storage passed in.
export const TUTOR_KEY = 'openaero_tutor_v1';

export const createTutor = () => ({ caption: null, shownS: 0, pending: null, pendingS: 0 });

// The tutor is on unless the player turned it off (remembered).
export function tutorOn(storage) {
  try {
    const data = JSON.parse(storage.getItem(TUTOR_KEY) || 'null');
    return !(data && data.v === 1 && data.on === false);
  } catch {
    return true;
  }
}

export function setTutorOn(storage, on, now = Date.now()) {
  try { storage.setItem(TUTOR_KEY, JSON.stringify({ v: 1, on, at: now })); } catch { /* private mode */ }
}
