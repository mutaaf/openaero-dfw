// OpenAero DFW: renderer, scene, 6-DOF integrator, HUD, radar, and UI wiring.
// Ported from the single-file prototype. Pure logic lives in the sibling modules
// (constants, aircraft, runways, geo, aero, input, audio); the Keeper keeps carving
// this file into focused modules with no behavior change.
import * as THREE from 'three';
import './styles.css';
import {
  M_TO_FT, FT_TO_M, NM_TO_M, DEG_TO_RAD, RAD_TO_DEG, GRAVITY, DFW_ORIGIN_LAT, DFW_ORIGIN_LON,
} from './constants.js';
import { AIRCRAFT_DATABASE } from './aircraft.js';
import { magHeadingText } from './magvar.js';
import { LANDMARKS, landmarkPos, DOWNTOWN_DALLAS } from './landmarks.js';
import {
  RUNWAY_ENDS, RUNWAYS_GEOM, runwayEnd, runwayEndById, approachGeometry, selectActiveRunway,
  approachSpawn, takeoffSpawn, courseVector, AIM_POINT_M, AIRPORT_NAMES,
} from './airports.js';
import { MISSIONS, missionByKey, crosswindMission, CROSSWIND_KEY, groupMissions } from './missions.js';
import { missionFromLink, terrainOnly, stripDeepLink, fdmFromLink } from './deeplink.js';
import { gradeLanding, loadBest, recordBest, driftAngleDeg, bestGrades, createBounceTracker, stepBounce, capBounced } from './landing.js';
import { coachText, createCoach, stepCoach, coachSeen, markCoachSeen } from './coach.js';
import { TUTOR_TEXT, createTutor, stepTutor, tutorOn, setTutorOn } from './apTutor.js';
import {
  localizerInterceptDeg, bankCommandForHeading, aileronForBank, glidepathGammaDeg,
  flareSinkMps, elevatorForPitch, autothrottleCommand, trimAoaDeg,
} from './autopilot.js';
import {
  parseMetar, scenarioWeather, windVector, gustFactor, runwayWindComponents,
  fogDensityForVisibility, metarAgeMinutes, flowForWind, pickCrosswindRunway,
} from './weather.js';
import { createTerrainLod } from './terrainLod.js';
import { createLazyPhotoreal, photorealAllowed } from './photorealLazy.js';
import { createGround, decodeDem, DEM_URL_PATH, yToFtMsl, REF_ELEV_M } from './terrain.js';
import { airAt, isaDeviationC, tasFromIas } from './atmosphere.js';
import {
  headingError, papiWhiteLights, isStallWarning, isGpwsWarning, isGearWarning, stallWarningKts,
  stabilizedGate, gateStep, isImc, ilsDots, LOC_DOT_DEG, GS_DOT_DEG, GATE_VMC_FT, GATE_IMC_FT, stallAoaDeg, vrefFor,
  takeoffCalloutIndex, TAKEOFF_CALLOUTS, TAKEOFF_CALLOUT_HUD, TAKEOFF_CALLOUT_HUD_PLAIN,
} from './aero.js';
import {
  ASSIST_LEVELS, DEFAULT_ASSIST, assistConfig, createAssistState, resetAssistState, shapeControls,
  autoConfigure, kidTargetKts, kidLocalizerBankDeg, updateDeparture, KID_CLIMB_GAMMA_DEG, assistBestKey, loadAssist, saveAssist,
} from './assists.js';
import { keys, pilotTargets, stickFromPoint, combineTargets, throttleFromPoint } from './input.js';
import { pollGamepad, BUTTON } from './gamepad.js';
import { createAudio } from './audio.js';
import { createWakeLock } from './wakeLock.js';
import { TIME_MODES, sunPreset, sunDirection, skyForSun } from './sun.js';
import { nightUniforms, cityLightsFor, setCityLights } from './nightGround.js';
import { loadCleanView, saveCleanView } from './viewPrefs.js';
import {
  headingBoxTop, HEADING_BOX_H, takeoffCallTop, TAKEOFF_CALL_H, TAKEOFF_CALL_W, cameraFovDeg,
  windBoxRect, windArrowDeg, windReadout, nearRunwayForWind,
} from './hudLayout.js';
import { stepFlightModel, trimThrottle, dihedralAileron } from './flightModel.js';
import { seedSystems, stepSystems, gearLocked, gearInTransit, systemsOf, AUTOBRAKE_LABELS } from './systems.js';
import { createResScale, stepResScale, resetResScale } from './resScale.js';
// Boot-budget trim (0078): one short name for the ~200 element lookups.
const byId = (id) => document.getElementById(id);

// --- Simulation State ---
const sim = {
  paused: false,
  aircraftKey: 'b738',
  spec: AIRCRAFT_DATABASE.b738,

  // 6-DOF Rigid Body States (World Frame)
  pos: new THREE.Vector3(0, 390, 7408), // 4 NM on KDFW 35C
  vel: new THREE.Vector3(0, -3.6, -72),
  quat: new THREE.Quaternion(),
  angVel: new THREE.Vector3(0, 0, 0),

  // Flight Parameters
  iasKts: 140, tasKts: 144, gsKts: 122, mach: 0.22,
  vsiFpm: -700, aglFt: 1270, mslFt: 1876, gLoad: 1.0,
  aoaDeg: 2.4, betaDeg: 0,

  // Controls
  throttle: 0.44, elevInput: 0, aileronInput: 0, rudderInput: 0,
  flapsIndex: 2, flapAngles: [0, 10, 25, 40], // labels for airframes without spec.flapDetentsDeg
  spoilers: 0, // ground spoiler extension 0–1 (flightModel.js)
  gearDown: true, brakesOn: false, onGround: false,
  // Systems (systems.js): the levers above are commands; gearPos/flapDeg/brakePress/
  // reverserPos are where things are. autobrake 0 OFF, 1–3, 4 MAX; reverseCmd the reverse levers.
  autobrake: 0, reverseCmd: false,
  groundY: 0, // terrain height under the aircraft (terrain.js), sim Y
  // Air (atmosphere.js): y = 0 is KDFW's elevation; ISA + the METAR's temperature/altimeter
  mslOffsetM: REF_ELEV_M, isaDevC: 0, altimInHg: 29.92, sigma: 1,

  // Autopilot
  apMaster: false, apHdgHold: false, apAltHold: false, apApproach: false,
  apPrevIasKts: null, apIasRate: 0, apGsIntegral: 0, apGsEndId: null, apAt: { trim: 0 }, // autothrottle / glidepath filter state
  targetHdgDeg: 360, targetAltFt: 1880,
  hudHdg: '', // the HUD heading box's text (0078), for tests

  // Camera System
  cameraMode: 0,
  cameraNames: ['Cockpit 3D', 'Orbit Chase', 'Spotter Flyby', 'Wing Tip', 'ATC Tower', 'Tail Drone'],
  orbitYaw: 0, orbitPitch: 0.2, orbitDist: 48,
  mouseYoke: false,

  // Environment & Layers
  timeOfDayMode: 0,
  satelliteEnabled: true,
  // Weather (weather.js): today's METARs from the edge Worker, or labelled scenario weather
  wx: scenarioWeather(),
  wxByIcao: {},
  // Today's crosswind challenge (ticket 0018): exists only while live METARs do
  crosswindMission: null,
  dynamicMissions: [],
  loadedMission: null,
  windVec: new THREE.Vector3(),
  windNowKts: 0,
  // The HUD wind readout's text (0075), refreshed with the ribbon once a second
  hudWind: windReadout(scenarioWeather(), null),
  simTime: 0,

  // Touchdown detection for the landing grade (landing.js)
  wasOnGround: false,
  airborneTime: 0,
  lastAirVsi: 0,
  landingGraded: false,
  lastLanding: null,
  audioEnabled: false,
  lastCalloutIdx: -1,
  // Takeoff callouts (0035, aero.js takeoffCalloutIndex): last one called (-1 at brake
  // release), the words called so far this roll, and until when the HUD shows the last
  takeoffCalloutIdx: -1,
  takeoffCalls: [],
  takeoffCallShownUntil: 0,
  // Stabilized-approach gate (ticket 0020): armed above the gate, evaluated once on the way down
  gateState: { armed: false, armFt: GATE_VMC_FT, done: false }, // aero.js gateStep
  gate: null, // { gateHeight, stable, failing[], runway, iasKt } for this approach, or null
  gateLines: [], // HUD lines for the failing items, built once at the gate
  gateShownUntil: 0, // sim time until which the HUD shows the verdict
  // Go-around drill (0047, goAround.js): the missed approach after an unstabilized gate;
  // null on every other mission
  goAround: null,
  // Stall recovery drill (0087, stallDrill.js): its state on that mission, else null
  stallDrill: null,

  // Input channels merged by combineTargets(): on-screen stick (touch/drag) and gamepad
  stick: { x: 0, y: 0, active: false },
  mouseStick: { x: 0, y: 0 }, // direct mouse yoke position (M), read by the assists

  // Assist level (assists.js, ticket 0042): 'kid' | 'learner' | 'pilot' (raw)
  assist: DEFAULT_ASSIST,

  // Approach guidance target (airports.js); re-picked twice a second from what you're lined up on
  activeEnd: null,
  missionKey: 'kdfw_35c_final',
  approach: { distM: 0, crossM: 0, heightAbovePathM: 0, pathHeightM: 0 },
  rwySelectTimer: 0,
  pad: null,
  inputSource: 'keyboard',
  papiWhite: null, // white lamps on the active runway's PAPI (null = no runway ahead)
};

// Math vectors
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

const simCanvas = byId('simCanvas');
const hudCanvas = byId('hudCanvas');
const hudCtx = hudCanvas.getContext('2d');
const mapCanvas = byId('mapCanvas');
const mapCtx = mapCanvas.getContext('2d');

let renderer, scene, camera, ambientLight, sunLight;
let aircraftRoot, terrainGroup, terrainLod, photoreal;
const runwayMeshes = []; // runway surface + markings: hidden under the photoreal mesh
let animRefs = { flame: null, parts: null, model: null };
let papiLamps = null; // THREE.Points, 4 lamps per runway end (RUNWAY_ENDS order)

// Render resolution: the device's pixel ratio capped at 2, stepped down on slow frames (0026).
const resScale = createResScale(window.devicePixelRatio || 1);
let resCounting = false;
// WebGL context lost and not yet restored (0034); see the webglcontextlost handler.
const gfx = { lost: false, pausedIt: false, hidPaused: false, reloadTimer: 0 };

try {
  renderer = new THREE.WebGLRenderer({
    canvas: simCanvas,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(resScale.ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // Program validation forces a synchronous GPU round-trip per shader; three recommends it
  // off in production. It stays on in `npm run dev`, where shader bugs get caught.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
} catch (err) {
  console.error('Three.js renderer init failure:', err);
}

scene = new THREE.Scene();
scene.background = new THREE.Color(0x38bdf8); // behind the sky dome; only seen if it fails
scene.fog = new THREE.FogExp2(0x94a3b8, 0.000035);
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
// The atmosphere, the real stars and Moon over DFW, and the METAR's clouds (skyDome.js):
// its own chunk, loaded right after boot; until then the sky is the plain haze colour.
let skyDome = null;
let runwayLights = null;

camera = new THREE.PerspectiveCamera(cameraFovDeg(window.innerWidth, window.innerHeight), window.innerWidth / window.innerHeight, 0.5, 95000);

// three ≥ r155 uses physically based light units: Lambert/Standard BRDFs divide by π,
// so the r128-era intensities are scaled by π to keep the same exposure (docs/THREE-UPGRADE.md).
const LIGHT_SCALE = Math.PI;

ambientLight = new THREE.AmbientLight(0xdbeafe, 0.85 * LIGHT_SCALE);
scene.add(ambientLight);

sunLight = new THREE.DirectionalLight(0xfffbeb, 1.4 * LIGHT_SCALE);
sunLight.position.set(-4500, 7500, 3500);
scene.add(sunLight);
// The real sun over DFW (sun.js), placed by placeSun() before the terrain bakes its relief.
const sun = { elevationDeg: 50, azimuthDeg: 210 };
const _sunVec = { x: 0, y: 0, z: 0 };

const audio = createAudio(sim, updateAudioButton);

function updateAudioButton() {
  const txt = byId('txtAudioState');
  const btn = byId('btnAudio');
  if (sim.audioEnabled) {
    txt.textContent = 'ON';
    txt.className = 'text-emerald-400 font-bold';
    btn.classList.add('active');
  } else {
    txt.textContent = 'OFF';
    txt.className = 'text-amber-400 font-bold';
    btn.classList.remove('active');
    audio.mute();
  }
}

// Real ground (terrain.js): one height model for physics and drawing. The streamed imagery
// (terrainLod.js) is draped on it and writes depth, so hills hide what is behind them.
// Surfaces lying on the imagery use polygon offset, which scales with depth precision and
// so holds at any distance (ticket 0002): the runway surface and markings are pulled in
// front of the imagery, the base plane is pushed behind everything.
const ground = createGround(RUNWAYS_GEOM);
const GROUND_ORDER = { imagery: -5, base: -4, runway: -3, marking: -2 }; // base after imagery: depth rejects it
const GROUND_OFFSET = { base: 8, runway: -2, marking: -4 };

// The ground is unlit: satellite imagery already carries real sunlight, and since three r151
// Lambert lights every pixel, which on a full-screen ground costs more than everything else
// combined on software GL. Each ground material is tinted with exactly what Lambert would
// give a flat, up-facing surface under the current lights (applyGroundLight); terrain
// relief gets its shading baked into vertex colours (terrainLod.js).
const groundMats = [];
const _tint = new THREE.Color();
const _sunTint = new THREE.Color();
const _sunDir = new THREE.Vector3();
function groundMaterial(opts, order, offsetKey) {
  const off = GROUND_OFFSET[offsetKey] ?? 0;
  const decal = off < 0; // runway surface and markings: drawn over the imagery, no depth write
  const m = new THREE.MeshBasicMaterial({
    ...opts,
    depthWrite: !decal,
    side: decal ? THREE.DoubleSide : THREE.FrontSide,
    polygonOffset: off !== 0,
    polygonOffsetFactor: Math.sign(off),
    polygonOffsetUnits: off,
  });
  m.userData.order = order;
  m.userData.baseColor = m.color.clone();
  groundMats.push(m);
  applyGroundLight(m);
  return m;
}
function applyGroundLight(only) {
  const nDotL = Math.max(0, _sunDir.copy(sunLight.position).normalize().y);
  _sunTint.copy(sunLight.color).multiplyScalar(sunLight.intensity * nDotL);
  _tint.copy(ambientLight.color).multiplyScalar(ambientLight.intensity).add(_sunTint).multiplyScalar(1 / Math.PI);
  for (const m of only ? [only] : groundMats) m.color.copy(m.userData.baseColor).multiply(_tint);
  if (!only) terrainLod?.setTint(_tint);
  // Photoreal tiles take the same light, relative to full day (Google's photos are daylit).
  nightUniforms.uGroundTint.value.copy(_tint).multiplyScalar(1 / DAY_TINT);
  setCityLights(cityLightsFor(sun.elevationDeg));
}
// Luminance of the flat-ground tint under the high noon sun (skyForSun(60)).
const DAY_TINT = (() => {
  const k = skyForSun(60);
  const c = new THREE.Color(k.ambient).multiplyScalar(k.ambientIntensity)
    .add(new THREE.Color(k.sun).multiplyScalar(k.sunIntensity * Math.sin(60 * DEG_TO_RAD)));
  return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
})();

// Append an axis-aligned quad (in a runway's local frame) to a flat position array,
// rotated by `rot` around Y and translated to (ox, oz). y is the height above ground.
function pushQuad(arr, ox, oz, rot, lx, lz, w, l, y) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const pts = [[lx - w / 2, lz - l / 2], [lx + w / 2, lz - l / 2], [lx + w / 2, lz + l / 2], [lx - w / 2, lz + l / 2]];
  const world = pts.map(([px, pz]) => [ox + px * c + pz * s, oz - px * s + pz * c]);
  for (const i of [0, 2, 1, 0, 3, 2]) arr.push(world[i][0], y, world[i][1]);
}

// Runway surfaces sit on the ground model, which on a runway is the plane through its
// surveyed end elevations (so the quads follow the real slope; no DEM needed).
function flatMesh(positions, material, order) {
  for (let i = 0; i < positions.length; i += 3) positions[i + 1] += ground.heightAt(positions[i], positions[i + 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.renderOrder = order;
  return mesh;
}

function buildRunways() {
  const surface = [];
  const marks = [];
  for (const r of RUNWAYS_GEOM) {
    // Local frame: +Z runs from the le end towards the he end (along the le heading).
    const rot = Math.PI - r.hdgT * DEG_TO_RAD;
    const half = r.lengthM / 2;
    pushQuad(surface, r.cx, r.cz, rot, 0, 0, r.widthM, r.lengthM, 0);
    // Centreline: 120 ft stripes with 80 ft gaps.
    for (let z = -half + 120; z < half - 120; z += 61) pushQuad(marks, r.cx, r.cz, rot, 0, z, 0.9, 36.6, 0);
    // Each end: piano keys at the landing threshold, aiming-point bars, side stripes.
    r.ends.forEach((id, i) => {
      const e = runwayEndById(id);
      const sign = i === 0 ? -1 : 1; // le end sits at local -Z, he end at +Z
      const thrZ = sign * (half - e.displacedM);
      const inward = -sign;
      const keyW = 1.8, keys = Math.max(4, Math.floor((r.widthM - 6) / 3.6));
      for (let k = 0; k < keys; k++) {
        const x = -((keys - 1) * 3.6) / 2 + k * 3.6;
        pushQuad(marks, r.cx, r.cz, rot, x, thrZ + inward * 26, keyW, 45, 0);
      }
      pushQuad(marks, r.cx, r.cz, rot, 0, thrZ + inward * 1.5, r.widthM - 2, 3, 0); // threshold bar
      for (const side of [-1, 1]) {
        pushQuad(marks, r.cx, r.cz, rot, side * r.widthM * 0.22, thrZ + inward * (AIM_POINT_M + 22), 9, 45, 0);
      }
    });
    for (const side of [-1, 1]) pushQuad(marks, r.cx, r.cz, rot, side * (r.widthM / 2 - 1), 0, 0.9, r.lengthM, 0);
  }
  runwayMeshes.push(flatMesh(surface, groundMaterial({ color: 0x1c2029 }, GROUND_ORDER.runway, 'runway'), GROUND_ORDER.runway));
  scene.add(runwayMeshes[0]);
  const markMat = new THREE.MeshBasicMaterial({
    color: 0xf1f5f9, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: GROUND_OFFSET.marking,
  });
  runwayMeshes.push(flatMesh(marks, markMat, GROUND_ORDER.marking));
  scene.add(runwayMeshes[1]);

  // PAPI: four lamps left of every runway end, abeam the aiming point. Drawn as one
  // Points object with a constant on-screen size, the way real lights read from miles out.
  const lampPos = new Float32Array(RUNWAY_ENDS.length * 4 * 3);
  const lampCol = new Float32Array(RUNWAY_ENDS.length * 4 * 3);
  RUNWAY_ENDS.forEach((e, ei) => {
    const d = courseVector(e.hdgT);
    const left = { x: d.z, z: -d.x };
    for (let i = 0; i < 4; i++) {
      const off = e.widthM / 2 + 15 + i * 9;
      const k = (ei * 4 + i) * 3;
      lampPos[k] = e.thrX + d.x * AIM_POINT_M + left.x * off;
      lampPos[k + 2] = e.thrZ + d.z * AIM_POINT_M + left.z * off;
      lampPos[k + 1] = ground.heightAt(lampPos[k], lampPos[k + 2]) + 1.5;
      lampCol[k] = 1; lampCol[k + 1] = 0.13; lampCol[k + 2] = 0.13;
    }
  });
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.BufferAttribute(lampPos, 3));
  lampGeo.setAttribute('color', new THREE.BufferAttribute(lampCol, 3));
  papiLamps = new THREE.Points(lampGeo, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true }));
  scene.add(papiLamps);

  // Runway and approach lights (ticket 0011): their own chunk, after boot.
  import('./runwayLights.js').then(({ createRunwayLights }) => {
    runwayLights = createRunwayLights({ runways: RUNWAYS_GEOM, endById: runwayEndById, heightAt: ground.heightAt, reducedMotion });
    scene.add(runwayLights.points);
  }).catch((err) => console.warn('Runway lights unavailable:', err.message));
}

function buildSatelliteTerrain() {
  terrainGroup = new THREE.Group();

  // Base regional fallback ground plane
  // Below the lowest DEM point, beyond the imagery ring.
  const basePlane = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), groundMaterial({ color: 0x1b281f }, GROUND_ORDER.base, 'base'));
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.y = -90;
  basePlane.renderOrder = GROUND_ORDER.base;
  terrainGroup.add(basePlane);

  // Esri satellite imagery, streamed by distance: ~2 m/px under the aircraft, coarse at the
  // horizon, ±60 km around DFW (terrainLod.js + tileTree.js).
  terrainLod = createTerrainLod({
    scene: terrainGroup, ground, renderOrder: GROUND_ORDER.imagery,
    maxZoom: window.innerWidth < 700 ? 15 : 16,
    anisotropy: Math.min(4, renderer?.capabilities.getMaxAnisotropy() || 1),
    sunDir: reliefSunDir(),
  });
  applyGroundLight();
  loadDem();

  photoreal = createLazyPhotoreal({
    scene, camera, renderer,
    base: import.meta.env.BASE_URL,
    storage: safeStorage(),
    isMobile: window.innerWidth < 700,
    runwayEnds: RUNWAY_ENDS,
    onActive: () => setPhotorealMode(true),
    onUnavailable: () => setPhotorealMode(false),
  });

  scene.add(terrainGroup);
  buildRunways();

  // Stand-in landmarks at their true coordinates and heights (landmarks.js). Each one is a
  // top-level object so seatLandmarks() stands it on its own ground, not a neighbour's.
  const place = (key, obj) => {
    const p = landmarkPos(key);
    obj.position.x = p.x; obj.position.z = p.z;
    obj.userData.landmark = key;
    scene.add(obj);
    landmarks.push(obj);
    return obj;
  };
  const tower = (key, w, color) => {
    const h = LANDMARKS[key].heightM;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshLambertMaterial({ color }));
    m.position.y = h / 2;
    return place(key, m);
  };

  // Bank of America Plaza with emerald green perimeter outline
  const boa = tower('bankOfAmericaPlaza', 58, 0x1e293b);
  const neon = new THREE.Mesh(new THREE.BoxGeometry(60, LANDMARKS.bankOfAmericaPlaza.heightM, 2), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
  neon.position.z = 30;
  boa.add(neon);
  const named = [boa, tower('jpmorganChaseTower', 48, 0x334155), tower('renaissanceTower', 48, 0x0f293a),
    tower('comericaBankTower', 52, 0x3d352e)];

  // Reunion Tower: shaft up to the geodesic ball at the top
  const reunionH = LANDMARKS.reunionTower.heightM;
  const reunion = new THREE.Group();
  const rShaft = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, reunionH - 36, 12), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
  rShaft.position.y = (reunionH - 36) / 2;
  reunion.add(rShaft);
  const rBall = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 16), new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true }));
  rBall.position.y = reunionH - 18;
  reunion.add(rBall);
  named.push(place('reunionTower', reunion));

  // Generic towers fill the core between Reunion and the Chase tower (north-east of BoA),
  // clear of the named ones.
  for (let i = 0; i < 24; i++) {
    const ang = i * 0.92;
    const rad = 180 + (i % 5) * 110;
    const x = DOWNTOWN_DALLAS.x + 250 + Math.cos(ang) * rad, z = DOWNTOWN_DALLAS.z - 250 + Math.sin(ang) * rad;
    if (named.some((o) => Math.max(Math.abs(o.position.x - x), Math.abs(o.position.z - z)) < 60)) continue;
    const bh = 80 + (i * 27) % 110;
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(36, bh, 36), new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0x1e293b : 0x273549 }));
    bldg.position.set(x, bh / 2, z);
    scene.add(bldg);
    landmarks.push(bldg);
  }

  // Margaret Hunt Hill Bridge: one arch over the 184 m main span, along the deck
  const bridge = LANDMARKS.margaretHuntHillBridge;
  const bridgeGroup = new THREE.Group();
  bridgeGroup.rotation.y = -bridge.spanBearingDeg * DEG_TO_RAD;
  const archR = 92;
  const bridgeArch = new THREE.Mesh(new THREE.TorusGeometry(archR, 3.5, 8, 32, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  bridgeArch.scale.y = bridge.heightM / archR;
  bridgeArch.rotation.y = Math.PI / 2;
  bridgeGroup.add(bridgeArch);
  place('margaretHuntHillBridge', bridgeGroup);

  // Arlington AT&T Stadium: a drum up to the top of its roof arches (no detailed model)
  const attH = LANDMARKS.attStadium.heightM;
  const att = new THREE.Mesh(new THREE.CylinderGeometry(150, 130, attH, 24), new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }));
  att.position.y = attH / 2;
  place('attStadium', att);
  seatLandmarks();
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

// Photoreal on: Google's mesh has the real ground, runways, buildings and landmarks, so our
// imagery, runway surfaces and stand-in landmarks step aside (PAPIs and lights stay), and
// the credits switch to Google's logo + the data providers of the tiles on screen.
let photorealOn = false;
function setPhotorealMode(on) {
  photorealOn = on;
  const sat = sim.satelliteEnabled;
  terrainLod?.setVisible(sat && !on);
  for (const m of runwayMeshes) m.visible = !on;
  for (const o of landmarks) o.visible = !on;
  photoreal?.setVisible(sat);
  byId('creditsFree').classList.toggle('hidden', on);
  byId('creditsGoogle').classList.toggle('hidden', !on);
}

// Landmarks stand on the real ground; their own y is the height above it.
const landmarks = [];
function seatLandmarks() {
  for (const o of landmarks) {
    if (o.userData.baseY === undefined) o.userData.baseY = o.position.y;
    o.position.y = o.userData.baseY + ground.heightAt(o.position.x, o.position.z);
  }
}

// The baked elevation grid (scripts/bake-terrain.mjs): gzip, decompressed natively.
// Until it arrives the ground is flat at y 0 away from the airports (runways are already
// at their real heights), so nothing waits on it.
async function loadDem() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${DEM_URL_PATH}`);
    if (!res.ok || !res.body || typeof DecompressionStream === 'undefined') return;
    const raw = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    ground.setDem(decodeDem(new Uint8Array(raw)));
    terrainLod.redrape();
    seatLandmarks();
    runwayLights?.reseat();
  } catch (err) {
    console.warn('Terrain elevation unavailable, flying on flat ground:', err.message);
  }
}

function buildAircraft(type) {
  if (aircraftRoot) {
    scene.remove(aircraftRoot);
    // Free the primitive's own buffers (the glTF copies share the cached model's: keep those).
    aircraftRoot.traverse((o) => { if (o.userData.own) { o.geometry.dispose(); o.material.dispose(); } });
  }
  aircraftRoot = new THREE.Group();
  animRefs = { flame: null, parts: null, model: null };

  // Shaders & materials
  const fuselageWhite = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.25, roughness: 0.35 });
  const airlineBlue = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.35, roughness: 0.3 });
  const cockpitGlass = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1 });
  const titaniumMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.65, roughness: 0.4 });
  const fanMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
  const surfaceMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.3, roughness: 0.4 });
  // A control surface (0063): a pivot named for surfaces.js on the hinge line (local +X
  // along it, `yaw` for a swept hinge), the box hanging `d` aft of it.
  const hinged = (name, x, y, z, w, h, d, { yaw = 0, pitch = 0, aft = d / 2, mat = surfaceMat } = {}) => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, y, z);
    pivot.rotation.set(pitch, yaw, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.z = aft;
    pivot.add(m);
    return pivot;
  };

  if (type === 'b738') {
    // --- Boeing 737-800 NG ---
    const plane = new THREE.Group();

    // Streamlined Fuselage using Lathe Geometry
    const points = [];
    points.push(new THREE.Vector2(0.01, -18));
    points.push(new THREE.Vector2(0.9, -17.2));
    points.push(new THREE.Vector2(1.5, -16.0));
    points.push(new THREE.Vector2(1.88, -14.0));
    points.push(new THREE.Vector2(1.88, 12.0));
    points.push(new THREE.Vector2(1.5, 15.0));
    points.push(new THREE.Vector2(0.8, 17.5));
    points.push(new THREE.Vector2(0.01, 18.5));
    const fuseGeo = new THREE.LatheGeometry(points, 24);
    const fuseMesh = new THREE.Mesh(fuseGeo, fuselageWhite);
    fuseMesh.rotation.x = Math.PI / 2;
    plane.add(fuseMesh);

    // Cockpit Eyebrow Windshield
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 1.8), cockpitGlass);
    glass.position.set(0, 0.85, -14.6);
    glass.rotation.x = -0.22;
    plane.add(glass);

    // Airline cheatline livery strip
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.82, 0.45, 24), airlineBlue);
    stripe.position.set(0, 0.1, -1);
    plane.add(stripe);

    // Swept Main Wings with Airfoil Shape
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -3.2);
    wingShape.lineTo(-17.5, 2.5);
    wingShape.lineTo(-17.5, 4.0);
    wingShape.lineTo(0, 1.2);
    wingShape.closePath();

    const extrudeSettings = { depth: 0.35, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.08, bevelThickness: 0.08 };
    const wingLGeo = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
    const wingLMesh = new THREE.Mesh(wingLGeo, fuselageWhite);
    wingLMesh.rotation.x = Math.PI / 2;
    wingLMesh.position.set(0, -0.2, 0);
    plane.add(wingLMesh);

    // Mirrored Right Wing
    const wingRMesh = wingLMesh.clone();
    wingRMesh.scale.set(-1, 1, 1);
    plane.add(wingRMesh);

    // Flaps inboard, ailerons outboard, hinged just ahead of the trailing edge (swept 9°).
    const teSweep = Math.atan2(2.8, 17.5), teZ = (x) => 1.2 + 2.8 * x / 17.5 - 0.1;
    for (const [side, sgn] of [['L', -1], ['R', 1]]) {
      const yaw = -sgn * teSweep;
      plane.add(hinged(`ctl_flap_${side}`, sgn * 5.6, -0.38, teZ(5.6), 7.0, 0.12, 0.7, { yaw }));
      plane.add(hinged(`ctl_aileron_${side}`, sgn * 13.2, -0.38, teZ(13.2), 5.6, 0.12, 0.6, { yaw }));
    }

    // Blended Winglets
    [-17.5, 17.5].forEach((wx, idx) => {
      const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 1.2), airlineBlue);
      winglet.position.set(wx, 1.1, 3.2);
      winglet.rotation.z = idx === 0 ? 0.2 : -0.2;
      plane.add(winglet);
    });

    // Twin CFM56-7B Turbofan Engines with Spinning Intake Fans
    [-5.8, 5.8].forEach((ex, idx) => {
      const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.05, 4.4, 20), fuselageWhite);
      nacelle.rotation.x = Math.PI / 2;
      nacelle.position.set(ex, -1.35, -1.2);
      plane.add(nacelle);

      const intakeRing = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.08, 8, 20), titaniumMat);
      intakeRing.position.set(ex, -1.35, -3.4);
      plane.add(intakeRing);

      // The fan disc in a holder whose Z is the engine's axis: surfaces.js spins it about Z.
      const fan = new THREE.Group();
      fan.name = idx === 0 ? 'fan_L' : 'fan_R';
      fan.position.set(ex, -1.35, -3.2);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 16), fanMat);
      disc.rotation.x = Math.PI / 2;
      fan.add(disc);
      plane.add(fan);

      const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 16), titaniumMat);
      exhaust.rotation.x = -Math.PI / 2;
      exhaust.position.set(ex, -1.35, 1.4);
      plane.add(exhaust);

    });

    // Vertical Stabilizer / Tail Fin
    const vStabShape = new THREE.Shape();
    vStabShape.moveTo(0, 0);
    vStabShape.lineTo(0, 6.8);
    vStabShape.lineTo(2.8, 6.5);
    vStabShape.lineTo(5.2, 0);
    vStabShape.closePath();
    const vStabGeo = new THREE.ExtrudeGeometry(vStabShape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05 });
    const vStab = new THREE.Mesh(vStabGeo, airlineBlue);
    vStab.rotation.y = Math.PI / 2;
    vStab.position.set(0.16, 1.6, 11.5);
    plane.add(vStab);
    // The rudder on the fin's trailing edge (z 11.5, the fin's extrusion spans x 0.16–0.48).
    plane.add(hinged('ctl_rudder', 0.32, 4.4, 11.55, 0.26, 4.4, 1.1, { mat: airlineBlue }));

    // Horizontal Stabilizers, the elevator hinged on their trailing edge
    const hStab = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.22, 2.0), fuselageWhite);
    hStab.position.set(0, 1.2, 16.1);
    plane.add(hStab);
    plane.add(hinged('ctl_elevator', 0, 1.2, 17.1, 11.0, 0.16, 0.9));

    aircraftRoot.add(plane);

  } else if (type === 'c172') {
    // --- Cessna 172S Skyhawk ---
    const cGroup = new THREE.Group();

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 4.4), fuselageWhite);
    cabin.position.set(0, 0.15, -0.2);
    cGroup.add(cabin);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.8, 16), fuselageWhite);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -3.1);
    cGroup.add(nose);

    const windowMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.7, 1.1), windowMat);
    windshield.position.set(0, 0.55, -1.2);
    windshield.rotation.x = -0.35;
    cGroup.add(windshield);

    // High Wing
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.18, 1.25), fuselageWhite);
    wing.position.set(0, 0.95, -0.6);
    cGroup.add(wing);
    // Flaps inboard, ailerons outboard, on the trailing edge (0.4 m of the 1.65 m chord).
    for (const [side, sgn] of [['L', -1], ['R', 1]]) {
      cGroup.add(hinged(`ctl_flap_${side}`, sgn * 1.85, 0.95, 0.025, 2.3, 0.1, 0.4));
      cGroup.add(hinged(`ctl_aileron_${side}`, sgn * 4.25, 0.95, 0.025, 2.5, 0.1, 0.4));
    }

    // Propeller
    const prop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.2, 0.06), fanMat);
    prop.position.set(0, 0, -4.05);
    prop.name = 'prop';
    cGroup.add(prop);

    // Tail: fin and rudder (raked), stabilizer and elevator
    const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.0, 1.1), airlineBlue);
    vTail.position.set(0, 1.1, 3.35);
    vTail.rotation.x = 0.3; // the fin leans aft
    cGroup.add(vTail);
    cGroup.add(hinged('ctl_rudder', 0, 1.3, 3.9, 0.12, 1.5, 0.5, { pitch: 0.3, mat: airlineBlue })); // clear of the elevator

    const hTail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.45), fuselageWhite);
    hTail.position.set(0, 0.35, 3.82);
    cGroup.add(hTail);
    cGroup.add(hinged('ctl_elevator', 0, 0.35, 4.05, 3.4, 0.08, 0.35));

    aircraftRoot.add(cGroup);

  } else {
    // --- F-16C Fighting Falcon ---
    const fGroup = new THREE.Group();

    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 11.5, 16), titaniumMat);
    fuse.rotation.x = Math.PI / 2;
    fGroup.add(fuse);

    const radome = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.8, 16), fanMat);
    radome.rotation.x = -Math.PI / 2;
    radome.position.set(0, 0, -7.6);
    fGroup.add(radome);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, transparent: true, opacity: 0.65 })
    );
    canopy.scale.set(0.85, 0.72, 2.8);
    canopy.position.set(0, 0.62, -3.5);
    fGroup.add(canopy);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(9.96, 0.14, 3.3), titaniumMat);
    wings.position.set(0, 0, 0.55);
    fGroup.add(wings);
    // Flaperons (flaps and ailerons in one), all-moving stabilators, rudder.
    for (const [side, sgn] of [['L', -1], ['R', 1]]) {
      fGroup.add(hinged(`ctl_aileron_${side}`, sgn * 2.6, 0, 2.2, 2.8, 0.1, 0.7));
      fGroup.add(hinged(`ctl_elevator_${side}`, sgn * 2.2, 0, 5.1, 2.4, 0.1, 1.8, { aft: 0.2 }));
    }

    const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 2.2), airlineBlue);
    vFin.position.set(0, 1.7, 4.0);
    fGroup.add(vFin);
    fGroup.add(hinged('ctl_rudder', 0, 1.7, 5.1, 0.14, 2.8, 0.6, { mat: airlineBlue }));

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.5, 12), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, 0, 7.8);
    fGroup.add(flame);
    animRefs.flame = flame;

    aircraftRoot.add(fGroup);
  }

  aircraftRoot.traverse((o) => { if (o.isMesh) o.userData.own = true; });
  rigSurfaces(animRefs, aircraftRoot);
  scene.add(aircraftRoot);
  attachDetailedModel(type);
}

// Moving parts (0063, src/surfaces.js): a small chunk loaded after boot. Until it arrives
// the surfaces sit at neutral; a model attached meanwhile brings its own rig.
let surfaces = null;
const surfacesReady = import('./surfaces.js').then((m) => { surfaces = m; return m; });
function rigSurfaces(refs, root) {
  surfacesReady.then((m) => { if (!refs.parts) refs.parts = m.rigParts(root); }).catch(() => {});
}

// The detailed glTF model (ticket 0045) replaces the primitive stand-in once it has loaded.
// It loads only after the first Fly (src/aircraftModel.js, the loader and the model are
// their own chunks and file: nothing at boot); if it fails, the primitive stays. A model that
// arrives after the aircraft was changed is dropped.
let detailedModelsArmed = false;
function attachDetailedModel(type) {
  const refs = animRefs;
  if (detailedModelsArmed) import('./aircraftModel.js').then((m) => m.attachModel(aircraftRoot, type, import.meta.env.BASE_URL, refs, () => refs === animRefs))
    .catch((e) => console.warn('[openaero] no aircraft model:', e));
}

// --- Stabilized-approach gate (ticket 0020) ----------------------------------------
// Armed above the gate (500 ft above the runway in VMC, 1,000 ft in IMC), evaluated once
// as the aircraft descends through it on the final (aero.js gateStep). A go-around re-arms
// it for the next approach. Per frame it is scalars only; objects are made once, at the gate.
function checkStabilizedGate() {
  const end = sim.activeEnd;
  if (!end || sim.onGround) return;
  const gs = sim.gateState;
  const aaeFt = (sim.pos.y - end.thrY) * M_TO_FT;
  const gateFt = isImc(sim.wx) ? GATE_IMC_FT : GATE_VMC_FT;
  const ap = sim.approach;
  // On the final: within 18 m per ft of gate height (3x the 3° path's distance to the gate:
  // a steep dive from a 4 NM final still counts, a tour 15 km out doesn't) and 3 loc dots.
  const geom = gs.armed && aaeFt <= gs.armFt && sim.vel.y < 0 ? RUNWAYS_GEOM.find((r) => r.ends.includes(end.id)) : null;
  let locDots = 0;
  if (geom) locDots = ilsDots(ap.crossM, ap.distM + geom.lengthM - end.displacedM + 300, LOC_DOT_DEG);
  const onFinal = ap.distM > 0 && ap.distM < gs.armFt * 18 && Math.abs(locDots) <= 3;
  const step = gateStep(gs, aaeFt, gateFt, sim.vel.y < 0, onFinal);
  if (step === 'reset') sim.gate = null;
  if (step !== 'evaluate') return;
  const gate = sim.gate = stabilizedGate({
    iasKt: sim.iasKts, vref: vrefFor(sim.spec, sim.flapsIndex), vsFpm: sim.vsiFpm, gearDown: gearLocked(sim),
    // The two landing notches (737: 30°/40°, 172: 20°/30°), set and there (not in transit).
    flapsOk: sim.flapsIndex >= 2 && sim.flapPos >= 1.999,
    glideDevDots: ilsDots(ap.heightAbovePathM, ap.distM + AIM_POINT_M, GS_DOT_DEG), locDevDots: locDots,
    vmc: gs.armFt === GATE_VMC_FT,
  });
  gate.runway = end.id;
  gate.iasKt = Math.round(sim.iasKts);
  // HUD lines, 3 items each, built here so drawing them allocates nothing.
  sim.gateLines = [0, 3].map((i) => gate.failing.slice(i, i + 3).join(' · '));
  sim.gateShownUntil = sim.simTime + 6;
  if (!gate.stable) audio.callout('unstabilized, go around');
}

// --- Go-around drill (ticket 0047, goAround.js) -------------------------------------
// After the gate calls "unstabilized, go around" on the drill, the climb away is graded on
// the results card at 500 ft; landing anyway is capped (checkTouchdown). Scalars per frame.
// goAround.js is a lazy chunk, loaded with the drill (loadScenario), not at boot.
let goAroundLib = null;
const _gaIn = { gate: null, aaeFt: 0, vsFpm: 0, iasKts: 0, throttle: 0, flapsIndex: 0, onGround: false };
// The missed approach is flown (and coached) from the call until it is over (goAround.js:
// 2,000 ft, or descending again for another approach).
const goAroundActive = () => {
  const ga = sim.goAround?.phase;
  return (ga === 'goAround' || ga === 'complete') && !sim.onGround;
};
function checkGoAround() {
  const ga = sim.goAround;
  if (!ga) return;
  // Height above the drill's runway, whichever runway the airplane ends up over (a landing
  // on 35L after the call is still a landing the gate said not to make).
  const end = ga.end;
  _gaIn.gate = sim.gate && sim.gate.runway === end.id ? sim.gate : null;
  _gaIn.aaeFt = (sim.pos.y - end.thrY) * M_TO_FT;
  _gaIn.vsFpm = sim.vsiFpm;
  _gaIn.iasKts = sim.iasKts;
  _gaIn.throttle = sim.throttle;
  _gaIn.flapsIndex = sim.flapsIndex;
  _gaIn.onGround = sim.onGround;
  const step = goAroundLib.goAroundState(ga, _gaIn);
  // Kid: the airplane flies the go-around itself (full power, climb away, as after a takeoff).
  if (step === 'goAround' && assistConfig(sim.assist)?.autoThrottle) assistState.departing = true;
  if (step !== 'complete') return;
  const cfg = assistConfig(sim.assist);
  const result = goAroundLib.gradeGoAround({
    callFt: ga.callFt, lowFt: ga.lowFt, gateFt: ga.gate ? ga.gate.gateHeight : GATE_VMC_FT,
    minIasKts: ga.minIasKts, vrefKts: vrefFor(sim.spec, ga.callFlaps), climbFpm: ga.climbFpm,
    // Kid's assist flies the flaps (assists.js autoConfigure): not the player's to score.
    flapsUp: cfg?.autoConfig ? null : sim.flapsIndex < ga.callFlaps,
  });
  let best = { isNewBest: false, best: null };
  try { best = recordBest(window.localStorage, assistBestKey(sim.missionKey, sim.assist), result); } catch { /* storage unavailable */ }
  showResults(result, best, end, ga.gate);
}

function startGoAroundDrill(mission) {
  sim.goAround = null;
  if (!mission.goAround) return;
  const arm = (lib) => {
    goAroundLib = lib;
    if (sim.loadedMission !== mission) return; // another mission was picked meanwhile
    sim.goAround = lib.createGoAround();
    sim.goAround.end = runwayEnd(mission.airport, mission.rwy);
    // Kid's autothrottle holds the drill's fast approach speed down to the gate (the hands-
    // off guide still flies the path), so the gate calls it and Kid sees the go-around.
    sim.goAround.holdKts = sim.spec.vrefKts + 5 + (mission.fastKts ?? 0);
  };
  if (goAroundLib) arm(goAroundLib);
  else import('./goAround.js').then(arm).catch((e) => console.warn('[openaero] no go-around drill:', e));
}

// --- Stall recovery drill (ticket 0087, stallDrill.js) ------------------------------
// Slow the Cessna at idle until the wing stalls, then recover: graded on the results card
// once it climbs away (or fails). stallDrill.js is a lazy chunk, loaded with the drill.
let stallLib = null;
let aircraftBeforeMission = null; // yours, while a mission flies its own airframe (the drill's)
const _stIn = { t: 0, dt: 0, altFt: 0, aglFt: 0, aoaDeg: 0, stallAoaDeg: 0, vsFpm: 0, bankDeg: 0, pullIn: 0, throttle: 0, iasKts: 0, warnKts: 0 };
let stallPullIn = 0; // the player's back stick this sub-step, before the assists
let drillCoach = false; // the drill is always coached (its only instructions) until Skip
const stallLive = () => sim.stallDrill && sim.stallDrill.phase !== 'complete' && sim.stallDrill.phase !== 'failed';
function checkStallDrill(dt) {
  const st = sim.stallDrill;
  if (!st) return;
  _euler.setFromQuaternion(sim.quat, 'YXZ');
  _stIn.t = sim.simTime; _stIn.dt = dt;
  _stIn.altFt = sim.pos.y * M_TO_FT; _stIn.aglFt = sim.aglFt;
  _stIn.aoaDeg = sim.aoaDeg; _stIn.stallAoaDeg = stallAoaDeg(sim.spec, sim.flapsIndex);
  _stIn.vsFpm = sim.vsiFpm; _stIn.bankDeg = -_euler.z * RAD_TO_DEG;
  _stIn.pullIn = stallPullIn; _stIn.throttle = sim.throttle;
  _stIn.iasKts = sim.iasKts; _stIn.warnKts = stallWarningKts(sim.spec, sim.flapsIndex);
  const step = stallLib.stallDrillState(st, _stIn);
  if (step !== 'complete' && step !== 'failed') return;
  const result = stallLib.gradeStallRecovery(stallLib.stallResultInput(st, sim.assist === 'kid'));
  let best = { isNewBest: false, best: null };
  try { best = recordBest(window.localStorage, assistBestKey(sim.missionKey, sim.assist), result); } catch { /* storage unavailable */ }
  updateCoach(0); // the drill is over: clear its prompt before the card pauses the flight
  showResults(result, best, stallLib.STALL_PLACE, null);
}

function startStallDrill(mission) {
  sim.stallDrill = null;
  drillCoach = !!mission.stallDrill;
  if (!mission.stallDrill) return;
  const arm = (lib) => {
    stallLib = lib;
    if (sim.loadedMission === mission) sim.stallDrill = lib.createStallDrill();
  };
  if (stallLib) arm(stallLib);
  else import('./stallDrill.js').then(arm).catch((e) => console.warn('[openaero] no stall drill:', e));
}

// --- Landing grade ---------------------------------------------------------------
let softResetAt = null; // Kid soft landing: sim time at which the mission restarts
// A landing waits for the wheels to settle before its card (0091): a bounce caps the grade,
// and a go-around after it drops the landing (the right call, not a grade).
const bounce = createBounceTracker();
let pendingLanding = null;
function checkBounce(dt) {
  stepBounce(bounce, (sim.pos.y - sim.groundY - sim.spec.gearHeight) * M_TO_FT, sim.onGround, dt);
  if (sim.aglFt > 50) {
    pendingLanding = null;
    resetCoach();
    if (bounce.bounces) showToast('Going around after the bounce: good call');
  } else if (bounce.settled) {
    const p = pendingLanding;
    pendingLanding = null;
    finishLanding(capBounced(p.result, bounce.bounces), p.end, p.gate, p.bestKey);
  }
}
function checkTouchdown(dt) {
  if (softResetAt !== null && sim.simTime >= softResetAt) { softResetAt = null; loadScenario(sim.missionKey); return; }
  if (pendingLanding) checkBounce(dt);
  if (!sim.onGround) {
    sim.airborneTime += dt;
    if (sim.aglFt > 50) sim.landingGraded = false;
  }
  const touchedDown = sim.onGround && !sim.wasOnGround && sim.airborneTime > 3 && !sim.landingGraded;
  sim.wasOnGround = sim.onGround;
  if (!touchedDown) return;
  sim.landingGraded = true;
  sim.airborneTime = 0;
  const end = sim.activeEnd || selectActiveRunway(RUNWAY_ENDS, sim.pos, 0, null);
  const assist = assistConfig(sim.assist);
  if (!end) return;
  const g = approachGeometry(end, sim.pos);
  const geom = RUNWAYS_GEOM.find((r) => r.ends.includes(end.id));
  _euler.setFromQuaternion(sim.quat, 'YXZ');
  let result = gradeLanding({
    vsFpm: sim.lastAirVsi,
    crossM: g.crossM,
    pastThresholdM: -g.distM,
    runwayLengthM: geom ? geom.lengthM - end.displacedM : 3000,
    runwayWidthM: end.widthM,
    pitchDeg: _euler.x * RAD_TO_DEG,
    bankDeg: _euler.z * RAD_TO_DEG,
    iasKts: sim.iasKts,
    vrefKts: vrefFor(sim.spec, sim.flapsIndex),
    gearLocked: gearLocked(sim),
    driftDeg: sim.missionKey === CROSSWIND_KEY ? driftAngleDeg((-_euler.y * RAD_TO_DEG + 360) % 360, sim.vel.x, sim.vel.z) : undefined,
  });
  // The go-around drill: landing after the gate called a go-around is capped (0047).
  if (sim.goAround?.phase === 'landed') result = goAroundLib.capUnstableLanding(result);
  // Kid: a hard landing bounces and starts the approach again instead of crashing.
  if (result.grade === 'CRASH' && assist && assist.softLanding) {
    sim.vel.y = Math.max(sim.vel.y, 2.5);
    coach.done = true; coach.prompt = null; // no "Touchdown!" over the bounce
    showToast(`Boing! ${result.reason} Let's try again!`);
    softResetAt = sim.simTime + 2; // counted in sim time: a pause holds it
    return;
  }
  const gate = sim.gate && sim.gate.runway === end.id ? sim.gate : null;
  sim.lastLanding = {
    pastThresholdM: -g.distM, crossM: g.crossM, vsFpm: sim.lastAirVsi,
    pitchDeg: _euler.x * RAD_TO_DEG, bankRightDeg: -_euler.z * RAD_TO_DEG,
    grade: result.grade, score: result.score, runway: end.id, bounces: 0,
    stabilized: gate ? gate.stable : null,
  };
  // The crosswind challenge moves runway with the weather: its best is kept per runway end.
  // Kid and Learner keep their own bests (assists.js); Pilot keeps the mission's key.
  const bestKey = assistBestKey(sim.missionKey === CROSSWIND_KEY ? `${CROSSWIND_KEY}:${end.id}` : sim.missionKey, sim.assist);
  if (result.grade === 'CRASH') { finishLanding(result, end, gate, bestKey); return; }
  Object.assign(bounce, createBounceTracker());
  pendingLanding = { result, end, gate, bestKey };
  loadResults(); // fetched while the wheels settle
}

function finishLanding(result, end, gate, bestKey) {
  Object.assign(sim.lastLanding, { grade: result.grade, score: result.score, bounces: result.bounces ?? 0 });
  let best = { isNewBest: false, best: null };
  try { best = recordBest(window.localStorage, bestKey, result); } catch { /* storage unavailable */ }
  showResults(result, best, end, gate);
}

let resultsPaused = false; // the go-around's card pauses the flight in the air (0047)
// The results card is a lazy chunk (results.js), fetched at the touchdown or a drill's end.
const loadResults = () => import('./results.js');
function showResults(result, best, end, gate) {
  loadResults().then((m) => {
    if (!sim.onGround && !sim.paused) { resultsPaused = true; setPaused(true); }
    m.showResults(sim, result, best, end, gate);
  }).catch((e) => console.warn('[openaero] no results card:', e));
}

function resumeFromResults() {
  if (resultsPaused && sim.paused) setPaused(false);
  resultsPaused = false;
}
byId('btnFlyAgain').addEventListener('click', () => {
  byId('resultsCard').classList.add('hidden');
  resumeFromResults();
  loadScenario(sim.missionKey);
});
byId('btnKeepRolling').addEventListener('click', () => {
  byId('resultsCard').classList.add('hidden');
  resumeFromResults();
});

// --- First-flight coach (coach.js) -------------------------------------------------
// Enabled for this page from the modal's checkbox (ticked on a first visit); runs only on
// the default final and finishes at touchdown, where the results card takes over.
const coach = createCoach();
let coachEnabled = false;
let coachShown = undefined; // prompt key on screen, to touch the DOM only on change
let coachMarked = false; // 'seen' is stored the first time a prompt actually shows
let coachDoneS = 0;
const COACH_DONE_SHOW_S = 4;
const coachInput = {
  aglFt: 0, vsiFpm: 0, papiWhite: null, throttle: 0, onGround: false, autopilot: false, kid: false,
  iasKts: 0, targetKts: 0, locDots: 0, gearLocked: true, flapsLanding: true, driftDeg: 0, goAround: false,
  stall: null, bankDeg: 0, bounces: 0,
  rollout: { gsKts: 0, canReverse: false, reverserPos: 0, braking: false },
};
const coachVals = { targetKts: 0, flapsDeg: 0 };
// Touch-only screens reverse with the REV button (the ILS slot on the ground), not R.
const touchOnly = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;

function resetCoach() {
  Object.assign(coach, createCoach());
  coachDoneS = 0;
}

const AP_GLOW_IDS = ['touchStick', 'touchThrottle', 'virtualStickPad'];
let apGlowShown = false;

// --- Autopilot tutor (apTutor.js): while the autopilot flies it explains itself in the
// coach's card, speaks when sound is on, and offers "Your turn" (hand-over to the coach).
const tutor = createTutor();
let tutorEnabled = true;
let coachHandover = false; // the player took over from the autopilot on a final
const tutorInput = {
  apMaster: false, apApproach: false, apHdgHold: false, apAltHold: false, onGround: false,
  aglFt: 0, crossM: 0, heightAbovePathM: 0, iasKts: 0, targetKts: 0,
};
const tutorVals = { targetKts: 0, hdgDeg: 0, altFt: 0 };

function updateTutor(dt) {
  if (!tutorEnabled) { tutor.caption = null; return null; }
  tutorInput.apMaster = sim.apMaster;
  tutorInput.apApproach = sim.apApproach;
  tutorInput.apHdgHold = sim.apHdgHold;
  tutorInput.apAltHold = sim.apAltHold;
  tutorInput.onGround = sim.onGround;
  tutorInput.aglFt = sim.aglFt;
  tutorInput.crossM = sim.approach.crossM;
  tutorInput.heightAbovePathM = sim.approach.heightAbovePathM;
  tutorInput.iasKts = sim.iasKts;
  tutorInput.targetKts = vrefFor(sim.spec, sim.flapsIndex) + 5;
  stepTutor(tutor, tutorInput, dt);
  return tutor.caption;
}

function updateCoach(dt) {
  let prompt = null;
  // Every final is coached (0073), and any approach the player takes over from the autopilot.
  // ...and the stall drill (0087) until it is graded, whatever the checkbox (until Skip).
  if ((coachEnabled && (sim.loadedMission?.kind === 'final' || coachHandover)) || (drillCoach && stallLive())) {
    coachInput.aglFt = sim.aglFt;
    coachInput.vsiFpm = sim.vsiFpm;
    coachInput.papiWhite = sim.papiWhite;
    coachInput.throttle = sim.throttle;
    coachInput.onGround = sim.onGround;
    coachInput.autopilot = sim.apMaster || sim.apApproach;
    coachInput.kid = sim.assist === 'kid';
    coachInput.iasKts = sim.iasKts;
    coachInput.targetKts = vrefFor(sim.spec, sim.flapsIndex) + 5;
    // Localizer dots from the antenna ~3.3 km past the threshold (close enough for advice).
    coachInput.locDots = sim.activeEnd ? ilsDots(sim.approach.crossM, Math.max(0, sim.approach.distM) + 3300, LOC_DOT_DEG) : 0;
    coachInput.gearLocked = gearLocked(sim);
    coachInput.flapsLanding = sim.flapsIndex >= 2 && sim.flapPos >= 1.999;
    // The drill's missed approach (0047): coached from the gate's call to 2,000 ft. Here the
    // gear prompt means "still down" and the flaps prompt "still at landing flaps" (lever).
    coachInput.goAround = goAroundActive();
    if (coachInput.goAround) {
      coachInput.gearLocked = !sim.spec.fixedGear && sim.gearDown;
      coachInput.flapsLanding = sim.flapsIndex >= sim.goAround.callFlaps;
    }
    _euler.setFromQuaternion(sim.quat, 'YXZ');
    coachInput.stall = sim.stallDrill?.phase ?? null;
    coachInput.bankDeg = -_euler.z * RAD_TO_DEG;
    coachInput.driftDeg = sim.gsKts > 30 ? driftAngleDeg((-_euler.y * RAD_TO_DEG + 360) % 360, sim.vel.x, sim.vel.z) : 0;
    // Only while the wheels are up out of a counted bounce (landing.js stepBounce).
    coachInput.bounces = pendingLanding && bounce.airS > 0 ? bounce.bounces : 0;
    const r = coachInput.rollout;
    r.gsKts = sim.gsKts;
    r.canReverse = !!systemsOf(sim.spec).reverser;
    r.reverserPos = sim.reverserPos ?? 0;
    r.braking = sim.brakesOn || sim.autobrakeActive;
    stepCoach(coach, coachInput, dt);
    if (coach.done) coachDoneS += dt;
    // After the landing the rollout prompts run to the stop; "Stopped" then fades.
    prompt = coach.prompt === 'stopped' && coachDoneS > COACH_DONE_SHOW_S + 20 ? null : coach.prompt;
  }
  // The coach is silent while the autopilot flies, so the tutor takes its card then.
  const caption = updateTutor(dt);
  const key = caption ? `ap:${caption}` : prompt;
  if (key === coachShown) return;
  coachShown = key;
  byId('coach').classList.toggle('hidden', key === null);
  byId('btnTakeover').classList.toggle('hidden', !caption);
  if (key === null) return;
  byId('txtCoachLabel').textContent = caption ? 'Autopilot' : 'Coach';
  const skip = byId('btnCoachSkip');
  skip.textContent = caption ? 'Hide' : 'Skip';
  skip.setAttribute('aria-label', caption ? 'Hide the autopilot tips' : 'Skip the coach');
  if (caption) {
    tutorVals.targetKts = vrefFor(sim.spec, sim.flapsIndex) + 5;
    tutorVals.hdgDeg = magHeadingText(sim.targetHdgDeg);
    tutorVals.altFt = Math.round(sim.targetAltFt / 100) * 100;
    const text = TUTOR_TEXT[caption](tutorVals);
    byId('txtCoach').textContent = text;
    // The GPWS callouts own the last 100 ft; the tutor speaks above them.
    if (sim.aglFt > 100 || caption === 'rollout') audio.teach(text);
    return;
  }
  coachVals.targetKts = Math.round(vrefFor(sim.spec, sim.flapsIndex) + 5);
  const detents = sim.spec.flapDetentsDeg ?? sim.flapAngles;
  coachVals.flapsDeg = prompt === 'gaFlaps' ? detents[Math.max(0, sim.goAround.callFlaps - 1)] : detents[2];
  coachVals.touch = touchOnly;
  const text = prompt === 'done' && sim.autobrakeActive ? 'Touchdown! The autobrake is stopping you' : coachText(prompt, coachVals);
  byId('txtCoach').textContent = text;
  // Spoken too when sound is on; the GPWS callouts own the last 100 ft.
  if (sim.aglFt > 100 || sim.onGround) audio.teach(text);
  if (!coachMarked) {
    coachMarked = true;
    try { markCoachSeen(window.localStorage); } catch { /* storage unavailable */ }
  }
}

// Leaving the modal (ENTER COCKPIT or ✕) applies the coach checkbox.
function applyCoachChoice() {
  tutorEnabled = byId('chkTutor').checked;
  try { setTutorOn(window.localStorage, tutorEnabled); } catch { /* storage unavailable */ }
  coachEnabled = byId('chkCoach').checked;
  if (coachEnabled) resetCoach();
}

byId('btnCoachSkip').addEventListener('click', () => {
  if (tutor.caption) {
    tutorEnabled = false;
    byId('chkTutor').checked = false;
    try { setTutorOn(window.localStorage, false); } catch { /* storage unavailable */ }
  } else {
    coachEnabled = false;
    drillCoach = false;
    byId('chkCoach').checked = false;
  }
  updateCoach(0); // hide now, even while paused
});

// "Your turn": the autopilot lets go; on a final the coach picks up from here.
byId('btnTakeover').addEventListener('click', () => {
  sim.apMaster = false;
  sim.apApproach = false;
  sim.apHdgHold = false;
  sim.apAltHold = false;
  resetApFilters();
  if (sim.activeEnd && !sim.onGround) {
    coachEnabled = true;
    coachHandover = true;
    resetCoach();
  }
  showToast('You have control');
  updateCoach(0);
});

// --- Weather -----------------------------------------------------------------------
const WX_IDS = 'KDFW,KDAL,KADS,KAFW,KFTW,KGKY';
const OVERCAST_GREY = new THREE.Color(0x9aa5b1);
const NO_SKY = { nightness: 0, moonIllumination: 0, moonElevationDeg: -90 };
const _overcast = new THREE.Color();
const _skyDate = new Date();
placeSun();

// The sky dome for the sun of the moment, greyed by how much of it a low deck covers, and
// the haze matched to its horizon. Moonlight lifts the night ambient.
function applySky() {
  const base = sim.wx.ceilingFt;
  const k = base !== null && base <= 12000 ? (sim.wx.ceilingCover === 'BKN' ? 0.45 : 0.8) : 0;
  const look = skyForSun(sun.elevationDeg);
  _overcast.copy(OVERCAST_GREY).multiplyScalar(Math.min(1, 0.12 + look.ambientIntensity * 0.9 + look.sunIntensity * 0.15));
  _skyDate.setTime(sun.at ?? Date.now());
  skyDome?.setSky({
    look, sunDir: _sunVec, sunElevationDeg: sun.elevationDeg, date: _skyDate,
    latDeg: DFW_ORIGIN_LAT, lonDeg: DFW_ORIGIN_LON, overcast: k, overcastColor: _overcast,
  });
  scene.fog.color.setHex(look.fog).lerp(_overcast, k);
  scene.background.copy(scene.fog.color);
  const st = skyDome?.state ?? NO_SKY;
  const moonlight = st.moonIllumination * Math.max(0, Math.min(1, st.moonElevationDeg / 10)) * st.nightness * (1 - k);
  ambientLight.intensity = (look.ambientIntensity + 0.18 * moonlight) * LIGHT_SCALE;
  // The eye adapts: a little more exposure after dark.
  if (renderer) renderer.toneMappingExposure = 1.05 + 0.35 * st.nightness;
  applyGroundLight();
}

async function fetchWeather() {
  try {
    // no-store + a minute bucket: the zone's Browser Cache TTL can stretch cached edge
    // responses to hours, and weather must never be served stale from a browser cache.
    const bucket = Math.floor(Date.now() / 60000);
    const res = await fetch(`${import.meta.env.BASE_URL}api/metar?ids=${WX_IDS}&t=${bucket}`, { cache: 'no-store' });
    if (!res.ok) return;
    const body = await res.json();
    const next = {};
    for (const m of body.metars || []) next[m.icaoId] = parseMetar(m);
    if (Object.keys(next).length) sim.wxByIcao = next;
  } catch {
    // Offline: keep the last real weather, or the labelled scenario weather.
  }
  refreshWeather();
  refreshCrosswindMission();
  // Before the first Fly, spawn again in the weather that just arrived: the boot spawn folded
  // the scenario wind into its ground speed, and the new wind was a ~15 kt shear (0090).
  if (!detailedModelsArmed) loadScenario(sim.missionKey, sim.missionKey.startsWith('debug_') && sim.loadedMission);
}

// Re-pick today's crosswind challenge from the live METARs. A flight already under way keeps
// its runway (sim.activeEnd); the new pick applies from the next load / Fly again.
function refreshCrosswindMission() {
  const m = crosswindMission(pickCrosswindRunway(sim.wxByIcao, RUNWAY_ENDS, Date.now() / 1000));
  sim.crosswindMission = m;
  // Flying the challenge when it disappears: Fly again keeps the runway you were flying.
  const flying = sim.missionKey === CROSSWIND_KEY && sim.loadedMission ? [sim.loadedMission] : [];
  sim.dynamicMissions = m ? [m] : flying;
  const sel = byId('selScenario');
  let opt = sel.querySelector(`option[value="${CROSSWIND_KEY}"]`);
  if (m) {
    if (!opt) { opt = document.createElement('option'); opt.value = CROSSWIND_KEY; sel.prepend(opt); }
    opt.textContent = m.label;
  } else if (opt && sim.missionKey !== CROSSWIND_KEY) {
    opt.remove();
  }
  const btn = byId('btnCrosswindToday');
  if (m) byId('txtCrosswindToday').textContent = m.label.replace("Today's crosswind: ", '');
  if (!m) btn.classList.remove('active');
  btn.classList.toggle('hidden', !m);
  btn.classList.toggle('flex', !!m);
  refreshMissionBests();
}

// The weather for where you are flying: the active runway's field, else DFW, else scenario.
function currentWeather() {
  const field = sim.activeEnd ? sim.activeEnd.airport : 'KDFW';
  return sim.wxByIcao[field] || sim.wxByIcao.KDFW || scenarioWeather();
}

function refreshWeather() {
  sim.wx = currentWeather();
  sim.isaDevC = isaDeviationC(sim.wx.tempC, REF_ELEV_M);
  sim.altimInHg = sim.wx.altimInHg || 29.92;
  scene.fog.density = fogDensityForVisibility(sim.wx.visibilitySm);
  // METAR cloud bases are above the reporting field.
  skyDome?.setClouds(sim.wx.cloudLayers, sim.activeEnd ? sim.activeEnd.thrY : 0);
  applySky();
}

// Wind at the aircraft: steady + smoothed gusts, fading to zero in the last ~30 m above
// the ground (surface friction), which also keeps a parked aircraft from sliding sideways.
function updateWind(dt) {
  sim.simTime += dt;
  const wx = sim.wx;
  sim.windNowKts = gustFactor(sim.simTime, wx.windKts, wx.gustKts);
  const h = Math.max(0, sim.pos.y - sim.groundY - sim.spec.gearHeight);
  const surface = Math.sqrt(Math.min(1, h / 30));
  const w = windVector(wx.windDirDeg, sim.windNowKts * 0.514444 * surface);
  sim.windVec.set(w.x, 0, w.z);
}

function windText(wx) {
  if (!wx.windKts) return 'CALM';
  const dir = wx.windDirDeg === null ? 'VRB' : `${String(Math.round(wx.windDirDeg)).padStart(3, '0')}°`;
  return `${dir} @ ${wx.windKts}${wx.gustKts > wx.windKts ? `G${wx.gustKts}` : ''} KT`;
}

// Ribbon text, once a second (cheap, and the age counter only needs minutes).
let wxUiTimer = 0;
function syncWeatherUI(dt) {
  wxUiTimer -= dt;
  if (wxUiTimer > 0) return;
  wxUiTimer = 1;
  const wx = currentWeather();
  if (wx !== sim.wx) refreshWeather();
  const badge = byId('wxBadge');
  badge.textContent = wx.live ? 'LIVE METAR' : 'SCENARIO WX';
  badge.className = wx.live
    ? 'px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-400 text-emerald-300 font-bold text-[9px] shrink-0'
    : 'px-1.5 py-0.5 rounded bg-slate-900 border border-slate-500 text-slate-300 font-bold text-[9px] shrink-0';
  const age = wx.live && wx.obsTime ? ` · ${metarAgeMinutes(wx.obsTime, Date.now() / 1000)} min ago` : '';
  // Remarks (RMK …) are for forecasters; drop them so the age stays visible.
  byId('txtMetarString').textContent = `${String(wx.raw).split(' RMK')[0]}${age}`;
  byId('txtWindBadge').textContent = windText(wx);
  const dfw = sim.wxByIcao.KDFW || scenarioWeather();
  const flow = flowForWind(dfw.windDirDeg, dfw.windKts);
  byId('txtFlow').textContent = flow === 'NORTH' ? 'NORTH (RWY 35/36)' : 'SOUTH (RWY 17/18)';
  // HUD wind box (0075): components against the active runway only low down, near it.
  const low = sim.activeEnd && nearRunwayForWind(sim.approach, sim.activeEnd.lengthM, sim.aglFt);
  windReadout(wx, low ? runwayWindComponents(wx.windDirDeg, wx.windKts, sim.activeEnd.hdgT) : null, sim.hudWind);
  const rw = byId('txtRwyWind');
  if (sim.activeEnd && wx.windKts) {
    const c = runwayWindComponents(wx.windDirDeg, wx.windKts, sim.activeEnd.hdgT);
    const hw = Math.round(c.headwindKts), xw = Math.round(Math.abs(c.crosswindKts));
    rw.textContent = `${sim.activeEnd.ident}: ${Math.abs(hw)} ${hw >= 0 ? 'HW' : 'TW'} · ${xw} XW${xw ? (c.crosswindKts > 0 ? ' R' : ' L') : ''}`;
  } else {
    rw.textContent = '';
  }
}

function step6DofPhysics(dt) {
  if (sim.paused) return;
  sim.groundY = ground.heightAt(sim.pos.x, sim.pos.z);
  updateWind(dt);

  // Sub-stepping: at least 3 per frame and never longer than 1/60 s each, so the
  // integration is as stable on a slow device as at 60 fps, and sim time keeps pace with
  // real time down to 4 fps (renderLoop caps a frame at 250 ms) instead of slowing down.
  const subSteps = Math.max(3, Math.ceil(dt * 60));
  const subDt = dt / subSteps;

  for (let step = 0; step < subSteps; step++) {
    integrateSubStep(subDt);
  }

  // Sync aircraft mesh transform with rigid body states
  if (aircraftRoot) {
    aircraftRoot.position.copy(sim.pos);
    aircraftRoot.quaternion.copy(sim.quat);
  }

  // Secondary visual animations
  // Control surfaces, gear swing and prop/fans (0063): from the state the physics just used.
  if (surfaces && animRefs.parts) surfaces.poseParts(animRefs.parts, sim.spec, sim, surfaces.spinRate(sim.engineN) * dt);
  if (animRefs.flame) {
    animRefs.flame.scale.set(1, 1, 0.8 + sim.throttle * 1.6);
    animRefs.flame.visible = sim.throttle > 0.6;
  }
  animRefs.model?.update(sim);

  // Approach target + PAPI lamps
  updateActiveRunway(dt);
  updatePapi();
  checkStabilizedGate();
  checkGoAround();
  checkStallDrill(dt);
  checkTouchdown(dt);
  checkTakeoffCallouts();
}

// Takeoff callouts (0035): on the takeoff mission's roll and climb-out only, spoken when
// sound is on and shown on the HUD either way. Re-armed by loadScenario.
function checkTakeoffCallouts() {
  if (sim.loadedMission?.kind !== 'takeoff' || sim.takeoffCalloutIdx >= TAKEOFF_CALLOUTS.length - 1) return;
  // Wheel height, not sim.aglFt: that is the CG's, already ~11 ft with a 737's wheels down.
  const wheelFt = sim.onGround ? 0 : (sim.pos.y - sim.groundY - sim.spec.gearHeight) * M_TO_FT;
  const i = takeoffCalloutIndex(sim.iasKts, sim.vsiFpm, wheelFt, sim.spec.vrKts, sim.takeoffCalloutIdx, !!sim.spec.twoCrew);
  if (i < 0) return;
  sim.takeoffCalloutIdx = i;
  sim.takeoffCalls.push(TAKEOFF_CALLOUTS[i]);
  sim.takeoffCallShownUntil = sim.simTime + 2.5;
  audio.takeoffCall(TAKEOFF_CALLOUTS[i]);
}

function integrateSubStep(dt) {
  sim.groundY = ground.heightAt(sim.pos.x, sim.pos.z);
  const spec = sim.spec;

  // Pilot Input Controls: touch/drag stick > gamepad > keyboard (input.js)
  const targets = combineTargets(pilotTargets(keys), sim.stick, sim.pad);
  sim.inputSource = targets.source;
  let targetPitch = targets.pitch, targetRoll = targets.roll;
  const targetYaw = targets.yaw;

  if (sim.pad && sim.pad.throttleRate) {
    sim.throttle = THREE.MathUtils.clamp(sim.throttle + sim.pad.throttleRate * dt * 0.5, 0, 1);
  }

  if (keys['ShiftLeft'] || keys['ShiftRight']) {
    sim.throttle = Math.min(1.0, sim.throttle + dt * 0.4);
    byId('rngThrottle').value = Math.round(sim.throttle * 100);
  }
  if (keys['ControlLeft'] || keys['ControlRight']) {
    sim.throttle = Math.max(0.0, sim.throttle - dt * 0.4);
    byId('rngThrottle').value = Math.round(sim.throttle * 100);
  }

  const assist = sim.apMaster ? null : assistConfig(sim.assist);
  if (sim.mouseYoke && targets.source === 'keyboard') {
    targetRoll = assist ? sim.mouseStick.x : sim.aileronInput;
    targetPitch = assist ? sim.mouseStick.y : sim.elevInput;
  }

  stallPullIn = Math.max(0, -targetPitch); // elevator + = nose down
  // The assists and a pitch-holding autopilot trim as they fly; Pilot's trim stays where the
  // spawn (or the autopilot it took over from) set it, so a released stick flies that trim (0090).
  sim.autoTrim = sim.assist !== 'pilot' || (sim.apMaster && (sim.apApproach || sim.apAltHold));
  // No trim control yet: a stick held off centre trims its pressure away over ~8 s, as a pilot
  // would, but never closer than 4° to the stall, so letting go there still lowers the nose.
  if (!sim.autoTrim && sim.trimAlphaDeg != null && Math.abs(sim.elevInput) > 0.05) {
    sim.trimAlphaDeg = Math.min(stallAoaDeg(sim.spec, sim.flapsIndex) - 4, sim.trimAlphaDeg + (sim.aoaDeg - sim.trimAlphaDeg) * dt / 8);
  }
  if (assist) {
    applyAssists(assist, targetPitch, targetRoll, targetYaw, dt);
  } else {
    resetAssistState(assistState);
    sim.elevInput = THREE.MathUtils.lerp(sim.elevInput, targetPitch, dt * 10);
    sim.aileronInput = THREE.MathUtils.lerp(sim.aileronInput, targetRoll, dt * 10);
    sim.rudderInput = THREE.MathUtils.lerp(sim.rudderInput, targetYaw, dt * 10);
  }

  // Autopilot / ILS coupling (control laws in autopilot.js; signs pinned by unit tests)
  if (sim.apMaster) {
    _euler.setFromQuaternion(sim.quat, 'YXZ');
    const curHdg = (-_euler.y * RAD_TO_DEG + 360) % 360;
    const pitchDeg = _euler.x * RAD_TO_DEG;
    const bankRightDeg = -_euler.z * RAD_TO_DEG;
    const rollRateRight = -sim.angVel.z;
    const pitchRateUp = sim.angVel.x;
    const holdHeading = (hdgDeg) => {
      const bankCmd = bankCommandForHeading(headingError(hdgDeg, curHdg), sim.tasKts * 0.514444);
      sim.aileronInput = aileronForBank(bankCmd, bankRightDeg, rollRateRight);
    };
    // Fly a flight-path angle: pitch = path + current angle of attack.
    // Pitch is capped at 9.5° nose-up (737 tailstrike is ~11°).
    const holdGamma = (gammaDeg) => {
      sim.elevInput = elevatorForPitch(Math.min(9.5, gammaDeg + sim.aoaDeg), pitchDeg, pitchRateUp);
    };

    updateIasTrend(dt);

    if (sim.apApproach && sim.activeEnd) {
      const ap = approachGeometry(sim.activeEnd, sim.pos);
      holdHeading(sim.activeEnd.hdgT + localizerInterceptDeg(ap.crossM));
      const wheelH = sim.pos.y - sim.groundY - spec.gearHeight;
      const gsMps = Math.max(20, Math.hypot(sim.vel.x, sim.vel.z));
      if (wheelH > 15) {
        // Integrate only near the path (no windup while capturing from far above/below),
        // and start over when the active runway changes.
        if (sim.apGsEndId !== sim.activeEnd.id) { sim.apGsEndId = sim.activeEnd.id; sim.apGsIntegral = 0; }
        if (Math.abs(ap.heightAbovePathM) < 15) {
          sim.apGsIntegral = THREE.MathUtils.clamp(sim.apGsIntegral + ap.heightAbovePathM * dt, -100, 100);
        }
        holdGamma(glidepathGammaDeg(ap.heightAbovePathM, sim.apGsIntegral));
        sim.throttle = autoThrottle(vrefFor(spec, sim.flapsIndex) + 5, -3, dt);
      } else {
        // Flare from 15 m: trade sink rate for height; hold Vref+3 until ~8 m (25 ft), then retard.
        holdGamma(Math.atan2(flareSinkMps(wheelH), gsMps) * RAD_TO_DEG);
        if (wheelH > 8) sim.throttle = autoThrottle(vrefFor(spec, sim.flapsIndex) + 3, -1.5, dt);
        else sim.throttle = Math.max(0, sim.throttle - dt * 0.5);
      }
      if (sim.onGround) { sim.elevInput = 0; sim.throttle = 0; }
    } else {
      if (sim.apHdgHold) holdHeading(sim.targetHdgDeg);
      if (sim.apAltHold) {
        const altErrFt = sim.targetAltFt - sim.mslFt;
        holdGamma(THREE.MathUtils.clamp(altErrFt * 0.01, -4, 4));
      }
    }
  }

  // Forces, moments and integration (flightModel.js, pure and flight-tested headless), or
  // JSBSim under ?fdm=jsbsim once it has loaded, for the airframes it has a model of.
  if (jsbsim && jsbsim.flies(sim.aircraftKey)) { stepSystems(sim, spec, dt); jsbsim.step(sim, spec, dt); }
  else stepFlightModel(sim, spec, dt);

  // Telemetry derivatives
  sim.aglFt = Math.max(0, Math.round((sim.pos.y - sim.groundY) * M_TO_FT));
  sim.mslFt = Math.round(yToFtMsl(sim.pos.y));
  sim.vsiFpm = Math.round(sim.vel.y * M_TO_FT * 60);
  sim.gLoad = 1.0 + (sim.accelY / GRAVITY);

  // Warning alerts
  const stallWarning = isStallWarning(sim.iasKts, stallWarningKts(spec, sim.flapsIndex), sim.onGround);
  const gpwsWarning = isGpwsWarning(sim.aglFt, sim.vsiFpm, sim.onGround);
  const gearWarning = !gpwsWarning && isGearWarning(sim.aglFt, sim.vsiFpm, gearLocked(sim), sim.onGround);
  byId('stallAlertBanner').classList.toggle('hidden', !stallWarning);
  const banner = byId('masterAlertBanner');
  banner.classList.toggle('hidden', !gpwsWarning && !gearWarning);
  const bannerText = gearWarning ? 'TOO LOW — GEAR' : 'PULL UP — TERRAIN AHEAD';
  if (banner.textContent !== bannerText) banner.textContent = bannerText;
  // Spoken once per descent below 500 ft (GPWS mode 4A).
  if (gearWarning && !sim.gearWarned) { sim.gearWarned = true; audio.callout('too low, gear'); }
  else if (!gearWarning && sim.aglFt > 600) sim.gearWarned = false;
}

function updatePapi() {
  if (!papiLamps) return;
  // Every runway end's PAPI shows the true picture from where the aircraft is.
  const col = papiLamps.geometry.attributes.color.array;
  RUNWAY_ENDS.forEach((e, ei) => {
    const g = approachGeometry(e, sim.pos);
    const distToPapi = Math.max(10, g.distM + AIM_POINT_M);
    const white = g.distM > -AIM_POINT_M ? papiWhiteLights(Math.atan2(sim.pos.y - e.thrY, distToPapi) * RAD_TO_DEG) : 0;
    // Lamps are numbered outward from the runway; the inboard lamps turn red first.
    for (let i = 0; i < 4; i++) {
      const k = (ei * 4 + i) * 3;
      const isWhite = (3 - i) < white;
      col[k] = 1; col[k + 1] = isWhite ? 1 : 0.13; col[k + 2] = isWhite ? 1 : 0.13;
    }
  });
  papiLamps.geometry.attributes.color.needsUpdate = true;

  const txt = byId('txtPapiStatus');
  sim.papiWhite = null;
  if (!sim.activeEnd) { txt.textContent = '—'; txt.className = 'text-slate-400 font-bold ml-1'; return; }
  const ap = sim.approach;
  const numWhite = papiWhiteLights(Math.atan2(sim.pos.y - sim.activeEnd.thrY, Math.max(10, ap.distM + AIM_POINT_M)) * RAD_TO_DEG);
  sim.papiWhite = numWhite;
  if (numWhite === 2) {
    txt.textContent = 'ON GLIDESLOPE';
    txt.className = 'text-emerald-400 font-bold ml-1';
  } else if (numWhite > 2) {
    txt.textContent = numWhite === 4 ? 'HIGH' : 'SLIGHTLY HIGH';
    txt.className = 'text-sky-300 font-bold ml-1';
  } else {
    txt.textContent = numWhite === 0 ? 'LOW' : 'SLIGHTLY LOW';
    txt.className = 'text-amber-400 font-bold ml-1';
  }
}

// Re-pick the runway you're flying to (twice a second) and cache its approach geometry.
function updateActiveRunway(dt) {
  sim.rwySelectTimer -= dt;
  if (sim.rwySelectTimer <= 0) {
    sim.rwySelectTimer = 0.5;
    _euler.setFromQuaternion(sim.quat, 'YXZ');
    const hdg = (-_euler.y * RAD_TO_DEG + 360) % 360;
    if (!sim.onGround) sim.activeEnd = selectActiveRunway(RUNWAY_ENDS, sim.pos, hdg, sim.activeEnd);
  }
  if (sim.activeEnd) Object.assign(sim.approach, approachGeometry(sim.activeEnd, sim.pos));
}

function updateCamera() {
  if (!aircraftRoot) return;
  const mode = sim.cameraMode;

  if (mode === 0) {
    // 1. Cockpit 3D Pilot Eye
    const eye = _v1.copy(sim.spec.eyeOffset).applyQuaternion(sim.quat);
    camera.position.copy(sim.pos).add(eye);

    const fwd = _v2.set(0, sim.spec.eyeOffset.y - 0.15, -400).applyQuaternion(sim.quat);
    camera.lookAt(_v3.copy(sim.pos).add(fwd));
    camera.up.set(0, 1, 0).applyQuaternion(sim.quat);

  } else if (mode === 1) {
    // 2. Smooth Orbit Chase Cam
    const cy = Math.cos(sim.orbitPitch);
    const ox = Math.sin(sim.orbitYaw) * cy * sim.orbitDist;
    const oy = Math.sin(sim.orbitPitch) * sim.orbitDist + 4;
    const oz = Math.cos(sim.orbitYaw) * cy * sim.orbitDist;

    const orbitOffset = _v1.set(ox, oy, oz).applyQuaternion(sim.quat);
    camera.position.copy(sim.pos).add(orbitOffset);
    camera.lookAt(sim.pos.clone().add(_v2.set(0, 2, -10).applyQuaternion(sim.quat)));
    camera.up.set(0, 1, 0);

  } else if (mode === 2) {
    // 3. Spotter Flyby Drone Cam
    const offset = _v1.set(160, 25, -350);
    camera.position.copy(sim.pos).add(offset);
    camera.lookAt(sim.pos);
    camera.up.set(0, 1, 0);

  } else if (mode === 3) {
    // 4. Passenger Left Wing Tip View
    const wingOffset = _v1.set(-sim.spec.wingSpanM * 0.48, 1.2, 2.5).applyQuaternion(sim.quat);
    camera.position.copy(sim.pos).add(wingOffset);
    camera.lookAt(sim.pos.clone().add(_v2.set(-0.2, 0.4, -20).applyQuaternion(sim.quat)));
    camera.up.set(0, 1, 0).applyQuaternion(sim.quat);

  } else if (mode === 4) {
    // 5. KDFW ATC Tower Cab View (96m tower)
    camera.position.set(-960, ground.heightAt(-960, -80) + 96, -80);
    camera.lookAt(sim.pos);
    camera.up.set(0, 1, 0);

  } else {
    // 6. Tail Drone Cam
    const tailOffset = _v1.set(0, 7.5, 24).applyQuaternion(sim.quat);
    camera.position.copy(sim.pos).add(tailOffset);
    camera.lookAt(sim.pos.clone().add(_v2.set(0, 1.2, -40).applyQuaternion(sim.quat)));
    camera.up.set(0, 1, 0);
  }
  // External cameras never dip under the terrain (hills, or a chase cam on the runway).
  if (mode !== 0) {
    const floor = ground.heightAt(camera.position.x, camera.position.z) + 1.5;
    if (camera.position.y < floor) camera.position.y = floor;
  }
}

// One HUD tape: a vertical scale whose inner edge is at x (side −1 = scale to the left of
// it, +1 = to the right), centred on y, scrolling so `value` sits at the readout.
function drawTape(x, y, side, value, pxPerUnit, minor, major) {
  const half = 90;
  hudCtx.save();
  hudCtx.beginPath();
  hudCtx.rect(side < 0 ? x - 60 : x, y - half, 60, half * 2);
  hudCtx.clip();
  // A faint dark strip keeps the scale readable over bright imagery and still shows the
  // runway through it (a text shadow blur did the same at many times the cost on software
  // rasterizers).
  hudCtx.fillStyle = 'rgba(2, 6, 23, 0.3)';
  hudCtx.fill();
  hudCtx.strokeStyle = 'rgba(186, 230, 253, 0.85)';
  hudCtx.fillStyle = '#e0f2fe';
  hudCtx.font = '10px monospace';
  hudCtx.textAlign = side < 0 ? 'right' : 'left';
  hudCtx.beginPath();
  hudCtx.moveTo(x, y - half); hudCtx.lineTo(x, y + half);
  const lo = Math.floor((value - half / pxPerUnit) / minor) * minor;
  for (let v = lo; v <= value + half / pxPerUnit; v += minor) {
    const ty = y - (v - value) * pxPerUnit;
    const isMajor = v % major === 0;
    hudCtx.moveTo(x, ty); hudCtx.lineTo(x + side * (isMajor ? 9 : 5), ty);
    if (isMajor && Math.abs(ty - y) > 16) hudCtx.fillText(`${v}`, x + side * 12, ty + 3.5);
  }
  hudCtx.stroke();
  hudCtx.restore();
  // The readout box points at the scale.
  const bw = side < 0 ? 44 : 56;
  const bx = side < 0 ? x - 8 - bw : x + 8;
  hudCtx.fillStyle = 'rgba(2, 6, 23, 0.7)';
  hudCtx.strokeStyle = '#38bdf8';
  hudCtx.beginPath();
  hudCtx.rect(bx, y - 11, bw, 22);
  hudCtx.fill(); hudCtx.stroke();
  hudCtx.fillStyle = '#f0f9ff';
  hudCtx.font = 'bold 13px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.fillText(`${Math.round(value)}`, bx + bw / 2, y + 4.5);
  hudCtx.textAlign = 'left';
}

function renderHud() {
  const w = hudCanvas.width;
  const h = hudCanvas.height;
  hudCtx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  _euler.setFromQuaternion(sim.quat, 'YXZ');
  const pitchRad = _euler.x;
  const rollRad = _euler.z;
  const hdgTrue = -_euler.y * RAD_TO_DEG;
  const hdgDeg = Math.round((hdgTrue + 360) % 360);

  hudCtx.save();
  hudCtx.strokeStyle = '#38bdf8';
  hudCtx.fillStyle = '#38bdf8';
  hudCtx.lineWidth = 1.5;
  hudCtx.font = '12px monospace';

  // Aircraft Bore Sight Symbol
  hudCtx.beginPath();
  hudCtx.arc(cx, cy, 6, 0, Math.PI * 2);
  hudCtx.moveTo(cx - 18, cy); hudCtx.lineTo(cx - 6, cy);
  hudCtx.moveTo(cx + 6, cy); hudCtx.lineTo(cx + 18, cy);
  hudCtx.moveTo(cx, cy - 6); hudCtx.lineTo(cx, cy - 14);
  hudCtx.stroke();

  // Flight path marker (velocity vector), conformal (0073): the point in the scene the
  // aircraft is actually moving towards, projected through the camera, so it sits on the
  // ground exactly where the aircraft will meet it. Put it on the aim point to land there.
  const fpm = sim.vel.lengthSq() > 4 ? hudProject(_v1.copy(sim.vel).normalize().multiplyScalar(20000).add(camera.position), w, h) : null;
  if (fpm) {
    const fpmX = THREE.MathUtils.clamp(fpm.x, 40, w - 40), fpmY = THREE.MathUtils.clamp(fpm.y, 40, h - 40);
    hudCtx.strokeStyle = '#10b981';
    hudCtx.lineWidth = 2;
    hudCtx.beginPath();
    hudCtx.arc(fpmX, fpmY, 7, 0, Math.PI * 2);
    hudCtx.moveTo(fpmX - 18, fpmY); hudCtx.lineTo(fpmX - 7, fpmY);
    hudCtx.moveTo(fpmX + 7, fpmY); hudCtx.lineTo(fpmX + 18, fpmY);
    hudCtx.moveTo(fpmX, fpmY - 7); hudCtx.lineTo(fpmX, fpmY - 13);
    hudCtx.stroke();
    hudCtx.lineWidth = 1.5;
  }

  // Aim point (0073): a diamond on the runway's aiming point (the big white blocks, 1,000 ft
  // in), so "put the green ring on the diamond" flies the 3° path to the touchdown zone.
  const ae = sim.activeEnd;
  if (ae && !sim.onGround && sim.approach.distM > -AIM_POINT_M && sim.approach.distM < 20000) {
    const d = courseVector(ae.hdgT);
    const aim = hudProject(_v2.set(ae.thrX + d.x * AIM_POINT_M, ae.thrY, ae.thrZ + d.z * AIM_POINT_M), w, h);
    if (aim) {
      hudCtx.strokeStyle = '#f8fafc';
      hudCtx.beginPath();
      hudCtx.moveTo(aim.x, aim.y - 7); hudCtx.lineTo(aim.x + 7, aim.y);
      hudCtx.lineTo(aim.x, aim.y + 7); hudCtx.lineTo(aim.x - 7, aim.y); hudCtx.closePath();
      hudCtx.stroke();
    }
  }

  // Pitch Ladder
  hudCtx.save();
  hudCtx.translate(cx, cy);
  hudCtx.rotate(-rollRad);
  const pitchPxPerDeg = 7;
  const curPitchDeg = pitchRad * RAD_TO_DEG;
  [-20, -10, -5, 0, 5, 10, 20].forEach(deg => {
    const dy = (curPitchDeg - deg) * pitchPxPerDeg;
    if (dy > -140 && dy < 140) {
      hudCtx.strokeStyle = deg === 0 ? 'rgba(56, 189, 248, 0.9)' : 'rgba(56, 189, 248, 0.45)';
      hudCtx.beginPath();
      hudCtx.moveTo(-35, dy); hudCtx.lineTo(-12, dy);
      hudCtx.moveTo(12, dy); hudCtx.lineTo(35, dy);
      hudCtx.stroke();
      if (deg !== 0) {
        hudCtx.fillStyle = '#38bdf8';
        hudCtx.font = '9px monospace';
        hudCtx.fillText(`${deg}`, 40, dy + 3);
      }
    }
  });
  hudCtx.restore();

  // Speed and altitude tapes: see-through scales that scroll past a boxed readout, so
  // they never hide the runway (2 px per knot, 0.2 px per foot over a 180 px window).
  drawTape(cx - 131, cy, -1, sim.iasKts, 2, 5, 20);
  drawTape(cx + 130, cy, 1, sim.mslFt, 0.2, 100, 500);
  if (sim.activeEnd && !sim.onGround) drawSpeedBug(cx - 131, cy);
  if (sim.activeEnd && !sim.onGround && sim.aglFt < 60) drawFlareCue(cx, cy);

  // Heading
  const hdgTop = headingBoxTop(cy);
  hudCtx.strokeStyle = '#38bdf8';
  hudCtx.fillStyle = 'rgba(2, 6, 23, 0.55)';
  hudCtx.fillRect(cx - 40, hdgTop, 80, HEADING_BOX_H);
  hudCtx.strokeRect(cx - 40, hdgTop, 80, HEADING_BOX_H);
  hudCtx.fillStyle = '#e0f2fe';
  hudCtx.textAlign = 'center';
  hudCtx.font = 'bold 13px monospace';
  // Magnetic, like the runway numbers and a real compass (0078); the wind box stays true.
  hudCtx.fillText(sim.hudHdg = `${magHeadingText(hdgTrue)}°M`, cx, hdgTop + 16);
  hudCtx.font = '12px monospace';

  drawWindBox(w, h, hdgDeg);

  // ILS Guidance Crosshairs
  // Fly-to bars: the localizer bar sits where the centreline is (left when you're right of
  // it), the glideslope bar where the path is (below when you're high).
  if (sim.activeEnd && sim.approach.distM > -500 && sim.approach.distM < 20000) {
    const locDev = THREE.MathUtils.clamp(-sim.approach.crossM * 0.08, -80, 80);
    const gsDev = THREE.MathUtils.clamp(sim.approach.heightAbovePathM * 0.4, -60, 60);

    hudCtx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    hudCtx.setLineDash([3, 3]);
    hudCtx.beginPath();
    hudCtx.moveTo(cx + locDev, cy - 70); hudCtx.lineTo(cx + locDev, cy + 70);
    hudCtx.moveTo(cx - 70, cy + gsDev); hudCtx.lineTo(cx + 70, cy + gsDev);
    hudCtx.stroke();
    hudCtx.setLineDash([]);
  }

  // Stabilized-gate verdict (ticket 0020), for a few seconds after the gate
  if (sim.gate && sim.simTime < sim.gateShownUntil) drawGateVerdict(cx, cy);
  if (sim.takeoffCalloutIdx >= 0 && sim.simTime < sim.takeoffCallShownUntil) drawTakeoffCall(cx, cy);

  hudCtx.restore();
}

// Screen position (HUD canvas px) of a world point, or null behind the camera.
const _hudP = new THREE.Vector3();
const _hudXY = { x: 0, y: 0 };
function hudProject(p, w, h) {
  _hudP.copy(p).project(camera);
  if (_hudP.z > 1 || _hudP.z < -1) return null;
  _hudXY.x = (_hudP.x + 1) / 2 * w;
  _hudXY.y = (1 - _hudP.y) / 2 * h;
  return _hudXY;
}

// Target speed (Vref + 5) on the speed tape (0073): a magenta bug and its band, Vref to
// Vref + 10, the speeds a stable approach lives in; the bug parks at the tape's end when off scale.
function drawSpeedBug(x, y) {
  const target = vrefFor(sim.spec, sim.flapsIndex) + 5;
  const off = (target - sim.iasKts) * 2;
  const by = y - THREE.MathUtils.clamp(off, -88, 88);
  hudCtx.fillStyle = 'rgba(16, 185, 129, 0.35)';
  const top = THREE.MathUtils.clamp(y - (target + 5 - sim.iasKts) * 2, y - 90, y + 90);
  const bot = THREE.MathUtils.clamp(y - (target - 5 - sim.iasKts) * 2, y - 90, y + 90);
  hudCtx.fillRect(x - 3, top, 3, bot - top);
  hudCtx.fillStyle = '#e879f9';
  hudCtx.beginPath();
  hudCtx.moveTo(x, by); hudCtx.lineTo(x + 9, by - 6); hudCtx.lineTo(x + 9, by + 6); hudCtx.closePath();
  hudCtx.fill();
  hudCtx.font = 'bold 11px monospace';
  hudCtx.textAlign = 'right';
  hudCtx.fillText(`SPD ${Math.round(target)}`, x, y + 106);
  hudCtx.textAlign = 'left';
}

// Wind readout (0075): source, an arrow for where the wind blows relative to the nose, its
// speed and, low near the active runway, the cross and head/tail components. Box geometry in
// hudLayout.js; the text is refreshed once a second (syncWeatherUI), so nothing is built here.
const _windBox = windBoxRect(1, 1);
function drawWindBox(w, h, hdgDeg) {
  const r = windBoxRect(w, h, _windBox);
  const hw = sim.hudWind;
  // Calm is quiet but still legible: a dim border, the text at full contrast.
  hudCtx.fillStyle = 'rgba(2, 6, 23, 0.7)';
  hudCtx.strokeStyle = hw.calm ? '#475569' : '#38bdf8';
  hudCtx.fillRect(r.x, r.y, r.w, r.h);
  hudCtx.strokeRect(r.x, r.y, r.w, r.h);
  hudCtx.textAlign = 'left';
  hudCtx.font = 'bold 9px monospace';
  hudCtx.fillStyle = hw.live ? '#6ee7b7' : '#cbd5e1';
  hudCtx.fillText(hw.source, r.x + 3, r.y + 10);
  const arrow = windArrowDeg(hw.dirDeg, hw.kts, hdgDeg);
  if (arrow !== null) {
    hudCtx.save();
    hudCtx.translate(r.x + 12, r.y + 37);
    hudCtx.rotate(arrow * DEG_TO_RAD);
    hudCtx.strokeStyle = '#e0f2fe';
    hudCtx.fillStyle = '#e0f2fe';
    hudCtx.lineWidth = 2;
    hudCtx.beginPath();
    hudCtx.moveTo(0, 9); hudCtx.lineTo(0, -4);
    hudCtx.stroke();
    hudCtx.beginPath();
    hudCtx.moveTo(0, -10); hudCtx.lineTo(5, -3); hudCtx.lineTo(-5, -3); hudCtx.closePath();
    hudCtx.fill();
    hudCtx.restore();
  }
  hudCtx.font = 'bold 10px monospace';
  hudCtx.fillStyle = '#e0f2fe';
  hudCtx.fillText(hw.speed, r.x + 3, r.y + 22);
  if (hw.xw) {
    hudCtx.fillText(hw.xw, r.x + 24, r.y + 35);
    hudCtx.fillStyle = hw.hwKts < 0 ? '#fcd34d' : '#e0f2fe';
    hudCtx.fillText(hw.hw, r.x + 24, r.y + 47);
  }
}

// Flare cue (0073): under 60 ft, FLARE above the boresight (and IDLE under 30 ft with power on).
function drawFlareCue(cx, cy) {
  const idle = sim.aglFt < 30 && sim.throttle > 0.05;
  hudCtx.font = 'bold 15px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.fillStyle = idle ? '#fcd34d' : '#6ee7b7';
  hudCtx.fillText(idle ? '▼ IDLE ▼' : '▲ FLARE ▲', cx, cy - 34);
  hudCtx.textAlign = 'left';
}

function drawGateVerdict(cx, cy) {
  const g = sim.gate;
  const y = cy + 92;
  const lines = Math.ceil(g.failing.length / 3);
  hudCtx.textAlign = 'center';
  hudCtx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  hudCtx.fillRect(cx - 120, y - 16, 240, 24 + lines * 16);
  hudCtx.font = 'bold 13px monospace';
  hudCtx.fillStyle = g.stable ? '#6ee7b7' : '#fcd34d';
  hudCtx.fillText(g.stable ? 'STABILIZED' : 'UNSTABILIZED', cx, y + 1);
  // At most 3 items a line (≤ 26 characters, ~205 px), so the box always holds them.
  for (let i = 0; i < lines; i++) hudCtx.fillText(sim.gateLines[i], cx, y + 18 + i * 16);
}

// The takeoff callout's word (0035), just under the heading box (hudLayout.js).
function drawTakeoffCall(cx, cy) {
  const top = takeoffCallTop(cy);
  hudCtx.textAlign = 'center';
  hudCtx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  hudCtx.fillRect(cx - TAKEOFF_CALL_W / 2, top, TAKEOFF_CALL_W, TAKEOFF_CALL_H);
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillStyle = '#f8fafc';
  const words = sim.assist === 'pilot' ? TAKEOFF_CALLOUT_HUD : TAKEOFF_CALLOUT_HUD_PLAIN;
  hudCtx.fillText(words[sim.takeoffCalloutIdx], cx, top + 18);
}

function renderRadar() {
  const w = mapCanvas.width;
  const h = mapCanvas.height;
  mapCtx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const scale = 0.007;

  mapCtx.fillStyle = '#090e1a';
  mapCtx.fillRect(0, 0, w, h);

  mapCtx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  mapCtx.beginPath();
  mapCtx.arc(cx, cy, 35, 0, Math.PI * 2);
  mapCtx.arc(cx, cy, 65, 0, Math.PI * 2);
  mapCtx.stroke();

  // Runways in true orientation; the active one highlighted, airport idents labelled.
  mapCtx.lineCap = 'round';
  const labelled = new Set();
  for (const r of RUNWAYS_GEOM) {
    const d = courseVector(r.hdgT);
    const hx = d.x * r.lengthM / 2, hz = d.z * r.lengthM / 2;
    const ax = cx + (r.cx - hx - sim.pos.x) * scale, az = cy + (r.cz - hz - sim.pos.z) * scale;
    const bx = cx + (r.cx + hx - sim.pos.x) * scale, bz = cy + (r.cz + hz - sim.pos.z) * scale;
    const active = sim.activeEnd && r.ends.includes(sim.activeEnd.id);
    mapCtx.strokeStyle = active ? '#f59e0b' : '#38bdf8';
    mapCtx.lineWidth = active ? 3 : 2;
    mapCtx.beginPath(); mapCtx.moveTo(ax, az); mapCtx.lineTo(bx, bz); mapCtx.stroke();
    if (!labelled.has(r.airport)) {
      labelled.add(r.airport);
      mapCtx.fillStyle = '#94a3b8';
      mapCtx.font = '8px monospace';
      mapCtx.fillText(r.airport, Math.max(ax, bx) + 4, (az + bz) / 2);
    }
  }
  mapCtx.lineWidth = 1;

  const dx = cx + (DOWNTOWN_DALLAS.x - sim.pos.x) * scale;
  const dy = cy + (DOWNTOWN_DALLAS.z - sim.pos.z) * scale;
  mapCtx.fillStyle = '#10b981';
  mapCtx.beginPath();
  mapCtx.arc(dx, dy, 3.5, 0, Math.PI * 2);
  mapCtx.fill();
  mapCtx.fillText('DALLAS', dx + 5, dy + 2);

  // Ownship Chevron
  _euler.setFromQuaternion(sim.quat, 'YXZ');
  mapCtx.save();
  mapCtx.translate(cx, cy);
  mapCtx.rotate(_euler.y);
  mapCtx.fillStyle = '#f59e0b';
  mapCtx.beginPath();
  mapCtx.moveTo(0, -7);
  mapCtx.lineTo(5, 6);
  mapCtx.lineTo(0, 3);
  mapCtx.lineTo(-5, 6);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

// Autothrottle: the model's trim throttle for this speed and path, plus corrections.
const _apAir = {};
// Filtered airspeed trend (kt/s) for the autothrottle's proportional term. A jump of
// > 5 kt in one sub-step is a teleport (mission load), not flight: skip that sample.
function updateIasTrend(dt) {
  if (sim.apPrevIasKts !== null && dt > 0) {
    const dIas = sim.iasKts - sim.apPrevIasKts;
    if (Math.abs(dIas) < 5) sim.apIasRate += (dIas / dt - sim.apIasRate) * Math.min(1, dt / 0.5);
  }
  sim.apPrevIasKts = sim.iasKts;
}

// Kid / Learner (assists.js): shape the stick into the envelope; Kid also flies the
// throttle, gear and flaps. Pilot never comes here. Reuses module-scope objects.
const assistState = createAssistState();
const _assistIn = {};
const _assistOut = { elev: 0, ail: 0, rud: 0 };
const _assistCfg = { gearDown: true, flapsIndex: 0 };
const NO_AOA_LIMIT_DEG = 90;
function applyAssists(cfg, pitchIn, rollIn, yawIn, dt) {
  const spec = sim.spec;
  _euler.setFromQuaternion(sim.quat, 'YXZ');
  const wheelHeightM = sim.pos.y - sim.groundY - spec.gearHeight;
  const gsMps = Math.hypot(sim.vel.x, sim.vel.z);
  _assistIn.pitchIn = pitchIn; _assistIn.rollIn = rollIn; _assistIn.yawIn = yawIn;
  _assistIn.pitchDeg = _euler.x * RAD_TO_DEG;
  _assistIn.bankRightDeg = -_euler.z * RAD_TO_DEG;
  _assistIn.pitchRateUp = sim.angVel.x;
  _assistIn.rollRateRight = -sim.angVel.z;
  _assistIn.aoaDeg = sim.aoaDeg;
  _assistIn.betaDeg = sim.betaDeg;
  _assistIn.dihedralAil = dihedralAileron(spec, sim.betaDeg * DEG_TO_RAD);
  // The stall drill (0087) turns the stall protection off until the wing stalls (drillAssist).
  const drill = sim.stallDrill ? stallLib.drillAssist(sim.stallDrill.phase) : null;
  _assistIn.stallAoaDeg = drill && !drill.protect ? NO_AOA_LIMIT_DEG : stallAoaDeg(spec, sim.flapsIndex);
  _assistIn.tailstrikeDeg = spec.maxGroundPitchDeg ?? 15;
  _assistIn.onGround = sim.onGround;
  _assistIn.wheelHeightM = wheelHeightM;
  _assistIn.airspeedMps = sim.tasKts * 0.514444;
  const departing = cfg.autoThrottle && updateDeparture(assistState, sim.onGround, sim.aglFt);
  // Kid hands-off guide: level flight, or the localizer and glidepath on a final ahead.
  _assistIn.guideBankDeg = 0;
  _assistIn.guideGammaDeg = 0;
  const ap = sim.approach;
  if (departing || drill?.kidClimb) {
    _assistIn.guideGammaDeg = KID_CLIMB_GAMMA_DEG; // after lift-off or a stall: climb away, wings level
  } else if (cfg.handsOff && sim.activeEnd && ap.distM > 0 && ap.distM < 20000 && Math.abs(ap.crossM) < 1500) {
    const curHdg = (-_euler.y * RAD_TO_DEG + 360) % 360;
    if (Math.abs(headingError(sim.activeEnd.hdgT, curHdg)) < 45) {
      _assistIn.guideBankDeg = kidLocalizerBankDeg(sim.activeEnd.hdgT, curHdg, ap.crossM);
      _assistIn.guideGammaDeg = glidepathGammaDeg(ap.heightAbovePathM);
    }
  }
  shapeControls(cfg, assistState, _assistIn, dt, _assistOut);
  if (sim.onGround) {
    // The takeoff roll's stick, power and the stop are the player's, smoothed like Pilot's.
    sim.elevInput = THREE.MathUtils.lerp(sim.elevInput, _assistOut.elev, dt * 10);
    sim.aileronInput = THREE.MathUtils.lerp(sim.aileronInput, _assistOut.ail, dt * 10);
    sim.rudderInput = THREE.MathUtils.lerp(sim.rudderInput, _assistOut.rud, dt * 10);
    return;
  }
  sim.elevInput = _assistOut.elev;
  sim.aileronInput = _assistOut.ail;
  sim.rudderInput = _assistOut.rud;
  if (cfg.autoConfig) {
    _assistCfg.gearDown = sim.gearDown; _assistCfg.flapsIndex = sim.flapsIndex;
    autoConfigure(spec, sim, _assistCfg);
    sim.gearDown = _assistCfg.gearDown; sim.flapsIndex = _assistCfg.flapsIndex;
  }
  if (cfg.autoThrottle) {
    updateIasTrend(dt);
    if (drill && drill.kidThrottle !== null) {
      sim.throttle = drill.kidThrottle; // the stall drill: idle until the stall, then full power
    } else if (departing) {
      sim.throttle = 1; // full power until 1,000 ft
    } else if (wheelHeightM > 8) {
      const gammaDeg = Math.atan2(sim.vel.y, Math.max(20, gsMps)) * RAD_TO_DEG;
      const drillKts = sim.goAround?.phase === 'approach' ? sim.goAround.holdKts : 0;
      sim.throttle = autoThrottle(drillKts || kidTargetKts(spec, sim.flapsIndex), gammaDeg, dt);
    } else {
      sim.throttle = Math.max(0, sim.throttle - dt * 0.5); // retard in the flare, like the autoland
    }
  }
}

function autoThrottle(targetKts, gammaDeg, dt) {
  airAt(sim.pos.y + sim.mslOffsetM, sim.isaDevC, sim.altimInHg, _apAir);
  const ff = trimThrottle(sim.spec, targetKts * 0.514444, sim.flapsIndex, gammaDeg, sim.gearDown, _apAir);
  return autothrottleCommand(ff, sim.apAt, sim.iasKts, targetKts, sim.apIasRate, dt);
}

function resetApFilters() {
  sim.apPrevIasKts = null;
  sim.apIasRate = 0;
  sim.apAt.trim = 0;
  sim.apGsIntegral = 0;
  sim.apGsEndId = null;
}

// `final` (?debug only, 0068): fly the default final to another runway end or distance.
function loadScenario(key, final = null) {
  const mission = final ? { ...MISSIONS[0], ...final } : missionByKey(key, sim.dynamicMissions);
  // A mission flown in one airframe (the stall drill's Cessna) brings it; the next mission
  // without one gives yours back.
  if (mission.aircraft) {
    if (mission.aircraft !== sim.aircraftKey) { aircraftBeforeMission ??= sim.aircraftKey; setAircraft(mission.aircraft); }
  } else if (aircraftBeforeMission) { setAircraft(aircraftBeforeMission); aircraftBeforeMission = null; }
  sim.missionKey = mission.key;
  let trimAlpha = null;
  sim.loadedMission = mission;
  sim.brakesOn = false;
  sim.apMaster = false;
  sim.apApproach = false;
  resetApFilters();
  resetAssistState(assistState);
  softResetAt = null;
  sim.lastCalloutIdx = -1;
  sim.takeoffCalloutIdx = -1;
  sim.takeoffCalls.length = 0;
  sim.takeoffCallShownUntil = 0;
  Object.assign(sim.gateState, { armed: false, armFt: GATE_VMC_FT, done: false });
  sim.gate = null;
  sim.gateShownUntil = 0;
  sim.angVel.set(0, 0, 0);
  sim.rwySelectTimer = 0;
  sim.landingGraded = false;
  sim.airborneTime = 0;
  sim.lastLanding = null;
  pendingLanding = null;
  startGoAroundDrill(mission);
  startStallDrill(mission);
  resetCoach();
  coachHandover = false;
  Object.assign(tutor, createTutor());
  byId('resultsCard').classList.add('hidden');
  resumeFromResults();

  if (mission.kind === 'final') {
    const end = runwayEnd(mission.airport, mission.rwy);
    // The go-around drill (0047) starts fast and high on purpose.
    const vApp = (sim.spec.vrefKts + 5 + (mission.fastKts ?? 0)) * 0.514444; // indicated
    const airThr = airAt(end.thrY + REF_ELEV_M, sim.isaDevC, sim.altimInHg);
    const vTas = tasFromIas(vApp, airThr.sigma);
    const highM = Math.tan((mission.highDots ?? 0) * GS_DOT_DEG * DEG_TO_RAD) * (mission.distNm * NM_TO_M + AIM_POINT_M);
    const s = approachSpawn(end, mission.distNm, vTas, highM);
    sim.pos.set(s.pos.x, s.pos.y, s.pos.z);
    sim.vel.set(s.vel.x, s.vel.y, s.vel.z);
    sim.flapsIndex = 2;
    // Spawn in trim: pitch = trim AoA − 3° path, so the final starts stable, not sinking.
    const pitch = (trimAoaDeg(sim.spec, vApp, sim.flapsIndex) - 3) * DEG_TO_RAD;
    sim.quat.setFromEuler(_euler.set(pitch, s.yawRad, 0, 'YXZ'));
    sim.throttle = trimThrottle(sim.spec, vApp, sim.flapsIndex, -3, true, airThr);
    trimAlpha = trimAoaDeg(sim.spec, vApp, sim.flapsIndex);
    sim.gearDown = true;
    sim.onGround = false;
    sim.activeEnd = end;
  } else if (mission.kind === 'takeoff') {
    const end = runwayEnd(mission.airport, mission.rwy);
    const s = takeoffSpawn(end);
    sim.pos.set(s.pos.x, ground.heightAt(s.pos.x, s.pos.z) + sim.spec.gearHeight, s.pos.z);
    sim.vel.set(0, 0, 0);
    sim.quat.setFromAxisAngle(_v3.set(0, 1, 0), s.yawRad);
    sim.throttle = 0;
    sim.flapsIndex = 1;
    // Takeoff trim: a neutral stick flies the climb-out speed (1.2 Vr, in m/s) once it lifts off.
    trimAlpha = trimAoaDeg(sim.spec, sim.spec.vrKts * 0.617, 1);
    sim.gearDown = true;
    sim.onGround = true;
    sim.activeEnd = end;
  } else if (mission.kind === 'drill') {
    // High over a fixed point, clean, in trim at its speed and level (0087).
    const [x, z] = mission.pos;
    const vIas = mission.kias * 0.514444;
    const y = ground.heightAt(x, z) + mission.aglFt * FT_TO_M;
    const air = airAt(y + REF_ELEV_M, sim.isaDevC, sim.altimInHg);
    const vTas = tasFromIas(vIas, air.sigma);
    const d = courseVector(mission.hdg);
    sim.pos.set(x, y, z);
    sim.vel.set(d.x * vTas, 0, d.z * vTas);
    sim.flapsIndex = 0;
    sim.gearDown = !!sim.spec.fixedGear;
    sim.quat.setFromEuler(_euler.set(trimAoaDeg(sim.spec, vIas, 0) * DEG_TO_RAD, -mission.hdg * DEG_TO_RAD, 0, 'YXZ'));
    sim.throttle = trimThrottle(sim.spec, vIas, 0, 0, sim.gearDown, air);
    trimAlpha = trimAoaDeg(sim.spec, vIas, 0);
    sim.onGround = false;
    sim.activeEnd = null;
  } else {
    const [x, y, z] = mission.pos;
    const yaw = -mission.hdg * DEG_TO_RAD;
    const d = courseVector(mission.hdg);
    sim.pos.set(x, y, z);
    sim.vel.set(d.x * mission.speedMps, 0, d.z * mission.speedMps);
    sim.quat.setFromAxisAngle(_v3.set(0, 1, 0), yaw);
    sim.throttle = mission.throttle;
    sim.flapsIndex = 0;
    sim.gearDown = !!sim.spec.fixedGear;
    sim.onGround = false;
    sim.activeEnd = null;
  }
  sim.engineN = sim.throttle; // engines start spooled to the spawn's power setting
  // Finals and the drill are trimmed for their speed (the wind can change the airspeed after the
  // spawn); tours spawn level, so their first step's angle of attack is the trim (0090).
  sim.trimAlphaDeg = trimAlpha;
  sim.spoilers = 0; // a landing's deployed spoilers must not ride into the next final
  // Airline practice on a final: autobrake 2 armed, reversers stowed (systems.js). The
  // gear and flaps start where the spawn put the levers.
  sim.autobrake = mission.kind === 'final' && systemsOf(sim.spec).autobrake ? 2 : 0;
  sim.gearWarned = false;
  seedSystems(sim.spec, sim);
  sim.groundY = ground.heightAt(sim.pos.x, sim.pos.z);
  // Airborne spawns fly their speed through the air: the wind adds to the ground velocity
  // (a final with a tailwind starts at its airspeed, not 5 kt slow).
  if (!sim.onGround) {
    updateWind(0);
    sim.vel.add(sim.windVec);
  }
  photoreal?.noteSessionReuse(); // a new mission keeps the same Google session (usage counter)
  if (sim.activeEnd) Object.assign(sim.approach, approachGeometry(sim.activeEnd, sim.pos));
  byId('rngThrottle').value = Math.round(sim.throttle * 100);
  syncMissionPicker(mission);
}

// Time of day (ticket 0014): Now (the real sun over DFW, followed minute by minute), or
// today's Dawn / Noon / Dusk / Night. The sun sets light direction, light colours, sky and haze.
function placeSun() {
  Object.assign(sun, sunPreset(TIME_MODES[sim.timeOfDayMode], new Date(), DFW_ORIGIN_LAT, DFW_ORIGIN_LON));
  sunDirection(sun, _sunVec);
  sunLight.position.set(_sunVec.x, _sunVec.y, _sunVec.z).multiplyScalar(10000);
  const look = skyForSun(sun.elevationDeg);
  sunLight.color.setHex(look.sun);
  sunLight.intensity = look.sunIntensity * LIGHT_SCALE;
  ambientLight.color.setHex(look.ambient);
  ambientLight.intensity = look.ambientIntensity * LIGHT_SCALE;
}

// Terrain relief is baked into vertex colours once per tile, so it takes the boot-time sun,
// held at least 20° up: a grazing or night sun would blacken every slope facing away.
function reliefSunDir() {
  const d = sunDirection({ elevationDeg: Math.max(20, sun.elevationDeg), azimuthDeg: sun.azimuthDeg });
  return new THREE.Vector3(d.x, d.y, d.z);
}

function applySun() {
  placeSun();
  applySky(); // also re-lights the ground
  const mode = TIME_MODES[sim.timeOfDayMode];
  for (const btn of document.querySelectorAll('#timePicker .btnTime')) {
    const on = Number(btn.dataset.time) === sim.timeOfDayMode;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  byId('txtSkyNow').textContent = skyCaption(mode);
  byId('txtTimeBadge').textContent = mode;
  byId('btnTimeOfDay').title = `Sun: ${mode} (${Math.round(sun.elevationDeg)}° up). Cycle Now / Dawn / Noon / Dusk / Night`;
}

// One line under the When? picker: what the sky over Dallas is doing at that moment.
const DALLAS_CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
function skyCaption(mode) {
  const st = skyDome?.state ?? NO_SKY;
  const el = Math.round(sun.elevationDeg);
  const light = el > 6 ? `sun ${el}° up` : el > -1 ? 'sun on the horizon' : el > -6 ? 'twilight' : 'dark';
  const moon = st.moonElevationDeg > 0 ? `Moon ${Math.round(st.moonIllumination * 100)}% lit, ${Math.round(st.moonElevationDeg)}° up` : 'Moon below the horizon';
  const when = mode === 'Now' ? `Live over Dallas, ${DALLAS_CLOCK.format(new Date(sun.at))}` : `Today's ${mode === 'Noon' ? 'midday' : mode.toLowerCase()} in Dallas, ${DALLAS_CLOCK.format(new Date(sun.at))}`;
  return `${when} · ${light} · ${moon}`;
}
for (const btn of document.querySelectorAll('#timePicker .btnTime')) {
  btn.addEventListener('click', () => { sim.timeOfDayMode = Number(btn.dataset.time); applySun(); });
}

// Clean view (desktop): panels folded away, the world fills the screen (H toggles).
function setCleanView(clean, remember = true) {
  document.body.classList.toggle('view-clean', clean);
  if (!clean) setHudMenu(false);
  if (remember) { try { saveCleanView(window.localStorage, clean); } catch { /* storage unavailable */ } }
}
byId('btnPanelsShow').addEventListener('click', () => setCleanView(false));
byId('btnPanelsHide').addEventListener('click', () => setCleanView(true));

function toggleTimeOfDay() {
  sim.timeOfDayMode = (sim.timeOfDayMode + 1) % TIME_MODES.length;
  applySun();
}

let rngThrottleEl = null;
let draggingThrottle = false;
// The flap lever's detent (deg) for the current notch, as the airframe labels it.
const flapDeg = () => (sim.spec.flapDetentsDeg ?? sim.flapAngles)[sim.flapsIndex];
// Where the flaps are, and where they are going while they move (systems.js).
const flapText = () => {
  const at = Math.round(sim.flapDeg ?? flapDeg());
  return at === flapDeg() ? `${at}°` : `${at}→${flapDeg()}°`;
};

function syncUI() {
  const throttlePct = Math.round(sim.throttle * 100);
  byId('txtThrottle').textContent = `${throttlePct}%`;
  // Autothrottle and gamepad move sim.throttle too: keep the slider honest, but never
  // fight a player who is dragging it (ticket 0017). Focus alone doesn't count: a range
  // input keeps focus after a click, and arrow keys must step from the current throttle.
  const rng = rngThrottleEl || (rngThrottleEl = byId('rngThrottle'));
  if (!draggingThrottle && Math.abs(Number(rng.value) - throttlePct) >= 1) rng.value = throttlePct;
  byId('txtIasGs').textContent = `${Math.round(sim.iasKts)}/${sim.gsKts}K`;
  byId('txtAltMsl').textContent = `${sim.mslFt} FT`;
  byId('txtAltAgl').textContent = `${sim.aglFt} FT`;
  byId('txtVsi').textContent = `${sim.vsiFpm} FPM`;
  byId('txtGLoad').textContent = `${sim.gLoad.toFixed(2)}G`;
  byId('txtAoaBadge').textContent = `${sim.aoaDeg.toFixed(1)}°`;

  _euler.setFromQuaternion(sim.quat, 'YXZ');
  byId('txtRadarHdg').textContent = `${magHeadingText(-_euler.y * RAD_TO_DEG)}°M`;

  const nav1 = byId('txtNav1');
  if (sim.activeEnd) {
    const distNm = Math.max(0, sim.approach.distM) / NM_TO_M;
    byId('txtNavDist').textContent = `DME ${distNm.toFixed(1)} NM`;
    nav1.textContent = `NAV1: ${sim.activeEnd.name} ILS · RWY ${magHeadingText(sim.activeEnd.hdgT)}°M`;
  } else {
    byId('txtNavDist').textContent = 'DME ---';
    nav1.textContent = 'NAV1: no runway ahead';
  }
  byId('txtSurfaceState').textContent = sim.onGround ? 'TOUCHDOWN / GROUND' : 'AIRBORNE';

  byId('btnApMaster').classList.toggle('active', sim.apMaster);
  byId('btnApHdg').classList.toggle('active', sim.apHdgHold);
  byId('btnApAlt').classList.toggle('active', sim.apAltHold);
  byId('btnApApr').classList.toggle('active', sim.apApproach);

  // Gear and flaps as they are, not as the levers are: amber while the hydraulics move them.
  const locked = gearLocked(sim), transit = gearInTransit(sim);
  byId('btnGear').classList.toggle('active', locked);
  byId('btnGear').classList.toggle('active-amber', transit);
  byId('txtGear').textContent = locked ? 'DOWN 3 GRN' : transit ? (sim.gearDown ? 'TRANSIT ▼' : 'TRANSIT ▲') : 'UP';

  byId('txtFlaps').textContent = flapText();
  byId('btnBrakes').classList.toggle('active-amber', sim.brakesOn);
  byId('txtBrakes').textContent = sim.brakesOn ? 'SET' : sim.autobrakeActive ? 'AUTO' : 'OFF';
  const sys = systemsOf(sim.spec);
  byId('btnAutobrake').disabled = !sys.autobrake;
  byId('txtAutobrake').textContent = sys.autobrake ? AUTOBRAKE_LABELS[sim.autobrake] : 'N/A';
  byId('btnAutobrake').classList.toggle('active-amber', sim.autobrakeActive);
  byId('btnReverse').disabled = !sys.reverser;
  byId('txtReverse').textContent = !sys.reverser ? 'N/A' : sim.reverserPos >= 1 ? 'REV' : sim.reverserPos > 0 ? 'UNLK' : 'STOW';
  byId('btnReverse').classList.toggle('active-amber', sim.reverserPos > 0);
  byId('txtHyd').textContent = sys.hydraulics ? `HYD ${sim.hydPsi} PSI` : 'HYD —';

  byId('meterElev').textContent = `${Math.round(sim.elevInput * 100)}%`;
  byId('meterAil').textContent = `${Math.round(sim.aileronInput * 100)}%`;
  byId('meterRud').textContent = `${Math.round(sim.rudderInput * 100)}%`;

  const knob = byId('virtualStickKnob');
  if (knob) {
    const kx = sim.aileronInput * 36;
    const ky = sim.elevInput * 36;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  // Show the autopilot's hands: light the stick and throttle while it flies them.
  if (sim.apMaster !== apGlowShown) {
    apGlowShown = sim.apMaster;
    for (const id of AP_GLOW_IDS) byId(id)?.classList.toggle('ap-flying', sim.apMaster);
  }

  // Phone layout (touch deck + telemetry strip)
  const tKnob = byId('touchStickKnob');
  tKnob.style.transform = `translate(${sim.aileronInput * 44}px, ${sim.elevInput * 44}px)`;
  const thrPct = Math.round(sim.throttle * 100);
  byId('txtTouchThr').textContent = `${thrPct}%`;
  byId('touchThrottleFill').style.height = `${thrPct}%`;
  byId('touchThrottleHandle').style.bottom = `${thrPct}%`;
  byId('touchThrottle').setAttribute('aria-valuenow', String(thrPct));
  byId('txtTouchGear').textContent = locked ? 'DN' : transit ? '···' : 'UP';
  byId('touchGear').classList.toggle('active', locked);
  byId('txtTouchFlaps').textContent = flapText();
  byId('touchBrakes').classList.toggle('active-amber', sim.brakesOn);
  // On the ground the ILS button is the reverse levers (airframes that have them).
  const revSlot = sim.onGround && !!sys.reverser;
  const ilsTxt = revSlot ? (sim.reverserPos > 0 ? 'REV ON' : 'REV') : 'ILS AUTO';
  const ilsEl = byId('txtTouchIls');
  if (ilsEl.textContent !== ilsTxt) ilsEl.textContent = ilsTxt;
  byId('touchIls').classList.toggle('active-amber', revSlot ? sim.reverserPos > 0 : sim.apApproach);
  byId('txtPhoneIas').textContent = `${Math.round(sim.iasKts)}`;
  byId('txtPhoneAgl').textContent = `${sim.aglFt}`;
  byId('txtPhoneVs').textContent = `${sim.vsiFpm}`;
  byId('txtPhoneThr').textContent = `${throttlePct}%`;
  byId('txtPhoneConfig').textContent = `${sim.spec.fixedGear ? 'FIXED' : locked ? 'DN' : transit ? '···' : 'UP'} · ${flapText()}`;
  const papi = byId('txtPapiStatus');
  const phonePapi = byId('txtPhonePapi');
  phonePapi.textContent = papi.textContent.replace('ON GLIDESLOPE', 'ON GS').replace('SLIGHTLY ', '');
  phonePapi.className = papi.className.replace('ml-1', '');
}

function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w === 0 || h === 0) return;

  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = cameraFovDeg(w, h); // wider vertical in portrait (0044)
  camera.updateProjectionMatrix();
  photoreal?.resize();

  hudCanvas.width = w;
  hudCanvas.height = h;

  const mapRect = mapCanvas.parentElement.getBoundingClientRect();
  mapCanvas.width = Math.max(120, Math.floor(mapRect.width));
  mapCanvas.height = Math.max(80, Math.floor(mapRect.height));
}

window.addEventListener('resize', handleResize);

// Modal Triggers. The modal is a dialog (ticket 0007): Tab stays inside it while it is open,
// Escape closes it, and focus goes back to whatever opened it.
const onboardingModal = byId('onboardingModal');
let modalOpener = null;
let cockpitEntered = false; // the start screen was dismissed once (ticket 0032)
function openModal(opener) {
  modalOpener = opener;
  refreshMissionBests();
  onboardingModal.classList.remove('hidden');
  byId('modalPanel').focus({ preventScroll: true });
}
// Focus goes back to the opener only when the modal was dismissed from the keyboard (Esc,
// or ✕ activated with Enter/Space); after a mouse/touch close or ENTER COCKPIT nothing
// keeps focus, so a flight key can't land on a HUD button.
function closeModal(restoreFocus = false) {
  cockpitEntered = true; // ENTER COCKPIT, ✕ or Esc: the flight is under way
  onboardingModal.classList.add('hidden');
  // On phones the Missions button lives in the folded menu: fall back to ☰ Menu.
  const back = restoreFocus && [modalOpener, byId('btnMenu')].find((el) => el?.offsetParent);
  if (back) back.focus({ preventScroll: true });
  else document.activeElement?.blur();
  modalOpener = null;
}
const modalOpen = () => !onboardingModal.classList.contains('hidden');
byId('btnCloseModal').addEventListener('click', (e) => {
  applyCoachChoice();
  closeModal(e.detail === 0);
});
// ?fdm=jsbsim: the Cessna flies on JSBSim (WASM, LGPL, src/fdm/), fetched only once someone
// starts flying so it never touches boot. Until it arrives (or if it can't load) the
// built-in model flies; the adapter picks up from wherever the aircraft is.
const jsbsimWanted = fdmFromLink(window.location.search) === 'jsbsim';
let jsbsim = null;
let jsbsimLoading = false;
function loadJsbsimOnce() {
  if (!jsbsimWanted || jsbsimLoading) return;
  jsbsimLoading = true;
  import('./fdm/loadJsbsim.js')
    .then((m) => m.loadJsbsim(import.meta.env.BASE_URL))
    .then((f) => { jsbsim = f; })
    .catch((e) => console.warn('[openaero] JSBSim unavailable, flying the built-in model:', e));
}

byId('btnStartFlight').addEventListener('click', () => {
  loadJsbsimOnce();
  if (!detailedModelsArmed) {
    detailedModelsArmed = true;
    attachDetailedModel(sim.aircraftKey);
  }
  if (byId('chkAutoSound').checked) audio.init();
  applyCoachChoice();
  // The (billable) Google session starts only when someone actually flies, once per page.
  if (photorealAllowed(window.location) && !terrainOnly(window.location.search)) photoreal.start(`${import.meta.env.BASE_URL}api/config`);
  closeModal();
});
byId('btnOpenMissions').addEventListener('click', (e) => {
  setHudMenu(false);
  openModal(e.currentTarget);
});
document.addEventListener('keydown', (e) => {
  if (!modalOpen()) return;
  if (e.key === 'Escape') { byId('btnCloseModal').click(); return; }
  if (e.key !== 'Tab') return;
  const items = [...onboardingModal.querySelectorAll('button, input, select, a[href]')]
    .filter((el) => !el.disabled && el.offsetParent);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  const inside = onboardingModal.contains(document.activeElement) && document.activeElement !== byId('modalPanel');
  if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
});

// Phone top HUD (ticket 0021): ☰ Menu opens the folded bars as a sheet (CSS shows #hudMenu
// always from lg up). Picking a mission, resetting or touching the view closes it.
function setHudMenu(open) {
  const menu = byId('hudMenu');
  const btn = byId('btnMenu');
  // Focus inside a sheet that is about to vanish goes back to the button that opens it.
  if (!open && menu.contains(document.activeElement) && btn.offsetParent) btn.focus();
  menu.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('hud-menu-open', open);
}
byId('btnMenu').addEventListener('click', () => {
  setHudMenu(!byId('hudMenu').classList.contains('open'));
});
for (const id of ['simCanvas', 'touchStick', 'touchThrottle']) {
  byId(id).addEventListener('pointerdown', () => setHudMenu(false));
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setHudMenu(false); });

byId('missionList').addEventListener('click', (e) => {
  const btn = e.target.closest('.btnMission');
  if (!btn) return;
  const scenario = btn.dataset.scenario;
  byId('selScenario').value = scenario;
  loadScenario(scenario);
});

// Aircraft Selector
byId('selAircraft').addEventListener('change', (e) => {
  aircraftBeforeMission = null; // you picked this one
  // The stall drill is the Cessna's (its POH figure, its best): another airframe ends it.
  sim.stallDrill = null;
  setAircraft(e.target.value);
});
function setAircraft(key) {
  byId('selAircraft').value = key;
  sim.aircraftKey = key;
  sim.spec = AIRCRAFT_DATABASE[sim.aircraftKey];
  sim.trimAlphaDeg = null; // the new airframe trims where it flies now (0090)
  if (sim.spec.fixedGear) sim.gearDown = true;
  if (!systemsOf(sim.spec).autobrake) sim.autobrake = 0;
  seedSystems(sim.spec, sim); // the new airframe's gear and flaps where its levers are
  sim.takeoffCalloutIdx = -1; // its own callouts (0035), from the top
  sim.takeoffCalls.length = 0;
  byId('txtAircraftTitle').textContent = sim.spec.name;
  buildAircraft(sim.aircraftKey);
}
// ?fdm=jsbsim flies the Cessna, the airframe with a JSBSim model so far.
if (jsbsimWanted) {
  const sel = byId('selAircraft');
  sel.value = 'c172';
  sel.dispatchEvent(new Event('change'));
}

byId('selScenario').addEventListener('change', e => {
  loadScenario(e.target.value);
});

// Camera, Satellite & Time Toggles
byId('btnCamera').addEventListener('click', () => {
  sim.cameraMode = (sim.cameraMode + 1) % sim.cameraNames.length;
  byId('txtCamMode').textContent = sim.cameraNames[sim.cameraMode];
});

byId('btnSatLayer').addEventListener('click', () => {
  sim.satelliteEnabled = !sim.satelliteEnabled;
  if (terrainGroup) terrainGroup.visible = sim.satelliteEnabled;
  setPhotorealMode(photorealOn);
  const txt = byId('txtSatState');
  txt.textContent = sim.satelliteEnabled ? 'Satellite' : 'Grid';
  byId('btnSatLayer').classList.toggle('active-sky', sim.satelliteEnabled);
});

byId('btnMouseYoke').addEventListener('click', () => {
  sim.mouseYoke = !sim.mouseYoke;
  const txt = byId('txtMouseYokeState');
  const crosshair = byId('mouseFlightCrosshair');
  if (sim.mouseYoke) {
    txt.textContent = 'ON';
    txt.className = 'text-emerald-400 font-bold';
    byId('btnMouseYoke').classList.add('active');
    crosshair.classList.remove('hidden');
  } else {
    txt.textContent = 'OFF';
    txt.className = 'text-amber-400 font-bold';
    byId('btnMouseYoke').classList.remove('active');
    crosshair.classList.add('hidden');
    sim.aileronInput = 0;
    sim.elevInput = 0;
  }
});

byId('btnTimeOfDay').addEventListener('click', toggleTimeOfDay);

function setPaused(paused) {
  if (!paused && gfx.lost) return; // nothing to fly by until the GPU is back (0034)
  gfx.hidPaused = false;
  sim.paused = paused;
  audio.pause(paused);
  byId('btnPause').textContent = sim.paused ? 'RESUME' : 'PAUSE';
  // Pause/Resume lives in the folded menu on phones: say so on the button that's always shown.
  const menuBtn = byId('btnMenu');
  menuBtn.textContent = sim.paused ? '☰ PAUSED' : '☰ Menu';
  menuBtn.setAttribute('aria-label', sim.paused ? 'Menu, paused' : 'Menu');
  menuBtn.classList.toggle('text-red-400', sim.paused);
  menuBtn.classList.toggle('text-sky-300', !sim.paused);
}
byId('btnPause').addEventListener('click', () => {
  resultsPaused = false; // the player's own pause or resume: KEEP FLYING must not undo it
  setPaused(!sim.paused);
  if (!sim.paused) setHudMenu(false); // on a phone, Resume puts the view back
});

// Ticket 0032: switching tabs or locking the phone pauses the flight (also behind the
// Missions modal mid-flight, where the sim keeps running). Coming back does not resume it:
// the player taps Resume, so a landing never starts without them. Before the first ENTER
// COCKPIT nothing is flying and there is no sound yet.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !sim.paused && cockpitEntered) { setPaused(true); gfx.hidPaused = true; }
});

// Ticket 0034: phones and integrated GPUs take the WebGL context back (backgrounding, memory
// pressure). preventDefault() asks for it back; until then the sim is paused behind an
// overlay. three.js re-uploads what it still holds on restore; the imagery cache is dropped
// on loss and streams in again. The player resumes with a tap; no restore in 5 s offers Reload.
const gfxLostEl = byId('gfxLost');
const gfxPanel = byId('gfxLostPanel');
const txtGfxLost = byId('txtGfxLost');
const gfxWaitText = txtGfxLost.textContent; // index.html's first line
const txtGfxLostTitle = byId('txtGfxLostTitle');
const btnGfxResume = byId('btnGfxResume');
const btnGfxReload = byId('btnGfxReload');
simCanvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  if (gfx.lost) return;
  // A phone usually loses the context in the background, after hiding paused the flight:
  // that pause was the system's, so RESUME FLIGHT may undo it. The player's own pause stays.
  // A second loss before the card is dismissed keeps the first one's answer.
  if (gfxLostEl.classList.contains('hidden')) gfx.pausedIt = !sim.paused || gfx.hidPaused;
  setPaused(true);
  gfx.lost = true;
  terrainLod?.reset();
  txtGfxLostTitle.textContent = 'Graphics paused';
  txtGfxLost.textContent = gfxWaitText;
  btnGfxResume.classList.add('hidden');
  btnGfxReload.classList.add('hidden');
  gfxLostEl.classList.remove('hidden');
  gfxPanel.focus();
  clearTimeout(gfx.reloadTimer);
  gfx.reloadTimer = setTimeout(() => {
    if (!gfx.lost) return;
    txtGfxLost.textContent = 'The graphics did not come back. Reload to start a new flight (your best scores are saved).';
    btnGfxReload.classList.remove('hidden');
    btnGfxReload.focus();
  }, 5000);
});
simCanvas.addEventListener('webglcontextrestored', () => {
  gfx.lost = false;
  clearTimeout(gfx.reloadTimer);
  txtGfxLostTitle.textContent = 'Graphics are back';
  txtGfxLost.textContent = gfx.pausedIt ? 'Ready when you are.' : 'Your flight is still paused, as you left it.';
  btnGfxResume.textContent = gfx.pausedIt ? 'RESUME FLIGHT' : 'CONTINUE';
  btnGfxReload.classList.add('hidden');
  btnGfxResume.classList.remove('hidden');
  btnGfxResume.focus();
});
btnGfxResume.addEventListener('click', () => {
  gfxLostEl.classList.add('hidden');
  if (gfx.pausedIt) setPaused(false);
  gfx.pausedIt = false;
});
// While the card is up it owns the keyboard: Tab cycles its buttons, and no flight key, the
// start screen's Escape or its Tab trap reaches anything behind it. Enter/Space press buttons.
document.addEventListener('keydown', (e) => {
  if (gfxLostEl.classList.contains('hidden')) return;
  e.stopImmediatePropagation();
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const items = [btnGfxResume, btnGfxReload].filter((b) => !b.classList.contains('hidden'));
  if (!items.length) { gfxPanel.focus(); return; }
  const i = items.indexOf(document.activeElement);
  items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
}, true);
btnGfxReload.addEventListener('click', () => window.location.reload());

byId('btnReset').addEventListener('click', () => {
  loadScenario(byId('selScenario').value);
  setHudMenu(false);
});

// Autopilot Buttons
byId('btnApMaster').addEventListener('click', () => {
  sim.apMaster = !sim.apMaster;
  if (sim.apMaster) { sim.apHdgHold = true; sim.apAltHold = true; resetApFilters(); }
});
byId('btnApHdg').addEventListener('click', () => { sim.apHdgHold = !sim.apHdgHold; });
byId('btnApAlt').addEventListener('click', () => { sim.apAltHold = !sim.apAltHold; });
byId('btnApApr').addEventListener('click', () => {
  sim.apApproach = !sim.apApproach;
  if (sim.apApproach) { sim.apMaster = true; resetApFilters(); }
});

// Controls Surfaces
byId('btnGear').addEventListener('click', () => {
  if (!sim.onGround && !sim.spec.fixedGear) sim.gearDown = !sim.gearDown;
});
// The flap lever cycles down a notch (wrapping to up); in the drill's missed approach (0047)
// it comes up a notch, the one direction a go-around needs.
function moveFlapLever() {
  if (goAroundActive()) sim.flapsIndex = Math.max(0, sim.flapsIndex - 1);
  else sim.flapsIndex = (sim.flapsIndex + 1) % (sim.spec.flapDetentsDeg ?? sim.flapAngles).length;
}
byId('btnFlaps').addEventListener('click', moveFlapLever);
byId('btnBrakes').addEventListener('click', () => {
  sim.brakesOn = !sim.brakesOn;
});
// Autobrake selector OFF → 1 → 2 → 3 → MAX (airframes that have one, systems.js).
byId('btnAutobrake').addEventListener('click', () => {
  if (systemsOf(sim.spec).autobrake) sim.autobrake = (sim.autobrake + 1) % AUTOBRAKE_LABELS.length;
});
// Reverse levers: only on the ground, from idle. Deploying or stowing brings the power to
// idle first, as the interlock does; then the throttle sets reverse thrust.
byId('btnReverse').addEventListener('click', () => {
  if (!systemsOf(sim.spec).reverser || (!sim.onGround && !sim.reverseCmd)) return;
  sim.reverseCmd = !sim.reverseCmd;
  sim.throttle = 0;
});

// Throttle Buttons
byId('rngThrottle').addEventListener('input', e => {
  sim.throttle = Number(e.target.value) / 100;
});
byId('rngThrottle').addEventListener('pointerdown', () => { draggingThrottle = true; });
window.addEventListener('pointerup', () => { draggingThrottle = false; });
window.addEventListener('pointercancel', () => { draggingThrottle = false; });
byId('btnIdle').addEventListener('click', () => {
  sim.throttle = 0; byId('rngThrottle').value = 0;
});
byId('btnApp').addEventListener('click', () => {
  sim.throttle = 0.44; byId('rngThrottle').value = 44;
});
byId('btnClimb').addEventListener('click', () => {
  sim.throttle = 0.75; byId('rngThrottle').value = 75;
});
byId('btnToga').addEventListener('click', () => {
  sim.throttle = 1.0; byId('rngThrottle').value = 100;
});

byId('btnCenterWings').addEventListener('click', () => {
  sim.elevInput = 0; sim.aileronInput = 0; sim.rudderInput = 0;
  sim.angVel.set(0, 0, 0);
});

// On-screen sticks (desktop drag pad + phone touch stick) feed sim.stick through pointer
// events. Each control captures its own pointer, so two thumbs work at once.
function bindStick(el) {
  let pointerId = null;
  const move = (e) => {
    const s = stickFromPoint(e.clientX, e.clientY, el.getBoundingClientRect());
    sim.stick.x = s.x; sim.stick.y = s.y;
  };
  el.addEventListener('pointerdown', (e) => {
    pointerId = e.pointerId;
    el.setPointerCapture(e.pointerId);
    sim.stick.active = true;
    move(e);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === pointerId) move(e); });
  const release = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    sim.stick.active = false; sim.stick.x = 0; sim.stick.y = 0;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
}
bindStick(byId('virtualStickPad'));
bindStick(byId('touchStick'));

// Phone throttle track: drag anywhere on it, top = TO/GA, bottom = idle.
(function bindTouchThrottle() {
  const el = byId('touchThrottle');
  let pointerId = null;
  const set = (e) => {
    sim.throttle = throttleFromPoint(e.clientY, el.getBoundingClientRect());
    byId('rngThrottle').value = Math.round(sim.throttle * 100);
  };
  el.addEventListener('pointerdown', (e) => { pointerId = e.pointerId; el.setPointerCapture(e.pointerId); set(e); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === pointerId) set(e); });
  el.addEventListener('pointerup', (e) => { if (e.pointerId === pointerId) pointerId = null; });
  el.addEventListener('pointercancel', (e) => { if (e.pointerId === pointerId) pointerId = null; });
})();

// Phone system buttons reuse the desktop handlers.
byId('touchGear').addEventListener('click', () => byId('btnGear').click());
byId('touchFlaps').addEventListener('click', () => byId('btnFlaps').click());
byId('touchBrakes').addEventListener('click', () => byId('btnBrakes').click());
byId('touchIls').addEventListener('click', () => {
  const rev = sim.onGround && systemsOf(sim.spec).reverser;
  byId(rev ? 'btnReverse' : 'btnApApr').click();
});

// Small status toast (gamepad connect/disconnect, etc.)
let toastTimer = 0;
function showToast(msg) {
  const el = byId('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}
const padName = (id) => (id || 'Controller').replace(/\s*\(.*$/, '').trim() || 'Controller';
window.addEventListener('gamepadconnected', (e) => showToast(`🎮 ${padName(e.gamepad && e.gamepad.id)} connected: left stick flies, RT/LT throttle, A flaps, B gear`));
window.addEventListener('gamepaddisconnected', () => { sim.pad = null; showToast('🎮 Controller disconnected'); });

// Per-frame gamepad poll: continuous axes into sim.pad, edge-triggered buttons into actions.
function updateGamepad() {
  const p = pollGamepad();
  if (!p) { sim.pad = null; return; }
  sim.pad = p.targets;
  for (const b of p.edges) {
    if (b === BUTTON.A) byId('btnFlaps').click();
    else if (b === BUTTON.B) byId('btnGear').click();
    else if (b === BUTTON.X) byId('btnBrakes').click();
    else if (b === BUTTON.Y) byId('btnCamera').click();
    else if (b === BUTTON.START) byId('btnPause').click();
    else if (b === BUTTON.DPAD_UP) byId('btnApApr').click();
  }
}

// Canvas Dragging for Orbit Camera & Mouse-Fly
let isCanvasOrbiting = false;
let prevMouseX = 0, prevMouseY = 0;
simCanvas.addEventListener('mousedown', e => {
  isCanvasOrbiting = true;
  prevMouseX = e.clientX;
  prevMouseY = e.clientY;
});

window.addEventListener('mousemove', e => {
  if (sim.mouseYoke) {
    const crosshair = byId('mouseFlightCrosshair');
    crosshair.style.left = `${e.clientX}px`;
    crosshair.style.top = `${e.clientY}px`;

    const normX = (e.clientX / window.innerWidth) * 2 - 1;
    const normY = (e.clientY / window.innerHeight) * 2 - 1;
    sim.mouseStick.x = THREE.MathUtils.clamp(normX * 1.5, -1, 1);
    sim.mouseStick.y = THREE.MathUtils.clamp(normY * 1.5, -1, 1);
    if (!assistConfig(sim.assist)) { sim.aileronInput = sim.mouseStick.x; sim.elevInput = sim.mouseStick.y; }
  } else if (isCanvasOrbiting) {
    const dx = e.clientX - prevMouseX;
    const dy = e.clientY - prevMouseY;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    sim.orbitYaw -= dx * 0.008;
    sim.orbitPitch = THREE.MathUtils.clamp(sim.orbitPitch + dy * 0.008, -0.4, 1.4);
  }
});

window.addEventListener('mouseup', () => { isCanvasOrbiting = false; });

// Mouse Wheel Zoom
window.addEventListener('wheel', e => {
  sim.orbitDist = THREE.MathUtils.clamp(sim.orbitDist + e.deltaY * 0.05, 12, 160);
}, { passive: true });

// Keyboard Listeners
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  // Space is a flight key (center controls): it must not also press a focused HUD button.
  if (e.code === 'Space' && e.target.closest?.('button') && !onboardingModal.contains(e.target)) e.preventDefault();
  if (e.code === 'KeyG') { if (!sim.onGround && !sim.spec.fixedGear) sim.gearDown = !sim.gearDown; }
  else if (e.code === 'KeyF') { moveFlapLever(); }
  else if (e.code === 'KeyB') { sim.brakesOn = !sim.brakesOn; }
  else if (e.code === 'KeyK') { byId('btnAutobrake').click(); }
  else if (e.code === 'KeyR') { byId('btnReverse').click(); }
  else if (e.code === 'KeyC') { byId('btnCamera').click(); }
  else if (e.code === 'KeyM') { byId('btnMouseYoke').click(); }
  else if (e.code === 'KeyH') { setCleanView(!document.body.classList.contains('view-clean')); }
  else if (e.code === 'KeyZ') { byId('btnApMaster').click(); }
  else if (e.code === 'Space') {
    sim.elevInput = 0; sim.aileronInput = 0; sim.rudderInput = 0;
    sim.angVel.set(0, 0, 0);
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

byId('btnAudio').addEventListener('click', () => {
  if (!audio.started) audio.init();
  else {
    sim.audioEnabled = !sim.audioEnabled;
    updateAudioButton();
  }
});

const wakeLock = createWakeLock();
const resultsCard = byId('resultsCard');
let lastTime = performance.now();
// Longest frame the sim catches up on (a hidden tab or a stall beyond this is skipped).
const MAX_FRAME_S = 0.25;
function renderLoop(time) {
  requestAnimationFrame(renderLoop);
  const frameMs = time - lastTime;
  const dt = Math.min(frameMs / 1000, MAX_FRAME_S);
  lastTime = time;
  // Frames behind the modal, paused or hidden are not load; resScale also drops lone stalls.
  // (Photoreal tile LOD follows the CSS size, not the pixel ratio: nothing else to resize.)
  const idle = sim.paused || gfx.lost || document.hidden || modalOpen();
  if (idle) {
    if (resCounting) resetResScale(resScale);
    resCounting = false;
  } else {
    resCounting = true;
    if (stepResScale(resScale, frameMs)) renderer.setPixelRatio(resScale.ratio); // drawing buffer only
  }

  // Keep the screen awake while flying (released when paused, hidden, in a modal or on results).
  wakeLock.sync(!idle && resultsCard.classList.contains('hidden'));

  updateGamepad();
  step6DofPhysics(dt);
  if (!sim.paused) updateCoach(dt);
  syncWeatherUI(dt);
  updateCamera();
  updateSkyAndLights(time / 1000);
  if (!gfx.lost) terrainLod.update(dt, camera);
  photoreal.update(dt);
  updateDebugOverlay(dt);
  renderer.render(scene, camera);
  renderHud();
  renderRadar();
  syncUI();
  audio.update();
}

// The sky follows the camera; runway lights and PAPIs brighten as the light goes.
function updateSkyAndLights(t) {
  skyDome?.update(camera, { time: t, pixelRatio: renderer.getPixelRatio(), wind: sim.windVec, altitudeM: camera.position.y + REF_ELEV_M });
  const night = nightUniforms.uNight.value;
  if (runwayLights) {
    // On from dusk, and by day in low visibility (under 5 SM), as at the real fields.
    runwayLights.points.visible = night > 0.02 || sim.wx.visibilitySm < 5;
    runwayLights.update(t, renderer.getPixelRatio(), night, camera.position);
  }
  if (papiLamps) papiLamps.material.size = 5 + 4 * night;
}

// ?debug: a one-line usage readout of the Google session (to verify the free tier holds).
const debugOverlay = new URLSearchParams(window.location.search).has('debug') ? document.createElement('div') : null;
if (debugOverlay) {
  debugOverlay.className = 'debug-overlay'; // styles.css
  document.body.appendChild(debugOverlay);
}
let debugTimer = 0;
let creditsTimer = 0;
function updateDebugOverlay(dt) {
  if (photorealOn && (creditsTimer -= dt) <= 0) {
    creditsTimer = 1;
    const txt = byId('txtGoogleData');
    if (txt.textContent !== photoreal.state.attributions) txt.textContent = photoreal.state.attributions;
  }
  if (!debugOverlay || (debugTimer -= dt) > 0) return;
  debugTimer = 1;
  const st = photoreal.state, s = photoreal.session;
  debugOverlay.textContent = `3D tiles: ${st.status}${st.reason ? ` (${st.reason})` : ''} · this page: ${s ? s.page.roots : 0} root, ${s ? s.page.reuses : 0} reuses`
    + ` · this browser: ${s ? s.usage.roots : 0} roots, ${s ? s.usage.reuses : 0} reuses · tiles ${st.visibleTiles} · calib ${st.calibM.toFixed(1)} m`
    + ` · px ${resScale.ratio}`;
}

// ?debug (tests, 0068): a final to any runway end from any distance, e.g. 17R from 10 NM.
if (debugOverlay) window.openaeroDebugFinal = (airport, rwy, distNm) => runwayEnd(airport, rwy)
  && loadScenario(null, { key: `debug_${airport}_${rwy}_${distNm}`, label: `${airport} ${rwy} (${distNm} NM, debug)`, airport, rwy, distNm });
// ?debug (tests, 0091): throw the airplane back up off the runway (m/s), a scripted bounce.
if (debugOverlay) window.openaeroDebugHop = (mps) => { sim.vel.y = mps; };
// The active runway on screen (CSS px): its approach lights' outer end to the far end, as wide
// as the runway. Read by tests/e2e/runwayVisibility.spec.js.
function runwayScreen(e) {
  const d = courseVector(e.hdgT), l = { x: d.z, z: -d.x }, w = e.widthM / 2, rect = simCanvas.getBoundingClientRect();
  return [-2400 * 0.3048, e.lengthM - e.displacedM].flatMap((s) => [-w, w].map((o) => {
    const x = e.thrX + d.x * s + l.x * o, z = e.thrZ + d.z * s + l.z * o;
    const p = _v3.set(x, ground.heightAt(x, z), z).project(camera);
    return { x: (p.x + 1) / 2 * rect.width, y: (1 - p.y) / 2 * rect.height, z: p.z };
  }));
}

// Read-only snapshot for e2e tests and curious players (no setters, no globals mutated).
window.openaeroDebug = () => {
  _euler.setFromQuaternion(sim.quat, 'YXZ');
  const m = sim.loadedMission || missionByKey(sim.missionKey);
  return {
    mission: sim.missionKey,
    assist: sim.assist,
    inputSource: sim.inputSource,
    simTime: sim.simTime,
    missionRunway: m.airport ? `${m.airport}_${m.rwy}` : null,
    crosswindMission: sim.crosswindMission ? { ...sim.crosswindMission } : null,
    activeRunway: sim.activeEnd ? sim.activeEnd.id : null,
    runwayHdgT: sim.activeEnd ? sim.activeEnd.hdgT : null,
    hudHeading: sim.hudHdg,
    runwayScreen: sim.activeEnd ? runwayScreen(sim.activeEnd) : null,
    headingDeg: (-_euler.y * RAD_TO_DEG + 360) % 360,
    pitchDeg: _euler.x * RAD_TO_DEG,
    bankRightDeg: -_euler.z * RAD_TO_DEG,
    elevInput: sim.elevInput,
    aileronInput: sim.aileronInput,
    crossM: sim.approach.crossM,
    distM: sim.approach.distM,
    heightAbovePathM: sim.approach.heightAbovePathM,
    pos: { x: sim.pos.x, y: sim.pos.y, z: sim.pos.z },
    aircraft: sim.aircraftKey,
    aircraftModel: animRefs.model?.name,
    brakesOn: sim.brakesOn,
    // Moving parts (0063): the rigged node names and each one's pose (deg) right now.
    parts: animRefs.parts ? [...animRefs.parts.parts, ...animRefs.parts.gear].map((p) => ({
      name: p.name, deg: 2 * Math.acos(Math.min(1, Math.abs(p.rest.dot(p.node.quaternion)))) * RAD_TO_DEG, visible: p.node.visible,
    })) : [],
    gearDown: sim.gearDown,
    fdm: jsbsim && jsbsim.flies(sim.aircraftKey) ? 'jsbsim' : 'builtin',
    groundY: sim.groundY,
    aglFt: sim.aglFt,
    mslFt: sim.mslFt,
    onGround: sim.onGround,
    iasKts: sim.iasKts,
    gsKts: sim.gsKts,
    throttle: sim.throttle,
    engineN: sim.engineN,
    flapsIndex: sim.flapsIndex,
    aoaDeg: sim.aoaDeg,
    wxLive: sim.wx.live,
    // The HUD wind box (0075): what it says and where it is (canvas px = CSS px).
    hudWind: { ...sim.hudWind, arrowDeg: windArrowDeg(sim.hudWind.dirDeg, sim.hudWind.kts, (-_euler.y * RAD_TO_DEG + 360) % 360), box: { ..._windBox } },
    pixelRatio: resScale.ratio,
    paused: sim.paused,
    gfxLost: gfx.lost,
    audio: audio.state,
    wakeLock: wakeLock.held,
    sun: { mode: TIME_MODES[sim.timeOfDayMode], elevationDeg: sun.elevationDeg, azimuthDeg: sun.azimuthDeg },
    cloudBaseFt: sim.wx.cloudLayers?.find((l) => l.coverage >= 0.75)?.baseFt ?? null,
    cloudLayers: (sim.wx.cloudLayers || []).length,
    sky: { ...skyDome?.state, cityLights: nightUniforms.uNight.value, runwayLights: runwayLights?.count ?? 0 },
    lastLanding: sim.lastLanding,
    stabilizedGate: sim.gate,
    goAround: sim.goAround ? { phase: sim.goAround.phase, lowFt: sim.goAround.lowFt, minIasKts: sim.goAround.minIasKts, climbFpm: sim.goAround.climbFpm } : null,
    stallDrill: sim.stallDrill ? { ...sim.stallDrill } : null,
    takeoffCalls: [...sim.takeoffCalls],
    landmarks: Object.fromEntries(landmarks.filter((o) => o.userData.landmark).map((o) => [o.userData.landmark,
      { x: o.position.x, z: o.position.z, seatY: o.position.y - o.userData.baseY, groundY: ground.heightAt(o.position.x, o.position.z) }])),
    terrain: terrainLod ? { ...terrainLod.stats, demLoaded: ground.hasDem() } : null,
    photoreal: photoreal ? {
      ...photoreal.state,
      page: photoreal.session ? { ...photoreal.session.page } : null,
      usage: photoreal.session ? { ...photoreal.session.usage } : null,
      bounds: photoreal.state.status === 'active' ? photoreal.bounds() : null,
    } : null,
    render: renderer ? { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles } : null,
  };
};

function populateMissionSelect() {
  const sel = byId('selScenario');
  sel.innerHTML = '';
  for (const m of MISSIONS) {
    const o = document.createElement('option');
    o.value = m.key;
    o.textContent = m.label;
    sel.appendChild(o);
  }
}

// Start-screen mission picker (ticket 0029): one card per mission, grouped by airport, built
// from MISSIONS so a new mission needs no HTML. Today's crosswind card (static, shown only
// with live weather) sits under the recommended flight.
const PICKER_TITLES = { recommended: 'Recommended first flight', drills: 'Drills', tours: 'Tours' };
const PICKER_COLOURS = { final: 'text-sky-300', takeoff: 'text-sky-300', drill: 'text-sky-300', tour: 'text-amber-300' };
function buildMissionPicker() {
  const list = byId('missionList');
  const crosswindCard = byId('btnCrosswindToday');
  list.replaceChildren();
  for (const g of groupMissions(MISSIONS)) {
    const section = document.createElement('section');
    section.className = 'flex flex-col gap-1.5';
    const head = document.createElement('h2');
    head.className = 'text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono';
    head.textContent = PICKER_TITLES[g.id] || (AIRPORT_NAMES[g.id] ? `${g.id} · ${AIRPORT_NAMES[g.id]}` : g.id);
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2';
    for (const m of g.missions) grid.appendChild(missionCard(m, g.id === 'recommended'));
    if (g.id === 'recommended') grid.appendChild(crosswindCard);
    section.append(head, grid);
    list.appendChild(section);
  }
  if (!crosswindCard.isConnected) list.prepend(crosswindCard);
}
function missionCard(m, recommended) {
  const btn = document.createElement('button');
  btn.className = `btnMission hud-btn p-3 min-h-[44px] rounded-xl text-left flex flex-col gap-1${recommended ? ' border-emerald-500/50' : ''}`;
  btn.dataset.scenario = m.key;
  const row = document.createElement('div');
  row.className = 'flex items-center justify-between gap-2 font-bold';
  const title = document.createElement('span');
  title.className = recommended ? 'text-emerald-300' : PICKER_COLOURS[m.kind] || 'text-sky-300';
  title.textContent = m.label;
  const best = document.createElement('span');
  best.className = 'missionBest shrink-0 text-[10px] font-mono';
  row.append(title, best);
  const blurb = document.createElement('div');
  blurb.className = 'text-[10px] text-slate-400';
  blurb.textContent = m.blurb || '';
  btn.append(row, blurb);
  return btn;
}
// Personal bests are re-read whenever the picker opens (a landing may have set a new one).
function refreshMissionBests() {
  let grades = {};
  try { grades = bestGrades(window.localStorage); } catch { /* storage unavailable: no grades */ }
  for (const btn of document.querySelectorAll('#missionList .btnMission')) {
    let key = btn.dataset.scenario;
    if (key === CROSSWIND_KEY) {
      const m = sim.crosswindMission;
      key = m ? `${CROSSWIND_KEY}:${runwayEnd(m.airport, m.rwy).id}` : null;
    }
    const grade = (key && grades[assistBestKey(key, sim.assist)]) || null;
    const el = btn.querySelector('.missionBest');
    el.textContent = grade ? `Best ${grade}` : '';
    el.className = `missionBest shrink-0 text-[10px] font-mono ${grade ? `rounded bg-slate-950/80 px-1.5 py-0.5 ${GRADE_COLOURS[grade]}` : ''}`;
  }
}
// Assist level picker on the start screen (ticket 0042): three big buttons, remembered.
function setAssist(level, remember = true) {
  if (!ASSIST_LEVELS.includes(level)) return;
  const changed = sim.assist !== level;
  sim.assist = level;
  for (const btn of document.querySelectorAll('#assistPicker .btnAssist')) {
    const on = btn.dataset.assist === level;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  document.body.classList.toggle('assist-kid', level === 'kid');
  resetAssistState(assistState);
  if (remember) { try { saveAssist(window.localStorage, level); } catch { /* storage unavailable */ } }
  refreshMissionBests();
  // A new level starts the flight over: a landing is graded and kept under the level it was
  // flown at, and no surface is left where the other input path put it.
  if (remember && changed) loadScenario(sim.missionKey);
}
for (const btn of document.querySelectorAll('#assistPicker .btnAssist')) {
  btn.addEventListener('click', () => setAssist(btn.dataset.assist));
}

function syncMissionPicker(mission) {
  for (const btn of document.querySelectorAll('#missionList .btnMission')) {
    btn.classList.toggle('active', btn.dataset.scenario === mission.key);
  }
  byId('txtPickedMission').textContent = mission.label;
}

function boot() {
  populateMissionSelect();
  buildMissionPicker();
  refreshMissionBests();
  let seen = false;
  try { seen = coachSeen(window.localStorage); } catch { /* storage unavailable: coach on */ }
  byId('chkCoach').checked = !seen;
  try { tutorEnabled = tutorOn(window.localStorage); } catch { /* storage unavailable: tutor on */ }
  byId('chkTutor').checked = tutorEnabled;
  try { setAssist(loadAssist(window.localStorage), false); } catch { setAssist(DEFAULT_ASSIST, false); }
  try { setCleanView(loadCleanView(window.localStorage), false); } catch { setCleanView(true, false); }
  fetchWeather();
  setInterval(fetchWeather, 10 * 60 * 1000);
  applySun();
  setInterval(() => { if (TIME_MODES[sim.timeOfDayMode] === 'Now') applySun(); }, 60 * 1000);
  buildSatelliteTerrain();
  import('./skyDome.js').then(({ createSkyDome }) => {
    skyDome = createSkyDome({ scene, base: import.meta.env.BASE_URL, reducedMotion });
    refreshWeather(); // clouds
    applySun();       // sky, stars, Moon and the caption
  }).catch((err) => console.warn('Sky unavailable, plain haze instead:', err.message));
  buildAircraft('b738');
  // Deep links (?airport= / ?mission=): pick the flight; Start flight is still a tap.
  const linked = missionFromLink(window.location.search);
  loadScenario(linked || 'kdfw_35c_final');
  if (linked) {
    byId('selScenario').value = linked;
    try { history.replaceState(null, '', `${location.pathname}${stripDeepLink(location.search)}${location.hash}`); } catch { /* sandboxed */ }
  }
  handleResize();
  requestAnimationFrame(renderLoop);
}

// The prototype booted on window.onload; a module script runs before 'load', so wait for it.
if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot, { once: true });
