// Wind cones (ticket 0027): a lit, orange-and-white windsock beside the touchdown zone of every
// runway end, streaming downwind in the field's own METAR wind, so a pilot on short final reads
// the wind the way it is really read. A lazy chunk after boot: one InstancedMesh for the masts,
// one for the socks (two draw calls for all of them), matrices rewritten in place each frame.
//
// The sock moves by its own physics, not keyframes (AGENTS.md pillar 0): the fabric cone hangs
// where its drag (∝ V²) balances its weight, and swings to that angle and to the wind's bearing
// as a damped pendulum, so a gust lifts it and it settles back. The wind is the METAR's 10 m wind
// thinned to the cone's height by the same log law the aircraft feels (weather.js
// surfaceWindFactor) and gusting on the same curve (weather.js gustFactor). The extension is
// normalised so the cone stands straight out at 15 kt, the speed at which FAA AC 150/5345-27
// (Specification for Wind Cone Assemblies) requires a cone to be fully extended; it moves from
// about 3 kt, the speed the same AC says it must respond to.
import * as THREE from 'three';
import { courseVector } from './airports.js';

const FT = 0.3048;
const DEG = Math.PI / 180;
// A size 2 cone (12 ft long, 36 in throat, ~18 in tail) on a ~20 ft mast.
export const SOCK = { lengthM: 12 * FT, throatM: 0.9, tailM: 0.45, mastM: 6 };
export const FULL_KTS = 15;   // straight out (AC 150/5345-27)
export const RESPONSE_KTS = 3; // starts to lift
// Drag/weight ratio of the cone at FULL_KTS: tan(hang) = K (V / FULL)². Normalised by atan(K),
// so 15 kt is exactly 90°; K = 12 puts 3 kt at ~24° off the mast, 5 kt ~49°, 10 kt ~80°.
const K = 12;
const ATAN_K = Math.atan(K);
// The pendulum: ~0.5 Hz, under-damped like a real cone in a gust.
const OMEGA = 3.2;
const ZETA = 0.45;
// Siting: about where the FAA puts a supplemental wind cone, ~1,000 ft in from the landing
// threshold and ~400 ft to the pilot's left, outside the runway's safety area; moved to the right
// or further out when a parallel runway is there.
const SITE_ALONG_M = 1000 * FT;
const SITE_OFF_M = 400 * FT;
const CLEAR_M = 45; // from any runway's edge

// The cone's angle off the mast (0 = hanging limp, 90 = straight out) in a steady wind.
export function hangDeg(kts) {
  if (!(kts > 0)) return 0;
  const s = Math.min(1, kts / FULL_KTS);
  return (90 * Math.atan(K * s * s)) / ATAN_K;
}

// Pure: where the sock is heading for at time t. yawDeg is the true bearing it points to
// (downwind: the METAR gives where the wind comes from), null when there is no direction
// (calm or VRB: it keeps the way it was). extensionDeg is hangDeg of the gusting wind, plus a
// small flutter in the yaw that grows with the wind (the fabric's shedding), never above 3°.
export function windsockPose(windDirDeg, speedKt, gustKt, t, gustAt = null, out = { yawDeg: 0, extensionDeg: 0 }) {
  const v = gustAt ? gustAt(t, speedKt, gustKt) : speedKt;
  out.extensionDeg = hangDeg(v);
  if (windDirDeg === null || windDirDeg === undefined || !(v > 0.5)) {
    out.yawDeg = null;
    return out;
  }
  const flutter = Math.min(3, 0.15 * v) * Math.sin(t * (2 + 0.25 * v) + windDirDeg);
  out.yawDeg = (((windDirDeg + 180 + flutter) % 360) + 360) % 360;
  return out;
}

// One sub-step of the pendulum for sock i in `st` (Float32Arrays yaw, yawRate, ext, extRate,
// degrees). Allocates nothing. Takes the shortest way round to a new bearing.
export function stepWindsock(st, i, pose, dt) {
  const k = OMEGA * OMEGA, c = 2 * ZETA * OMEGA;
  if (pose.yawDeg !== null) {
    const err = ((pose.yawDeg - st.yaw[i] + 540) % 360) - 180;
    st.yawRate[i] += (k * err - c * st.yawRate[i]) * dt;
  } else st.yawRate[i] -= c * st.yawRate[i] * dt;
  st.yaw[i] = (((st.yaw[i] + st.yawRate[i] * dt) % 360) + 360) % 360;
  st.extRate[i] += (k * (pose.extensionDeg - st.ext[i]) - c * st.extRate[i]) * dt;
  st.ext[i] = Math.max(0, Math.min(95, st.ext[i] + st.extRate[i] * dt));
}

export function createWindsockState(n) {
  return { yaw: new Float32Array(n), yawRate: new Float32Array(n), ext: new Float32Array(n), extRate: new Float32Array(n) };
}

// Distance from (x, z) to a runway's pavement edge (negative inside).
function edgeDistance(r, x, z) {
  const dx = r.bx - r.ax, dz = r.bz - r.az;
  const t = Math.max(0, Math.min(1, ((x - r.ax) * dx + (z - r.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (r.ax + dx * t), z - (r.az + dz * t)) - r.widthM / 2;
}

// Pure: one site per runway end, { x, z, airport, end }: SITE_ALONG_M past the landing threshold,
// to the left (else the right) far enough out to clear every runway at its airport by CLEAR_M.
export function windsockSites(runways, endById) {
  const out = [];
  for (const r of runways) {
    const near = runways.filter((o) => o.airport === r.airport);
    for (const id of r.ends) {
      const e = endById(id);
      const d = courseVector(e.hdgT);
      const left = { x: d.z, z: -d.x };
      const bx = e.thrX + d.x * SITE_ALONG_M, bz = e.thrZ + d.z * SITE_ALONG_M;
      let site = null;
      for (let off = SITE_OFF_M; !site && off < 4 * SITE_OFF_M; off += 15) {
        for (const side of [1, -1]) {
          const x = bx + left.x * off * side, z = bz + left.z * off * side;
          if (near.every((o) => edgeDistance(o, x, z) >= CLEAR_M)) { site = { x, z }; break; }
        }
      }
      if (site) out.push({ ...site, airport: e.airport, end: e.id });
    }
  }
  return out;
}

// Five bands, orange at the throat, as on the real cones.
function sockGeometry() {
  const g = new THREE.CylinderGeometry(SOCK.tailM / 2, SOCK.throatM / 2, SOCK.lengthM, 10, 5, true).toNonIndexed();
  g.rotateZ(-Math.PI / 2);                 // the throat at -X, the tail at +X
  g.translate(SOCK.lengthM / 2, 0, 0);     // pivot at the throat
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {  // each triangle by its centre's band
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const band = Math.floor((cx / SOCK.lengthM) * 5);
    const c = band % 2 === 0 ? [1, 0.38, 0.05] : [0.97, 0.97, 0.95];
    for (let k = 0; k < 3; k++) col.set(c, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Builds the meshes. update() is called once a frame with the per-field weather.
export function createWindsocks({ runways, endById, heightAt, gustAt, surfaceFactor }) {
  const sites = windsockSites(runways, endById);
  const n = sites.length;
  const st = createWindsockState(n);
  const baseY = new Float32Array(n);
  const reseat = () => { for (let i = 0; i < n; i++) baseY[i] = heightAt(sites[i].x, sites[i].z); };
  reseat();

  const sockMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mastMat = new THREE.MeshBasicMaterial({ color: 0x6b6f73 });
  const socks = new THREE.InstancedMesh(sockGeometry(), sockMat, n);
  const mastGeo = new THREE.CylinderGeometry(0.06, 0.09, SOCK.mastM, 6, 1);
  mastGeo.translate(0, SOCK.mastM / 2, 0);
  const masts = new THREE.InstancedMesh(mastGeo, mastMat, n);
  for (const m of [socks, masts]) {
    m.frustumCulled = false; // spread over 60 km; one draw each
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const group = new THREE.Group();
  group.name = 'windsocks';
  group.add(masts, socks);

  // Settle each sock on its field's wind before the first frame.
  const pose = { yawDeg: 0, extensionDeg: 0 };
  let primed = false;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YZX');
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _base = new THREE.Color(1, 1, 1);
  const sockFactor = surfaceFactor ? surfaceFactor(SOCK.mastM) : 1;
  // A 12 ft cone is ~6 arcmin from a 1 NM final, plain to the eye but a pixel on a 720p screen:
  // like the lights, it keeps a minimum on-screen size at range: 0.5°, at most 5x life size (the eye
  // resolves ~1 arcmin, a 720p pixel at 62° is ~5).
  const MIN_RAD = 0.5 * DEG, MAX_SCALE = 5, RANGE_M = 12000;
  const state = { count: n, sites, st, baseY, scale: new Float32Array(n) };

  function update(t, dtIn, wxFor, cameraPos, night, tint) {
    const dt = Math.min(0.5, Math.max(0, dtIn || 0)); // a reset clock, a long frame
    const steps = primed ? Math.max(1, Math.ceil(dt / (1 / 30))) : 120;
    const h = primed ? dt / steps : 1 / 30;
    for (let i = 0; i < n; i++) {
      const wx = wxFor(sites[i].airport);
      const kts = (wx?.windKts || 0) * sockFactor;
      const gust = (wx?.gustKts || 0) * sockFactor;
      for (let k = 0; k < steps; k++) {
        windsockPose(wx?.windDirDeg ?? null, kts, gust, primed ? t - (steps - 1 - k) * h : t, gustAt, pose);
        if (!primed && k === 0) {
          st.yaw[i] = pose.yawDeg ?? 0;
          st.ext[i] = pose.extensionDeg;
        }
        stepWindsock(st, i, pose, h);
      }
      const x = sites[i].x, z = sites[i].z, y = baseY[i];
      const dist = Math.hypot(x - cameraPos.x, y - cameraPos.y, z - cameraPos.z);
      const sc = dist > RANGE_M ? 0 : Math.min(MAX_SCALE, Math.max(1, (dist * MIN_RAD) / SOCK.lengthM));
      state.scale[i] = sc;
      _s.set(sc, sc, sc);
      _m.compose(_p.set(x, y, z), _q.identity(), _s);
      masts.setMatrixAt(i, _m);
      // +X (the cone's axis) to the bearing it points to, dropped (90 - ext)° below the horizon.
      _e.set(0, (90 - st.yaw[i]) * DEG, -(90 - st.ext[i]) * DEG);
      _q.setFromEuler(_e);
      _m.compose(_p.set(x, y + SOCK.mastM * sc, z), _q, _s);
      socks.setMatrixAt(i, _m);
    }
    primed = true;
    masts.instanceMatrix.needsUpdate = true;
    socks.instanceMatrix.needsUpdate = true;
    // The daylight on the ground; lit at night (the cones at these fields are lit).
    const lit = 0.85 * night;
    _base.setRGB(Math.max(tint.r, lit), Math.max(tint.g, lit), Math.max(tint.b, lit));
    sockMat.color.copy(_base);
    mastMat.color.setHex(0x6b6f73).multiply(_base);
  }

  // ?debug: where each sock is and how it hangs (allocates; not per frame).
  const debug = () => sites.map((s, i) => ({
    airport: s.airport, end: s.end, x: s.x, z: s.z, y: baseY[i], groundY: heightAt(s.x, s.z),
    yawDeg: st.yaw[i], extensionDeg: st.ext[i], scale: state.scale[i], visible: group.visible,
  }));
  return { group, socks, update, reseat, debug, state };
}
