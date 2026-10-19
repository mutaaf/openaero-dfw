// Adaptive render resolution (ticket 0026). Pure: main.js feeds it each frame's length and
// applies the pixel ratio it returns. Long frames step the ratio down a rung once a second;
// it climbs back one rung only after a sustained run of fast frames, and that cool-down
// doubles each time a step up turns straight back into slow frames, so a borderline
// device settles instead of ping-ponging. Fill cost scales with ratio², so 2 → 1.5 is
// ~44% fewer pixels.

export const RES_STEPS = [2, 1.5, 1.25, 1];
export const RES_SLOW_MS = 22;     // a 1 s average above this steps down (~45 fps)
export const RES_FAST_MS = 13;     // a 1 s average below this counts towards stepping up
export const RES_WINDOW_MS = 1000; // frames are judged one second at a time
export const RES_COOL_S = 5;       // seconds of fast frames before stepping up
export const RES_MAX_COOL_S = 60;
export const RES_PROBE_S = 3;      // slow again this soon after a step up: back off
export const RES_SPIKE_MS = 250;   // a longer frame is a stall (tab switch, GC), not load...
export const RES_SPIKE_RUN = 3;    // ...unless this many come in a row: then it is load
export const RES_GRACE_MS = 1000;  // after a reset (flight start, unpause) the first second is loading
export const RES_RELAX_S = 120;    // this long without stepping down: the cool-down backs off no more

// The rungs this device can use: its own ratio capped at 2, then every lower step, floor 1
// (a zoomed-out screen under 1 keeps its own ratio and never moves).
export function resLadder(deviceRatio) {
  const top = Math.min(deviceRatio > 0 && Number.isFinite(deviceRatio) ? deviceRatio : 1, RES_STEPS[0]);
  return [top, ...RES_STEPS.filter((r) => r < top)];
}

export function createResScale(deviceRatio) {
  const ladder = resLadder(deviceRatio);
  return {
    ladder,
    rung: 0,
    ratio: ladder[0],
    winMs: 0,          // this window's frame time so far
    winN: 0,           // frames in it
    fastS: 0,          // consecutive fast seconds
    coolS: RES_COOL_S, // fast seconds needed to step up (backs off)
    sinceUpS: Infinity,
    sinceDownS: 0,
    longRun: 0,        // consecutive frames over RES_SPIKE_MS
    graceMs: RES_GRACE_MS,
  };
}

// Frames stop counting (modal, pause, hidden tab): drop the partial window and let the
// first second after resuming pass unjudged (shader compiles, tile loads).
export function resetResScale(st) {
  st.winMs = 0;
  st.winN = 0;
  st.fastS = 0;
  st.longRun = 0;
  st.graceMs = RES_GRACE_MS;
}

// One rendered frame of `dtMs`. Returns true on the frame the ratio changes.
export function stepResScale(st, dtMs) {
  if (!(dtMs > 0)) return false;
  if (dtMs > RES_SPIKE_MS) {
    // One stall is ignored; a run of them is a device drawing at a few fps: count it.
    if (++st.longRun < RES_SPIKE_RUN) return false;
    dtMs = RES_SPIKE_MS;
  } else st.longRun = 0;
  if (st.graceMs > 0) {
    st.graceMs -= dtMs;
    return false;
  }
  st.winMs += dtMs;
  st.winN++;
  if (st.winMs < RES_WINDOW_MS) return false;

  const windowS = st.winMs / 1000;
  const avg = st.winMs / st.winN;
  st.winMs = 0;
  st.winN = 0;
  st.sinceUpS += windowS;
  st.sinceDownS += windowS;
  if (st.sinceDownS >= RES_RELAX_S) st.coolS = RES_COOL_S;

  if (avg > RES_SLOW_MS) {
    st.fastS = 0;
    if (st.rung >= st.ladder.length - 1) return false;
    if (st.sinceUpS <= RES_PROBE_S) st.coolS = Math.min(st.coolS * 2, RES_MAX_COOL_S);
    st.sinceDownS = 0;
    st.ratio = st.ladder[++st.rung];
    return true;
  }
  if (avg >= RES_FAST_MS) {
    st.fastS = 0;
    return false;
  }
  st.fastS += windowS;
  if (st.rung === 0 || st.fastS < st.coolS) return false;
  st.fastS = 0;
  st.sinceUpS = 0;
  st.ratio = st.ladder[--st.rung];
  return true;
}
