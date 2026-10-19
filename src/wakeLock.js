// Screen Wake Lock while flying (ticket 0032): a phone must not dim in the middle of a
// 2-minute approach that needs no touch. main.js calls sync(wanted) every frame; this only
// acts on a change, so it costs a couple of comparisons per frame and allocates nothing.
// Feature-detected and best-effort: unsupported, rejected or system-released locks are
// silent (no console output); a rejected request is retried only when flying starts again.

// Flying = in the cockpit, not paused, the tab visible and no results card up.
// Positional booleans: it runs every frame, so no options object is allocated.
export function wantWakeLock(paused, hidden, modalOpen, resultsOpen) {
  return !paused && !hidden && !modalOpen && !resultsOpen;
}

export function createWakeLock(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  const api = typeof nav?.wakeLock?.request === 'function' ? nav.wakeLock : null;
  const lock = { held: false, sync };
  let sentinel = null, wanted = false, pending = false, armed = true;
  const drop = (s) => s.release().catch(() => {}); // a second release just resolves

  function request() {
    pending = true;
    armed = false;
    new Promise((ok) => ok(api.request('screen'))).then((s) => {
      pending = false;
      if (!wanted) return drop(s);
      sentinel = s;
      lock.held = true;
      // The system lets go on its own (tab hidden, battery saver): allow one fresh request.
      s.onrelease = () => {
        if (sentinel !== s) return;
        sentinel = null;
        armed = true;
        lock.held = false;
      };
    }, () => { pending = false; });
  }

  function sync(want) {
    if (!api) return;
    if (want !== wanted) {
      wanted = want;
      if (want) armed = true;
      else if (sentinel) {
        const s = sentinel;
        sentinel = null;
        lock.held = false;
        drop(s);
      }
    }
    if (want && !sentinel && !pending && armed) request();
  }

  return lock;
}
