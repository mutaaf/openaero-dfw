// Clean view (desktop): the instrument panels folded away so the world fills the screen.
// On by default; remembered as openaero_view_v1 = { v: 1, clean, at }. Pure, storage
// passed in (it may throw in private mode).
export const VIEW_KEY = 'openaero_view_v1';

export function loadCleanView(storage) {
  try {
    const data = JSON.parse(storage.getItem(VIEW_KEY) || 'null');
    return data && data.v === 1 && typeof data.clean === 'boolean' ? data.clean : true;
  } catch {
    return true;
  }
}

export function saveCleanView(storage, clean, now = Date.now()) {
  try { storage.setItem(VIEW_KEY, JSON.stringify({ v: 1, clean: !!clean, at: now })); } catch { /* private mode */ }
}
