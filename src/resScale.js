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
export const RES_SPIKE_MS = 250;   // longer frames are stalls (tab switch, GC), not load

// The rungs this device can use: its own ratio capped at 2, then every lower step, floor 1.
export function resLadder(deviceRatio) {
  const top = Math.min(Math.max(Number.isFinite(deviceRatio) ? deviceRatio : 1, 1), RES_STEPS[0]);
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
  };
}

// One rendered frame of `dtMs`. Returns true on the frame the ratio changes.
export function stepResScale(st, dtMs) {
  if (!(dtMs > 0) || dtMs > RES_SPIKE_MS) return false;
  st.winMs += dtMs;
  st.winN++;
  if (st.winMs < RES_WINDOW_MS) return false;

  const windowS = st.winMs / 1000;
  const avg = st.winMs / st.winN;
  st.winMs = 0;
  st.winN = 0;
  st.sinceUpS += windowS;

  if (avg > RES_SLOW_MS) {
    st.fastS = 0;
    if (st.rung >= st.ladder.length - 1) return false;
    if (st.sinceUpS <= RES_PROBE_S) st.coolS = Math.min(st.coolS * 2, RES_MAX_COOL_S);
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
