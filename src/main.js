// OpenAero DFW: renderer, scene, 6-DOF integrator, HUD, radar, and UI wiring.
// Ported from the single-file prototype. Pure logic lives in the sibling modules
// (constants, aircraft, runways, geo, aero, input, audio); the Keeper keeps carving
// this file into focused modules with no behavior change.
import * as THREE from 'three';
import './styles.css';
import {
  M_TO_FT, MPS_TO_KTS, NM_TO_M, DEG_TO_RAD, RAD_TO_DEG, GRAVITY,
  SPEED_OF_SOUND_KTS,
} from './constants.js';
import { AIRCRAFT_DATABASE } from './aircraft.js';
import { DOWNTOWN_DALLAS } from './runways.js';
import {
  RUNWAY_ENDS, RUNWAYS_GEOM, runwayEnd, runwayEndById, approachGeometry, selectActiveRunway,
  approachSpawn, takeoffSpawn, courseVector, AIM_POINT_M,
} from './airports.js';
import { MISSIONS, missionByKey } from './missions.js';
import { missionFromLink, terrainOnly, stripDeepLink } from './deeplink.js';
import { gradeLanding, loadBest, recordBest } from './landing.js';
import { COACH_MISSION, COACH_PROMPTS, createCoach, stepCoach, coachSeen, markCoachSeen } from './coach.js';
import {
  localizerInterceptDeg, bankCommandForHeading, aileronForBank, glidepathGammaDeg,
  flareSinkMps, elevatorForPitch, throttleForSpeed, sideslipYawAccel, trimAoaDeg,
} from './autopilot.js';
import {
  parseMetar, scenarioWeather, windVector, gustFactor, runwayWindComponents,
  fogDensityForVisibility, metarAgeMinutes, flowForWind,
} from './weather.js';
import { createTerrainLod } from './terrainLod.js';
import { createPhotoreal, photorealAllowed } from './photoreal.js';
import { createGround, decodeDem, DEM_URL_PATH, yToFtMsl } from './terrain.js';
import {
  dynamicPressure, liftCoefficient, groundEffectFactor, dragCoefficient,
  headingError, papiWhiteLights, isStallWarning, isGpwsWarning,
} from './aero.js';
import { keys, pilotTargets, stickFromPoint, combineTargets, throttleFromPoint } from './input.js';
import { pollGamepad, BUTTON } from './gamepad.js';
import { createAudio } from './audio.js';

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
  flapsIndex: 2, flapAngles: [0, 10, 25, 40],
  gearDown: true, brakesOn: false, onGround: false,
  groundY: 0, // terrain height under the aircraft (terrain.js), sim Y

  // Autopilot
  apMaster: false, apHdgHold: false, apAltHold: false, apApproach: false,
  targetHdgDeg: 360, targetAltFt: 1880,

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
  windVec: new THREE.Vector3(),
  windNowKts: 0,
  simTime: 0,

  // Touchdown detection for the landing grade (landing.js)
  wasOnGround: false,
  airborneTime: 0,
  lastAirVsi: 0,
  landingGraded: false,
  lastLanding: null,
  audioEnabled: false,
  lastCalloutIdx: -1,

  // Input channels merged by combineTargets(): on-screen stick (touch/drag) and gamepad
  stick: { x: 0, y: 0, active: false },

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

const simCanvas = document.getElementById('simCanvas');
const hudCanvas = document.getElementById('hudCanvas');
const hudCtx = hudCanvas.getContext('2d');
const mapCanvas = document.getElementById('mapCanvas');
const mapCtx = mapCanvas.getContext('2d');

let renderer, scene, camera, ambientLight, sunLight;
let aircraftRoot, terrainGroup, terrainLod, photoreal;
const runwayMeshes = []; // runway surface + markings: hidden under the photoreal mesh
let animRefs = { prop: null, flame: null, fanL: null, fanR: null };
let papiLamps = null; // THREE.Points, 4 lamps per runway end (RUNWAY_ENDS order)

try {
  renderer = new THREE.WebGLRenderer({
    canvas: simCanvas,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
scene.background = new THREE.Color(0x38bdf8);
scene.fog = new THREE.FogExp2(0x94a3b8, 0.000035);

camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 95000);

// three ≥ r155 uses physically based light units: Lambert/Standard BRDFs divide by π,
// so the r128-era intensities are scaled by π to keep the same exposure (docs/THREE-UPGRADE.md).
const LIGHT_SCALE = Math.PI;

ambientLight = new THREE.AmbientLight(0xdbeafe, 0.85 * LIGHT_SCALE);
scene.add(ambientLight);

sunLight = new THREE.DirectionalLight(0xfffbeb, 1.4 * LIGHT_SCALE);
sunLight.position.set(-4500, 7500, 3500);
scene.add(sunLight);

const audio = createAudio(sim, updateAudioButton);

function updateAudioButton() {
  const txt = document.getElementById('txtAudioState');
  const btn = document.getElementById('btnAudio');
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
}

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
    sunDir: sunLight.position.clone().normalize(),
  });
  applyGroundLight();
  loadDem();

  photoreal = createPhotoreal({
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

  // 3D Downtown Dallas Landmark Architecture
  const dallas = new THREE.Group();
  dallas.position.set(DOWNTOWN_DALLAS.x, 0, DOWNTOWN_DALLAS.z);

  // Bank of America Plaza with emerald green perimeter outline
  const boa = new THREE.Mesh(new THREE.BoxGeometry(58, 281, 58), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
  boa.position.set(0, 140.5, 0);
  dallas.add(boa);
  const neon = new THREE.Mesh(new THREE.BoxGeometry(60, 281, 2), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
  neon.position.set(0, 140.5, 30);
  dallas.add(neon);

  // JPMorgan Chase Tower with sky keyhole
  const chaseBase = new THREE.Mesh(new THREE.BoxGeometry(48, 160, 48), new THREE.MeshLambertMaterial({ color: 0x334155 }));
  chaseBase.position.set(220, 80, -250);
  dallas.add(chaseBase);
  const chaseTop = new THREE.Mesh(new THREE.BoxGeometry(48, 35, 48), new THREE.MeshLambertMaterial({ color: 0x334155 }));
  chaseTop.position.set(220, 207, -250);
  dallas.add(chaseTop);

  // Reunion Tower with geodesic sphere
  const rShaft = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 145, 12), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
  rShaft.position.set(-650, 72.5, 500);
  dallas.add(rShaft);
  const rBall = new THREE.Mesh(new THREE.SphereGeometry(22, 16, 16), new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true }));
  rBall.position.set(-650, 155, 500);
  dallas.add(rBall);

  // Comerica & Renaissance Towers
  const ren = new THREE.Mesh(new THREE.BoxGeometry(48, 240, 48), new THREE.MeshLambertMaterial({ color: 0x0f293a }));
  ren.position.set(180, 120, -180);
  dallas.add(ren);
  const com = new THREE.Mesh(new THREE.BoxGeometry(52, 230, 52), new THREE.MeshLambertMaterial({ color: 0x3d352e }));
  com.position.set(420, 115, -40);
  dallas.add(com);

  for (let i = 0; i < 24; i++) {
    const ang = i * 0.92;
    const rad = 180 + (i % 5) * 110;
    const bh = 80 + (i * 27) % 110;
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(36, bh, 36), new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0x1e293b : 0x273549 }));
    bldg.position.set(Math.cos(ang) * rad, bh / 2, Math.sin(ang) * rad);
    dallas.add(bldg);
  }
  scene.add(dallas);
  landmarks.push(dallas);

  // Margaret Hunt Hill Bridge Arch
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(15800, 0, 9600);
  bridgeGroup.rotation.y = 0.45;
  const bridgeArch = new THREE.Mesh(new THREE.TorusGeometry(110, 3.5, 8, 32, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  bridgeArch.position.y = 15;
  bridgeArch.rotation.y = Math.PI / 2;
  bridgeGroup.add(bridgeArch);
  scene.add(bridgeGroup);
  landmarks.push(bridgeGroup);

  // Arlington AT&T Stadium
  const att = new THREE.Mesh(new THREE.CylinderGeometry(150, 130, 55, 24), new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }));
  att.position.set(-2400, 27.5, 9600);
  scene.add(att);
  landmarks.push(att);
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
  document.getElementById('creditsFree').classList.toggle('hidden', on);
  document.getElementById('creditsGoogle').classList.toggle('hidden', !on);
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
  } catch (err) {
    console.warn('Terrain elevation unavailable, flying on flat ground:', err.message);
  }
}

function buildAircraft(type) {
  if (aircraftRoot) scene.remove(aircraftRoot);
  aircraftRoot = new THREE.Group();
  animRefs = { prop: null, flame: null, fanL: null, fanR: null };

  // Shaders & materials
  const fuselageWhite = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.25, roughness: 0.35 });
  const airlineBlue = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.35, roughness: 0.3 });
  const cockpitGlass = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1 });
  const titaniumMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.65, roughness: 0.4 });
  const fanMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });

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

      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 16), fanMat);
      fan.rotation.x = Math.PI / 2;
      fan.position.set(ex, -1.35, -3.2);
      plane.add(fan);

      const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 16), titaniumMat);
      exhaust.rotation.x = -Math.PI / 2;
      exhaust.position.set(ex, -1.35, 1.4);
      plane.add(exhaust);

      if (idx === 0) animRefs.fanL = fan;
      else animRefs.fanR = fan;
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

    // Horizontal Stabilizers
    const hStab = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.22, 2.8), fuselageWhite);
    hStab.position.set(0, 1.2, 16.5);
    plane.add(hStab);

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
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.18, 1.65), fuselageWhite);
    wing.position.set(0, 0.95, -0.4);
    cGroup.add(wing);

    // Propeller
    const prop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.2, 0.06), fanMat);
    prop.position.set(0, 0, -4.05);
    cGroup.add(prop);
    animRefs.prop = prop;

    // Tail
    const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.0, 1.6), airlineBlue);
    vTail.position.set(0, 1.1, 3.6);
    vTail.rotation.x = -0.3;
    cGroup.add(vTail);

    const hTail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.8), fuselageWhite);
    hTail.position.set(0, 0.35, 4.0);
    cGroup.add(hTail);

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

    const wings = new THREE.Mesh(new THREE.BoxGeometry(9.96, 0.14, 3.8), titaniumMat);
    wings.position.set(0, 0, 0.8);
    fGroup.add(wings);

    const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 2.8), airlineBlue);
    vFin.position.set(0, 1.7, 4.3);
    fGroup.add(vFin);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.5, 12), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, 0, 7.8);
    fGroup.add(flame);
    animRefs.flame = flame;

    aircraftRoot.add(fGroup);
  }

  scene.add(aircraftRoot);
}

// --- Landing grade ---------------------------------------------------------------
function checkTouchdown(dt) {
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
  if (!end) return;
  const g = approachGeometry(end, sim.pos);
  const geom = RUNWAYS_GEOM.find((r) => r.ends.includes(end.id));
  _euler.setFromQuaternion(sim.quat, 'YXZ');
  const result = gradeLanding({
    vsFpm: sim.lastAirVsi,
    crossM: g.crossM,
    pastThresholdM: -g.distM,
    runwayLengthM: geom ? geom.lengthM - end.displacedM : 3000,
    runwayWidthM: end.widthM,
    pitchDeg: _euler.x * RAD_TO_DEG,
    bankDeg: _euler.z * RAD_TO_DEG,
    iasKts: sim.iasKts,
    vrefKts: sim.spec.vrefKts,
  });
  sim.lastLanding = {
    pastThresholdM: -g.distM, crossM: g.crossM, vsFpm: sim.lastAirVsi,
    pitchDeg: _euler.x * RAD_TO_DEG, bankRightDeg: -_euler.z * RAD_TO_DEG,
    grade: result.grade, score: result.score, runway: end.id,
  };
  let best = { isNewBest: false, best: null };
  try { best = recordBest(window.localStorage, sim.missionKey, result); } catch { /* storage unavailable */ }
  showResults(result, best, end);
}

const GRADE_COLOURS = { S: 'text-fuchsia-300', A: 'text-emerald-300', B: 'text-sky-300', C: 'text-amber-300', D: 'text-orange-400', CRASH: 'text-red-400' };
function showResults(result, best, end) {
  const card = document.getElementById('resultsCard');
  const gradeEl = document.getElementById('txtGrade');
  gradeEl.textContent = result.grade;
  gradeEl.className = `${result.grade === 'CRASH' ? 'text-2xl' : 'text-5xl'} font-black w-20 text-center ${GRADE_COLOURS[result.grade]}`;
  document.getElementById('txtScore').textContent = String(result.score);
  document.getElementById('txtResultRunway').textContent = end.name;
  const reason = document.getElementById('txtGradeReason');
  reason.textContent = result.reason || '';
  reason.classList.toggle('hidden', !result.reason);
  const bestEl = document.getElementById('txtBest');
  if (best.isNewBest) bestEl.textContent = best.previous ? `★ New personal best (was ${best.previous.score})` : '★ First personal best on this mission';
  else bestEl.textContent = best.best ? `Personal best: ${best.best.grade} · ${best.best.score}` : '';
  const list = document.getElementById('resultsFactors');
  list.innerHTML = '';
  for (const f of result.factors) {
    const li = document.createElement('li');
    li.className = 'flex flex-col gap-0.5';
    const tone = f.score >= 85 ? 'bg-emerald-400' : f.score >= 60 ? 'bg-amber-400' : 'bg-red-400';
    li.innerHTML = `<div class="flex justify-between"><span class="text-slate-400">${f.label}</span><span>${f.value}</span></div>`
      + `<div class="h-1.5 rounded bg-slate-800 overflow-hidden"><div class="h-full ${tone}" style="width:${f.score}%"></div></div>`;
    list.appendChild(li);
  }
  card.classList.remove('hidden');
}

document.getElementById('btnFlyAgain').addEventListener('click', () => {
  document.getElementById('resultsCard').classList.add('hidden');
  loadScenario(sim.missionKey);
});
document.getElementById('btnKeepRolling').addEventListener('click', () => {
  document.getElementById('resultsCard').classList.add('hidden');
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
const coachInput = { aglFt: 0, vsiFpm: 0, papiWhite: null, throttle: 0, onGround: false, autopilot: false };

function resetCoach() {
  Object.assign(coach, createCoach());
  coachDoneS = 0;
}

function updateCoach(dt) {
  let prompt = null;
  if (coachEnabled && sim.missionKey === COACH_MISSION) {
    coachInput.aglFt = sim.aglFt;
    coachInput.vsiFpm = sim.vsiFpm;
    coachInput.papiWhite = sim.papiWhite;
    coachInput.throttle = sim.throttle;
    coachInput.onGround = sim.onGround;
    coachInput.autopilot = sim.apMaster || sim.apApproach;
    stepCoach(coach, coachInput, dt);
    if (coach.done) coachDoneS += dt;
    prompt = coach.done && coachDoneS > COACH_DONE_SHOW_S ? null : coach.prompt;
  }
  if (prompt === coachShown) return;
  coachShown = prompt;
  document.getElementById('coach').classList.toggle('hidden', prompt === null);
  if (prompt === null) return;
  document.getElementById('txtCoach').textContent = COACH_PROMPTS[prompt];
  if (!coachMarked) {
    coachMarked = true;
    try { markCoachSeen(window.localStorage); } catch { /* storage unavailable */ }
  }
}

// Leaving the modal (ENTER COCKPIT or ✕) applies the coach checkbox.
function applyCoachChoice() {
  coachEnabled = document.getElementById('chkCoach').checked;
  if (coachEnabled) resetCoach();
}

document.getElementById('btnCoachSkip').addEventListener('click', () => {
  coachEnabled = false;
  document.getElementById('chkCoach').checked = false;
  updateCoach(0); // hide now, even while paused
});

// --- Weather -----------------------------------------------------------------------
const WX_IDS = 'KDFW,KDAL,KADS,KAFW,KFTW,KGKY';
let cloudDeck = null;
const skyBase = new THREE.Color(0x38bdf8);   // set by the time-of-day preset
const OVERCAST_GREY = new THREE.Color(0x9aa5b1);

// Sky = time-of-day colour, greyed by how much of it a low deck covers.
function applySky() {
  const base = sim.wx.ceilingFt;
  const k = base !== null && base <= 12000 ? (sim.wx.ceilingCover === 'BKN' ? 0.45 : 0.8) : 0;
  scene.background.copy(skyBase).lerp(OVERCAST_GREY, k);
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
}

// The weather for where you are flying: the active runway's field, else DFW, else scenario.
function currentWeather() {
  const field = sim.activeEnd ? sim.activeEnd.airport : 'KDFW';
  return sim.wxByIcao[field] || sim.wxByIcao.KDFW || scenarioWeather();
}

function refreshWeather() {
  sim.wx = currentWeather();
  scene.fog.density = fogDensityForVisibility(sim.wx.visibilitySm);
  const base = sim.wx.ceilingFt;
  if (base !== null && base <= 12000) {
    if (!cloudDeck) {
      cloudDeck = new THREE.Mesh(
        new THREE.PlaneGeometry(160000, 160000),
        new THREE.MeshBasicMaterial({ color: 0xdfe5ec, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      cloudDeck.rotation.x = -Math.PI / 2;
      scene.add(cloudDeck);
    }
    cloudDeck.position.y = (sim.activeEnd ? sim.activeEnd.thrY : 0) + base * 0.3048;
    cloudDeck.material.opacity = sim.wx.ceilingCover === 'BKN' ? 0.55 : 0.88;
    cloudDeck.visible = true;
  } else if (cloudDeck) {
    cloudDeck.visible = false;
  }
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
  const badge = document.getElementById('wxBadge');
  badge.textContent = wx.live ? 'LIVE METAR' : 'SCENARIO WX';
  badge.className = wx.live
    ? 'px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-400 text-emerald-300 font-bold text-[9px] shrink-0'
    : 'px-1.5 py-0.5 rounded bg-slate-900 border border-slate-500 text-slate-300 font-bold text-[9px] shrink-0';
  const age = wx.live && wx.obsTime ? ` · ${metarAgeMinutes(wx.obsTime, Date.now() / 1000)} min ago` : '';
  // Remarks (RMK …) are for forecasters; drop them so the age stays visible.
  document.getElementById('txtMetarString').textContent = `${String(wx.raw).split(' RMK')[0]}${age}`;
  document.getElementById('txtWindBadge').textContent = windText(wx);
  const dfw = sim.wxByIcao.KDFW || scenarioWeather();
  const flow = flowForWind(dfw.windDirDeg, dfw.windKts);
  document.getElementById('txtFlow').textContent = flow === 'NORTH' ? 'NORTH (RWY 35/36)' : 'SOUTH (RWY 17/18)';
  const rw = document.getElementById('txtRwyWind');
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
  if (animRefs.prop) {
    animRefs.prop.rotation.z += (35 + sim.throttle * 70) * dt;
  }
  if (animRefs.fanL) {
    animRefs.fanL.rotation.z += (30 + sim.throttle * 90) * dt;
    animRefs.fanR.rotation.z += (30 + sim.throttle * 90) * dt;
  }
  if (animRefs.flame) {
    animRefs.flame.scale.set(1, 1, 0.8 + sim.throttle * 1.6);
    animRefs.flame.visible = sim.throttle > 0.6;
  }

  // Approach target + PAPI lamps
  updateActiveRunway(dt);
  updatePapi();
  checkTouchdown(dt);
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
    document.getElementById('rngThrottle').value = Math.round(sim.throttle * 100);
  }
  if (keys['ControlLeft'] || keys['ControlRight']) {
    sim.throttle = Math.max(0.0, sim.throttle - dt * 0.4);
    document.getElementById('rngThrottle').value = Math.round(sim.throttle * 100);
  }

  if (sim.mouseYoke && targets.source === 'keyboard') {
    targetRoll = sim.aileronInput;
    targetPitch = sim.elevInput;
  }

  sim.elevInput = THREE.MathUtils.lerp(sim.elevInput, targetPitch, dt * 10);
  sim.aileronInput = THREE.MathUtils.lerp(sim.aileronInput, targetRoll, dt * 10);
  sim.rudderInput = THREE.MathUtils.lerp(sim.rudderInput, targetYaw, dt * 10);

  // Autopilot / ILS coupling (control laws in autopilot.js; signs pinned by unit tests)
  if (sim.apMaster) {
    _euler.setFromQuaternion(sim.quat, 'YXZ');
    const curHdg = (-_euler.y * RAD_TO_DEG + 360) % 360;
    const pitchDeg = _euler.x * RAD_TO_DEG;
    const bankRightDeg = -_euler.z * RAD_TO_DEG;
    const rollRateRight = -sim.angVel.z;
    const pitchRateUp = sim.angVel.x;
    const holdHeading = (hdgDeg) => {
      const bankCmd = bankCommandForHeading(headingError(hdgDeg, curHdg));
      sim.aileronInput = aileronForBank(bankCmd, bankRightDeg, rollRateRight);
    };
    // Fly a flight-path angle: pitch = path + current angle of attack.
    // Pitch is capped at 9.5° nose-up (737 tailstrike is ~11°).
    const holdGamma = (gammaDeg) => {
      sim.elevInput = elevatorForPitch(Math.min(9.5, gammaDeg + sim.aoaDeg), pitchDeg, pitchRateUp);
    };

    if (sim.apApproach && sim.activeEnd) {
      const ap = approachGeometry(sim.activeEnd, sim.pos);
      holdHeading(sim.activeEnd.hdgT + localizerInterceptDeg(ap.crossM));
      const wheelH = sim.pos.y - sim.groundY - spec.gearHeight;
      const gsMps = Math.max(20, Math.hypot(sim.vel.x, sim.vel.z));
      if (wheelH > 15) {
        holdGamma(glidepathGammaDeg(ap.heightAbovePathM));
        sim.throttle = throttleForSpeed(sim.iasKts, spec.vrefKts + 5, sim.throttle, dt);
      } else {
        // Flare from 15 m: trade sink rate for height; hold Vref+3 until ~8 m (25 ft), then retard.
        holdGamma(Math.atan2(flareSinkMps(wheelH), gsMps) * RAD_TO_DEG);
        if (wheelH > 8) sim.throttle = throttleForSpeed(sim.iasKts, spec.vrefKts + 3, sim.throttle, dt * 3);
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

  // Transform the AIR-RELATIVE velocity to the body frame: u (fwd), v (right), w (down).
  // Aerodynamics see the air mass, not the ground (weather.js wind, gusts included).
  const invQuat = _q1.copy(sim.quat).invert();
  const bodyVel = _v1.copy(sim.vel).sub(sim.windVec).applyQuaternion(invQuat);
  const u = -bodyVel.z;
  const v = bodyVel.x;
  const w = -bodyVel.y;

  const airspeed = Math.max(0.1, bodyVel.length());
  sim.tasKts = airspeed * MPS_TO_KTS;
  sim.iasKts = sim.tasKts;
  sim.gsKts = Math.round(Math.hypot(sim.vel.x, sim.vel.z) * MPS_TO_KTS);
  sim.mach = sim.tasKts / SPEED_OF_SOUND_KTS;

  // Angle of Attack (AoA) and Sideslip (Beta)
  const aoaRad = Math.atan2(w, Math.max(u, 0.1));
  sim.aoaDeg = aoaRad * RAD_TO_DEG;
  sim.betaDeg = Math.asin(THREE.MathUtils.clamp(v / airspeed, -1, 1)) * RAD_TO_DEG;

  const qDyn = dynamicPressure(airspeed);

  // Aerodynamic Lift & Drag Curves with Post-Stall Drop (aero.js)
  const cl = liftCoefficient(spec, aoaRad, sim.flapsIndex);

  // Induced Drag Polar + Ground Effect Factor (aero.js)
  const groundEffect = groundEffectFactor(sim.pos.y - sim.groundY, spec.wingSpanM);
  const cd = dragCoefficient(spec, cl, sim.gearDown, sim.flapsIndex, groundEffect);

  const liftForce = cl * qDyn * spec.wingAreaM2;
  const dragForce = cd * qDyn * spec.wingAreaM2;
  const thrustForce = sim.throttle * spec.maxThrustN;

  // Body Forces
  const fBodyX = -dragForce * (v / airspeed);
  const fBodyY = liftForce;
  const fBodyZ = -thrustForce + dragForce;

  const totalForceWorld = _v2.set(fBodyX, fBodyY, fBodyZ).applyQuaternion(sim.quat);
  totalForceWorld.y -= spec.massKg * GRAVITY;

  // Ground Spring-Damper Suspension, on the real ground under the aircraft (terrain.js)
  // 1 cm contact tolerance: on a sloped runway, sub-nanometre drift along the slope changes
  // the ground height by ~1e-13 m, which must not count as lifting off.
  const gh = sim.groundY + spec.gearHeight;
  if (sim.pos.y <= gh + 0.01) {
    const penetration = gh - sim.pos.y;
    const kSpring = spec.massKg * 85;
    const kDamper = spec.massKg * 9;
    const normalForce = Math.max(0, penetration * kSpring - sim.vel.y * kDamper);

    totalForceWorld.y += normalForce;
    sim.onGround = true;

    // Tyres: rolling resistance (μ·N, brakes μ 0.45) along the nose, and a stiff side
    // force across it so the aircraft rolls where it points instead of skating sideways.
    // (The prototype used friction ∝ speed, which capped the takeoff roll near 75 kt.)
    const fwd = _v3.set(0, 0, -1).applyQuaternion(sim.quat);
    fwd.y = 0;
    fwd.normalize();
    const vAlong = sim.vel.x * fwd.x + sim.vel.z * fwd.z;
    const vSideX = sim.vel.x - fwd.x * vAlong;
    const vSideZ = sim.vel.z - fwd.z * vAlong;
    const mu = sim.brakesOn ? 0.45 : 0.02;
    const roll = Math.abs(vAlong) > 0.3 ? -Math.sign(vAlong) * mu * normalForce : -vAlong * spec.massKg * 2;
    totalForceWorld.x += fwd.x * roll;
    totalForceWorld.z += fwd.z * roll;
    const sideMax = 0.8 * normalForce;
    totalForceWorld.x += THREE.MathUtils.clamp(-vSideX * spec.massKg * 4, -sideMax, sideMax);
    totalForceWorld.z += THREE.MathUtils.clamp(-vSideZ * spec.massKg * 4, -sideMax, sideMax);
  } else {
    sim.onGround = false;
  }

  const accel = totalForceWorld.divideScalar(spec.massKg);
  sim.vel.addScaledVector(accel, dt);
  sim.pos.addScaledVector(sim.vel, dt);

  // Sink rate at the moment of contact, captured before the ground clamp zeroes it.
  if (!sim.onGround) sim.lastAirVsi = Math.round(sim.vel.y * M_TO_FT * 60);

  if (sim.pos.y < gh) {
    sim.pos.y = gh;
    if (sim.vel.y < 0) sim.vel.y = 0;
  }

  // Angular Moments & Inertial Damping
  const qRate = (-sim.elevInput * (spec.pitchAuthority ?? 1.8) - sim.angVel.x * spec.pitchDamping) * (airspeed / 120);
  // aileron + rolls right (negative body z rate); see autopilot.js for the conventions
  const pRate = (-sim.aileronInput * (spec.rollAuthority ?? 2.8) - sim.angVel.z * spec.rollDamping) * (airspeed / 120);
  // Rudder + directional stability: the nose weathervanes into the relative wind, so a
  // banked aircraft actually turns.
  const betaRad = Math.asin(THREE.MathUtils.clamp(v / airspeed, -1, 1));
  const rRate = (-sim.rudderInput * 1.2 + sideslipYawAccel(betaRad) - sim.angVel.y * spec.yawDamping) * (airspeed / 120);

  sim.angVel.x += qRate * dt;
  sim.angVel.y += rRate * dt;
  sim.angVel.z += pRate * dt;

  if (Math.abs(sim.aileronInput) < 0.05 && !sim.apMaster) {
    sim.angVel.z -= sim.angVel.z * 1.5 * dt;
  }

  // Integrate Orientation Quaternion
  const deltaRot = _q1.set(
    sim.angVel.x * dt * 0.5,
    sim.angVel.y * dt * 0.5,
    sim.angVel.z * dt * 0.5,
    1.0
  ).normalize();
  sim.quat.multiply(deltaRot).normalize();

  // On the ground the gear and tail limit pitch: no rotating past the tailstrike angle.
  if (sim.onGround) {
    _euler.setFromQuaternion(sim.quat, 'YXZ');
    const maxP = (spec.maxGroundPitchDeg ?? 15) * DEG_TO_RAD;
    if (_euler.x > maxP || _euler.x < -0.05) {
      _euler.x = THREE.MathUtils.clamp(_euler.x, -0.05, maxP);
      sim.quat.setFromEuler(_euler);
      if ((_euler.x >= maxP && sim.angVel.x > 0) || (_euler.x <= -0.05 && sim.angVel.x < 0)) sim.angVel.x = 0;
    }
  }

  // Telemetry derivatives
  sim.aglFt = Math.max(0, Math.round((sim.pos.y - sim.groundY) * M_TO_FT));
  sim.mslFt = Math.round(yToFtMsl(sim.pos.y));
  sim.vsiFpm = Math.round(sim.vel.y * M_TO_FT * 60);
  sim.gLoad = 1.0 + (accel.y / GRAVITY);

  // Warning alerts
  const stallWarning = isStallWarning(sim.iasKts, spec.stallCleanKts, sim.onGround);
  const gpwsWarning = isGpwsWarning(sim.aglFt, sim.vsiFpm, sim.onGround);
  document.getElementById('stallAlertBanner').classList.toggle('hidden', !stallWarning);
  document.getElementById('masterAlertBanner').classList.toggle('hidden', !gpwsWarning);
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

  const txt = document.getElementById('txtPapiStatus');
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

function renderHud() {
  const w = hudCanvas.width;
  const h = hudCanvas.height;
  hudCtx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  _euler.setFromQuaternion(sim.quat, 'YXZ');
  const pitchRad = _euler.x;
  const rollRad = _euler.z;
  const hdgDeg = Math.round((-_euler.y * RAD_TO_DEG + 360) % 360);

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

  // Flight Path Marker (Velocity Vector)
  const fpmX = cx + (sim.vel.x / 40) * 12;
  const fpmY = cy - (sim.vel.y / 20) * 14;
  hudCtx.strokeStyle = '#10b981';
  hudCtx.beginPath();
  hudCtx.arc(fpmX, fpmY, 5, 0, Math.PI * 2);
  hudCtx.moveTo(fpmX - 10, fpmY); hudCtx.lineTo(fpmX - 5, fpmY);
  hudCtx.moveTo(fpmX + 5, fpmY); hudCtx.lineTo(fpmX + 10, fpmY);
  hudCtx.moveTo(fpmX, fpmY - 5); hudCtx.lineTo(fpmX, fpmY - 9);
  hudCtx.stroke();

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

  // Speed Tape
  hudCtx.strokeRect(cx - 175, cy - 90, 44, 180);
  hudCtx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  hudCtx.fillRect(cx - 175, cy - 90, 44, 180);
  hudCtx.fillStyle = '#38bdf8';
  hudCtx.font = '12px monospace';
  hudCtx.fillText(`${Math.round(sim.iasKts)}`, cx - 165, cy + 4);

  // Altitude Tape
  hudCtx.strokeRect(cx + 130, cy - 90, 56, 180);
  hudCtx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  hudCtx.fillRect(cx + 130, cy - 90, 56, 180);
  hudCtx.fillStyle = '#38bdf8';
  hudCtx.fillText(`${sim.mslFt}`, cx + 136, cy + 4);

  // Heading Arc
  hudCtx.strokeRect(cx - 52, cy - 145, 104, 24);
  hudCtx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  hudCtx.fillRect(cx - 52, cy - 145, 104, 24);
  hudCtx.fillStyle = '#38bdf8';
  hudCtx.textAlign = 'center';
  hudCtx.fillText(`TRK ${String(hdgDeg).padStart(3, '0')}°`, cx, cy - 129);

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

  hudCtx.restore();
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

function loadScenario(key) {
  const mission = missionByKey(key);
  sim.missionKey = mission.key;
  sim.brakesOn = false;
  sim.apMaster = false;
  sim.apApproach = false;
  sim.lastCalloutIdx = -1;
  sim.angVel.set(0, 0, 0);
  sim.rwySelectTimer = 0;
  sim.landingGraded = false;
  sim.airborneTime = 0;
  sim.lastLanding = null;
  resetCoach();
  document.getElementById('resultsCard').classList.add('hidden');

  if (mission.kind === 'final') {
    const end = runwayEnd(mission.airport, mission.rwy);
    const vApp = (sim.spec.vrefKts + 5) * 0.514444;
    const s = approachSpawn(end, mission.distNm, vApp);
    sim.pos.set(s.pos.x, s.pos.y, s.pos.z);
    sim.vel.set(s.vel.x, s.vel.y, s.vel.z);
    sim.flapsIndex = 2;
    // Spawn in trim: pitch = trim AoA − 3° path, so the final starts stable, not sinking.
    const pitch = (trimAoaDeg(sim.spec, vApp, sim.flapsIndex) - 3) * DEG_TO_RAD;
    sim.quat.setFromEuler(_euler.set(pitch, s.yawRad, 0, 'YXZ'));
    sim.throttle = 0.44;
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
    sim.gearDown = true;
    sim.onGround = true;
    sim.activeEnd = end;
  } else {
    const [x, y, z] = mission.pos;
    const yaw = -mission.hdg * DEG_TO_RAD;
    const d = courseVector(mission.hdg);
    sim.pos.set(x, y, z);
    sim.vel.set(d.x * mission.speedMps, 0, d.z * mission.speedMps);
    sim.quat.setFromAxisAngle(_v3.set(0, 1, 0), yaw);
    sim.throttle = mission.throttle;
    sim.flapsIndex = 0;
    sim.gearDown = false;
    sim.onGround = false;
    sim.activeEnd = null;
  }
  sim.groundY = ground.heightAt(sim.pos.x, sim.pos.z);
  photoreal?.noteSessionReuse(); // a new mission keeps the same Google session (usage counter)
  if (sim.activeEnd) Object.assign(sim.approach, approachGeometry(sim.activeEnd, sim.pos));
  document.getElementById('rngThrottle').value = Math.round(sim.throttle * 100);
}

function toggleTimeOfDay() {
  sim.timeOfDayMode = (sim.timeOfDayMode + 1) % 3;
  const badge = document.getElementById('txtTimeBadge');
  if (sim.timeOfDayMode === 0) {
    badge.textContent = 'Day';
    skyBase.setHex(0x38bdf8);
    scene.fog.color.setHex(0x94a3b8);
    ambientLight.color.setHex(0xdbeafe);
    ambientLight.intensity = 0.85 * LIGHT_SCALE;
    sunLight.intensity = 1.4 * LIGHT_SCALE;
  } else if (sim.timeOfDayMode === 1) {
    badge.textContent = 'Sunset';
    skyBase.setHex(0xf97316);
    scene.fog.color.setHex(0x7c2d12);
    ambientLight.color.setHex(0xfed7aa);
    ambientLight.intensity = 0.6 * LIGHT_SCALE;
    sunLight.intensity = 0.9 * LIGHT_SCALE;
  } else {
    badge.textContent = 'Night';
    skyBase.setHex(0x020617);
    scene.fog.color.setHex(0x0f172a);
    ambientLight.color.setHex(0x1e293b);
    ambientLight.intensity = 0.25 * LIGHT_SCALE;
    sunLight.intensity = 0.15 * LIGHT_SCALE;
  }
  applyGroundLight();
  applySky();
}

function syncUI() {
  document.getElementById('txtThrottle').textContent = `${Math.round(sim.throttle * 100)}%`;
  document.getElementById('txtIasGs').textContent = `${Math.round(sim.iasKts)}/${sim.gsKts}K`;
  document.getElementById('txtAltMsl').textContent = `${sim.mslFt} FT`;
  document.getElementById('txtAltAgl').textContent = `${sim.aglFt} FT`;
  document.getElementById('txtVsi').textContent = `${sim.vsiFpm} FPM`;
  document.getElementById('txtGLoad').textContent = `${sim.gLoad.toFixed(2)}G`;
  document.getElementById('txtAoaBadge').textContent = `${sim.aoaDeg.toFixed(1)}°`;

  _euler.setFromQuaternion(sim.quat, 'YXZ');
  const curHdg = Math.round((-_euler.y * RAD_TO_DEG + 360) % 360);
  document.getElementById('txtRadarHdg').textContent = `${curHdg}°`;

  const nav1 = document.getElementById('txtNav1');
  if (sim.activeEnd) {
    const distNm = Math.max(0, sim.approach.distM) / NM_TO_M;
    document.getElementById('txtNavDist').textContent = `DME ${distNm.toFixed(1)} NM`;
    nav1.textContent = `NAV1: ${sim.activeEnd.name} ILS · ${String(Math.round(sim.activeEnd.hdgT)).padStart(3, '0')}°T`;
  } else {
    document.getElementById('txtNavDist').textContent = 'DME ---';
    nav1.textContent = 'NAV1: no runway ahead';
  }
  document.getElementById('txtSurfaceState').textContent = sim.onGround ? 'TOUCHDOWN / GROUND' : 'AIRBORNE';

  document.getElementById('btnApMaster').classList.toggle('active', sim.apMaster);
  document.getElementById('btnApHdg').classList.toggle('active', sim.apHdgHold);
  document.getElementById('btnApAlt').classList.toggle('active', sim.apAltHold);
  document.getElementById('btnApApr').classList.toggle('active', sim.apApproach);

  document.getElementById('btnGear').classList.toggle('active', sim.gearDown);
  document.getElementById('txtGear').textContent = sim.gearDown ? 'DOWN 3 GRN' : 'UP';

  document.getElementById('txtFlaps').textContent = `${sim.flapAngles[sim.flapsIndex]}°`;
  document.getElementById('btnBrakes').classList.toggle('active-amber', sim.brakesOn);
  document.getElementById('txtBrakes').textContent = sim.brakesOn ? 'SET' : 'OFF';

  document.getElementById('meterElev').textContent = `${Math.round(sim.elevInput * 100)}%`;
  document.getElementById('meterAil').textContent = `${Math.round(sim.aileronInput * 100)}%`;
  document.getElementById('meterRud').textContent = `${Math.round(sim.rudderInput * 100)}%`;

  const knob = document.getElementById('virtualStickKnob');
  if (knob) {
    const kx = sim.aileronInput * 36;
    const ky = sim.elevInput * 36;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  // Phone layout (touch deck + telemetry strip)
  const tKnob = document.getElementById('touchStickKnob');
  tKnob.style.transform = `translate(${sim.aileronInput * 44}px, ${sim.elevInput * 44}px)`;
  const thrPct = Math.round(sim.throttle * 100);
  document.getElementById('txtTouchThr').textContent = `${thrPct}%`;
  document.getElementById('touchThrottleFill').style.height = `${thrPct}%`;
  document.getElementById('touchThrottleHandle').style.bottom = `${thrPct}%`;
  document.getElementById('touchThrottle').setAttribute('aria-valuenow', String(thrPct));
  document.getElementById('txtTouchGear').textContent = sim.gearDown ? 'DN' : 'UP';
  document.getElementById('touchGear').classList.toggle('active', sim.gearDown);
  document.getElementById('txtTouchFlaps').textContent = `${sim.flapAngles[sim.flapsIndex]}°`;
  document.getElementById('touchBrakes').classList.toggle('active-amber', sim.brakesOn);
  document.getElementById('touchIls').classList.toggle('active-amber', sim.apApproach);
  document.getElementById('txtPhoneIas').textContent = `${Math.round(sim.iasKts)}`;
  document.getElementById('txtPhoneAgl').textContent = `${sim.aglFt}`;
  document.getElementById('txtPhoneVs').textContent = `${sim.vsiFpm}`;
  const papi = document.getElementById('txtPapiStatus');
  const phonePapi = document.getElementById('txtPhonePapi');
  phonePapi.textContent = papi.textContent.replace('ON GLIDESLOPE', 'ON GS').replace('SLIGHTLY ', '');
  phonePapi.className = papi.className.replace('ml-1', '');
}

function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w === 0 || h === 0) return;

  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  photoreal?.resize();

  hudCanvas.width = w;
  hudCanvas.height = h;

  const mapRect = mapCanvas.parentElement.getBoundingClientRect();
  mapCanvas.width = Math.max(120, Math.floor(mapRect.width));
  mapCanvas.height = Math.max(80, Math.floor(mapRect.height));
}

window.addEventListener('resize', handleResize);

// Modal Triggers
document.getElementById('btnCloseModal').addEventListener('click', () => {
  applyCoachChoice();
  document.getElementById('onboardingModal').classList.add('hidden');
});
document.getElementById('btnStartFlight').addEventListener('click', () => {
  if (document.getElementById('chkAutoSound').checked) audio.init();
  applyCoachChoice();
  // The (billable) Google session starts only when someone actually flies, once per page.
  if (photorealAllowed(window.location) && !terrainOnly(window.location.search)) photoreal.start(`${import.meta.env.BASE_URL}api/config`);
  document.getElementById('onboardingModal').classList.add('hidden');
});
document.getElementById('btnOpenMissions').addEventListener('click', () => {
  document.getElementById('onboardingModal').classList.remove('hidden');
});

document.querySelectorAll('.btnMission').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btnMission').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const scenario = btn.getAttribute('data-scenario');
    document.getElementById('selScenario').value = scenario;
    loadScenario(scenario);
  });
});

// Aircraft Selector
document.getElementById('selAircraft').addEventListener('change', e => {
  sim.aircraftKey = e.target.value;
  sim.spec = AIRCRAFT_DATABASE[sim.aircraftKey];
  document.getElementById('txtAircraftTitle').textContent = sim.spec.name;
  buildAircraft(sim.aircraftKey);
});

document.getElementById('selScenario').addEventListener('change', e => {
  loadScenario(e.target.value);
});

// Camera, Satellite & Time Toggles
document.getElementById('btnCamera').addEventListener('click', () => {
  sim.cameraMode = (sim.cameraMode + 1) % sim.cameraNames.length;
  document.getElementById('txtCamMode').textContent = sim.cameraNames[sim.cameraMode];
});

document.getElementById('btnSatLayer').addEventListener('click', () => {
  sim.satelliteEnabled = !sim.satelliteEnabled;
  if (terrainGroup) terrainGroup.visible = sim.satelliteEnabled;
  setPhotorealMode(photorealOn);
  const txt = document.getElementById('txtSatState');
  txt.textContent = sim.satelliteEnabled ? 'Satellite' : 'Grid';
  document.getElementById('btnSatLayer').classList.toggle('active-sky', sim.satelliteEnabled);
});

document.getElementById('btnMouseYoke').addEventListener('click', () => {
  sim.mouseYoke = !sim.mouseYoke;
  const txt = document.getElementById('txtMouseYokeState');
  const crosshair = document.getElementById('mouseFlightCrosshair');
  if (sim.mouseYoke) {
    txt.textContent = 'ON';
    txt.className = 'text-emerald-400 font-bold';
    document.getElementById('btnMouseYoke').classList.add('active');
    crosshair.classList.remove('hidden');
  } else {
    txt.textContent = 'OFF';
    txt.className = 'text-amber-400 font-bold';
    document.getElementById('btnMouseYoke').classList.remove('active');
    crosshair.classList.add('hidden');
    sim.aileronInput = 0;
    sim.elevInput = 0;
  }
});

document.getElementById('btnTimeOfDay').addEventListener('click', toggleTimeOfDay);

document.getElementById('btnPause').addEventListener('click', () => {
  sim.paused = !sim.paused;
  document.getElementById('btnPause').textContent = sim.paused ? 'RESUME' : 'PAUSE';
});

document.getElementById('btnReset').addEventListener('click', () => {
  loadScenario(document.getElementById('selScenario').value);
});

// Autopilot Buttons
document.getElementById('btnApMaster').addEventListener('click', () => {
  sim.apMaster = !sim.apMaster;
  if (sim.apMaster) { sim.apHdgHold = true; sim.apAltHold = true; }
});
document.getElementById('btnApHdg').addEventListener('click', () => { sim.apHdgHold = !sim.apHdgHold; });
document.getElementById('btnApAlt').addEventListener('click', () => { sim.apAltHold = !sim.apAltHold; });
document.getElementById('btnApApr').addEventListener('click', () => {
  sim.apApproach = !sim.apApproach;
  if (sim.apApproach) sim.apMaster = true;
});

// Controls Surfaces
document.getElementById('btnGear').addEventListener('click', () => {
  if (!sim.onGround) sim.gearDown = !sim.gearDown;
});
document.getElementById('btnFlaps').addEventListener('click', () => {
  sim.flapsIndex = (sim.flapsIndex + 1) % sim.flapAngles.length;
});
document.getElementById('btnBrakes').addEventListener('click', () => {
  sim.brakesOn = !sim.brakesOn;
});

// Throttle Buttons
document.getElementById('rngThrottle').addEventListener('input', e => {
  sim.throttle = Number(e.target.value) / 100;
});
document.getElementById('btnIdle').addEventListener('click', () => {
  sim.throttle = 0; document.getElementById('rngThrottle').value = 0;
});
document.getElementById('btnApp').addEventListener('click', () => {
  sim.throttle = 0.44; document.getElementById('rngThrottle').value = 44;
});
document.getElementById('btnClimb').addEventListener('click', () => {
  sim.throttle = 0.75; document.getElementById('rngThrottle').value = 75;
});
document.getElementById('btnToga').addEventListener('click', () => {
  sim.throttle = 1.0; document.getElementById('rngThrottle').value = 100;
});

document.getElementById('btnCenterWings').addEventListener('click', () => {
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
bindStick(document.getElementById('virtualStickPad'));
bindStick(document.getElementById('touchStick'));

// Phone throttle track: drag anywhere on it, top = TO/GA, bottom = idle.
(function bindTouchThrottle() {
  const el = document.getElementById('touchThrottle');
  let pointerId = null;
  const set = (e) => {
    sim.throttle = throttleFromPoint(e.clientY, el.getBoundingClientRect());
    document.getElementById('rngThrottle').value = Math.round(sim.throttle * 100);
  };
  el.addEventListener('pointerdown', (e) => { pointerId = e.pointerId; el.setPointerCapture(e.pointerId); set(e); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === pointerId) set(e); });
  el.addEventListener('pointerup', (e) => { if (e.pointerId === pointerId) pointerId = null; });
  el.addEventListener('pointercancel', (e) => { if (e.pointerId === pointerId) pointerId = null; });
})();

// Phone system buttons reuse the desktop handlers.
document.getElementById('touchGear').addEventListener('click', () => document.getElementById('btnGear').click());
document.getElementById('touchFlaps').addEventListener('click', () => document.getElementById('btnFlaps').click());
document.getElementById('touchBrakes').addEventListener('click', () => document.getElementById('btnBrakes').click());
document.getElementById('touchIls').addEventListener('click', () => document.getElementById('btnApApr').click());

// Small status toast (gamepad connect/disconnect, etc.)
let toastTimer = 0;
function showToast(msg) {
  const el = document.getElementById('toast');
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
    if (b === BUTTON.A) document.getElementById('btnFlaps').click();
    else if (b === BUTTON.B) document.getElementById('btnGear').click();
    else if (b === BUTTON.X) document.getElementById('btnBrakes').click();
    else if (b === BUTTON.Y) document.getElementById('btnCamera').click();
    else if (b === BUTTON.START) document.getElementById('btnPause').click();
    else if (b === BUTTON.DPAD_UP) document.getElementById('btnApApr').click();
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
    const crosshair = document.getElementById('mouseFlightCrosshair');
    crosshair.style.left = `${e.clientX}px`;
    crosshair.style.top = `${e.clientY}px`;

    const normX = (e.clientX / window.innerWidth) * 2 - 1;
    const normY = (e.clientY / window.innerHeight) * 2 - 1;
    sim.aileronInput = THREE.MathUtils.clamp(normX * 1.5, -1, 1);
    sim.elevInput = THREE.MathUtils.clamp(normY * 1.5, -1, 1);
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
  if (e.code === 'KeyG') { if (!sim.onGround) sim.gearDown = !sim.gearDown; }
  else if (e.code === 'KeyF') { sim.flapsIndex = (sim.flapsIndex + 1) % sim.flapAngles.length; }
  else if (e.code === 'KeyB') { sim.brakesOn = !sim.brakesOn; }
  else if (e.code === 'KeyC') { document.getElementById('btnCamera').click(); }
  else if (e.code === 'KeyM') { document.getElementById('btnMouseYoke').click(); }
  else if (e.code === 'KeyZ') { document.getElementById('btnApMaster').click(); }
  else if (e.code === 'Space') {
    sim.elevInput = 0; sim.aileronInput = 0; sim.rudderInput = 0;
    sim.angVel.set(0, 0, 0);
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

document.getElementById('btnAudio').addEventListener('click', () => {
  if (!audio.started) audio.init();
  else {
    sim.audioEnabled = !sim.audioEnabled;
    updateAudioButton();
  }
});

let lastTime = performance.now();
// Longest frame the sim catches up on (a hidden tab or a stall beyond this is skipped).
const MAX_FRAME_S = 0.25;
function renderLoop(time) {
  requestAnimationFrame(renderLoop);
  const dt = Math.min((time - lastTime) / 1000, MAX_FRAME_S);
  lastTime = time;

  updateGamepad();
  step6DofPhysics(dt);
  if (!sim.paused) updateCoach(dt);
  syncWeatherUI(dt);
  updateCamera();
  terrainLod.update(dt, camera);
  photoreal.update(dt);
  updateDebugOverlay(dt);
  renderer.render(scene, camera);
  renderHud();
  renderRadar();
  syncUI();
  audio.update();
}

// ?debug: a one-line usage readout of the Google session (to verify the free tier holds).
const debugOverlay = new URLSearchParams(window.location.search).has('debug') ? document.createElement('div') : null;
if (debugOverlay) {
  debugOverlay.style.cssText = 'position:absolute;left:8px;bottom:14px;z-index:40;font:10px monospace;color:#a7f3d0;background:rgba(2,6,23,.7);padding:2px 6px;border-radius:4px;pointer-events:none';
  document.body.appendChild(debugOverlay);
}
let debugTimer = 0;
let creditsTimer = 0;
function updateDebugOverlay(dt) {
  if (photorealOn && (creditsTimer -= dt) <= 0) {
    creditsTimer = 1;
    const txt = document.getElementById('txtGoogleData');
    if (txt.textContent !== photoreal.state.attributions) txt.textContent = photoreal.state.attributions;
  }
  if (!debugOverlay || (debugTimer -= dt) > 0) return;
  debugTimer = 1;
  const st = photoreal.state, s = photoreal.session;
  debugOverlay.textContent = `3D tiles: ${st.status}${st.reason ? ` (${st.reason})` : ''} · this page: ${s ? s.page.roots : 0} root, ${s ? s.page.reuses : 0} reuses`
    + ` · this browser: ${s ? s.usage.roots : 0} roots, ${s ? s.usage.reuses : 0} reuses · tiles ${st.visibleTiles} · calib ${st.calibM.toFixed(1)} m`;
}

// Read-only snapshot for e2e tests and curious players (no setters, no globals mutated).
window.openaeroDebug = () => {
  _euler.setFromQuaternion(sim.quat, 'YXZ');
  const m = missionByKey(sim.missionKey);
  return {
    mission: sim.missionKey,
    missionRunway: m.kind === 'tour' ? null : `${m.airport}_${m.rwy}`,
    activeRunway: sim.activeEnd ? sim.activeEnd.id : null,
    runwayHdgT: sim.activeEnd ? sim.activeEnd.hdgT : null,
    headingDeg: (-_euler.y * RAD_TO_DEG + 360) % 360,
    pitchDeg: _euler.x * RAD_TO_DEG,
    bankRightDeg: -_euler.z * RAD_TO_DEG,
    elevInput: sim.elevInput,
    aileronInput: sim.aileronInput,
    crossM: sim.approach.crossM,
    distM: sim.approach.distM,
    heightAbovePathM: sim.approach.heightAbovePathM,
    pos: { x: sim.pos.x, y: sim.pos.y, z: sim.pos.z },
    groundY: sim.groundY,
    aglFt: sim.aglFt,
    mslFt: sim.mslFt,
    onGround: sim.onGround,
    iasKts: sim.iasKts,
    gsKts: sim.gsKts,
    wxLive: sim.wx.live,
    cloudBaseFt: cloudDeck && cloudDeck.visible ? sim.wx.ceilingFt : null,
    lastLanding: sim.lastLanding,
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
  const sel = document.getElementById('selScenario');
  sel.innerHTML = '';
  for (const m of MISSIONS) {
    const o = document.createElement('option');
    o.value = m.key;
    o.textContent = m.label;
    sel.appendChild(o);
  }
}

function boot() {
  populateMissionSelect();
  let seen = false;
  try { seen = coachSeen(window.localStorage); } catch { /* storage unavailable: coach on */ }
  document.getElementById('chkCoach').checked = !seen;
  fetchWeather();
  setInterval(fetchWeather, 10 * 60 * 1000);
  buildSatelliteTerrain();
  buildAircraft('b738');
  // Deep links (?airport= / ?mission=): pick the flight; Start flight is still a tap.
  const linked = missionFromLink(window.location.search);
  loadScenario(linked || 'kdfw_35c_final');
  if (linked) {
    document.getElementById('selScenario').value = linked;
    document.querySelectorAll('.btnMission').forEach((b) => b.classList.toggle('active', b.dataset.scenario === linked));
    try { history.replaceState(null, '', `${location.pathname}${stripDeepLink(location.search)}${location.hash}`); } catch { /* sandboxed */ }
  }
  handleResize();
  requestAnimationFrame(renderLoop);
}

// The prototype booted on window.onload; a module script runs before 'load', so wait for it.
if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot, { once: true });
