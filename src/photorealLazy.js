// The boot-time face of photoreal.js (ticket 0084): the Google 3D Tiles code (and the
// googleSession bookkeeping) is only needed once someone presses Fly on the live origin, so it
// is its own chunk, loaded by start(). Until then this stands in with photoreal.js's API: an
// "off" state, and calls that do nothing (setVisible is remembered and applied on load).

export const PHOTOREAL_ORIGINS = ['https://mutaafaziz.com'];

// The key is referrer-restricted to mutaafaziz.com/openaero/*: elsewhere (previews,
// localhost) Google would refuse, so don't ask. `?photoreal` forces it (tests, debugging).
export function photorealAllowed(loc) {
  return PHOTOREAL_ORIGINS.includes(loc.origin) || new URLSearchParams(loc.search).has('photoreal');
}

export function createLazyPhotoreal(opts, load = () => import('./photoreal.js')) {
  const idle = { status: 'off', reason: '', visibleTiles: 0, loadedTiles: 0, calibM: 0, calibSamples: 0, attributions: '' };
  let impl = null;
  let loading = null;
  let visible = null;

  return {
    get state() { return impl ? impl.state : idle; },
    get session() { return impl ? impl.session : null; },
    start(configUrl) {
      if (impl) return impl.start(configUrl);
      if (loading) return loading;
      idle.status = 'starting';
      loading = load().then(({ createPhotoreal }) => {
        impl = createPhotoreal(opts);
        if (visible !== null) impl.setVisible(visible);
        return impl.start(configUrl);
      }).catch((err) => { // the chunk failed to load (or to build): the free terrain stays
        if (impl) return;
        idle.status = 'unavailable';
        idle.reason = err?.message || 'error';
        opts.onUnavailable?.(idle.reason);
      });
      return loading;
    },
    update(dt) { impl?.update(dt); },
    setVisible(v) { visible = v; impl?.setVisible(v); },
    resize() { impl?.resize(); },
    noteSessionReuse() { impl?.noteSessionReuse(); },
    bounds() { return impl ? impl.bounds() : null; },
  };
}
