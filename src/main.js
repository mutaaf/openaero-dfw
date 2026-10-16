// OpenAero DFW: renderer, scene, 6-DOF integrator, HUD, radar, and UI wiring.
// Ported from the single-file prototype. Pure logic lives in the sibling modules
// (constants, aircraft, runways, geo, aero, input, audio); the Keeper keeps carving
// this file into focused modules with no behavior change.
import * as THREE from 'three';
import './styles.css';
import {
  M_TO_FT, MPS_TO_KTS, NM_TO_M, DEG_TO_RAD, RAD_TO_DEG, GRAVITY,
  SPEED_OF_SOUND_KTS, DFW_ORIGIN_LAT, DFW_ORIGIN_LON, FIELD_ELEV_FT,
} from './constants.js';
import { AIRCRAFT_DATABASE } from './aircraft.js';
import { RUNWAYS, DOWNTOWN_DALLAS } from './runways.js';
import { latLonToTile, tilePlacement, esriTileUrl } from './geo.js';
import {
  dynamicPressure, liftCoefficient, groundEffectFactor, dragCoefficient,
  headingError, papiWhiteLights, isStallWarning, isGpwsWarning,
} from './aero.js';
import { keys, pilotTargets, stickFromPoint } from './input.js';
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
  windDirDeg: 350, windSpeedKts: 21, windGustKts: 31,
  audioEnabled: false,
  lastCalloutIdx: -1
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
let aircraftRoot, terrainGroup;
let animRefs = { prop: null, flame: null, fanL: null, fanR: null };
let papiSpheres = [];

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
} catch (err) {
  console.error('Three.js renderer init failure:', err);
}

scene = new THREE.Scene();
scene.background = new THREE.Color(0x38bdf8);
scene.fog = new THREE.FogExp2(0x94a3b8, 0.000035);

camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 95000);

ambientLight = new THREE.AmbientLight(0xdbeafe, 0.85);
scene.add(ambientLight);

sunLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
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

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = 'anonymous';

function buildSatelliteTerrain() {
  terrainGroup = new THREE.Group();

  // Base regional fallback ground plane
  const groundGeo = new THREE.PlaneGeometry(120000, 120000);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x1b281f });
  const basePlane = new THREE.Mesh(groundGeo, groundMat);
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.y = -0.5;
  terrainGroup.add(basePlane);

  // Stream real Esri Aerial Satellite Tiles at Zoom 13
  // Covering Dallas-Fort Worth Metroplex (~35km x 35km)
  const zoom = 13;
  const centerTile = latLonToTile(DFW_ORIGIN_LAT, DFW_ORIGIN_LON, zoom);
  const tileRadius = 4; // 9x9 grid of high-res satellite tiles

  for (let dx = -tileRadius; dx <= tileRadius; dx++) {
    for (let dy = -tileRadius; dy <= tileRadius; dy++) {
      const tileX = centerTile.x + dx;
      const tileY = centerTile.y + dy;

      // NW and SE corners for geographic placement (geo.js)
      const { widthM, lengthM, posX, posZ } = tilePlacement(tileX, tileY, zoom);

      const tileGeo = new THREE.PlaneGeometry(widthM, lengthM);
      const tileMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });

      const tileMesh = new THREE.Mesh(tileGeo, tileMat);
      tileMesh.rotation.x = -Math.PI / 2;
      tileMesh.position.set(posX, 0.05, posZ);
      terrainGroup.add(tileMesh);

      // Esri World Imagery sub-meter satellite tile service
      const url = esriTileUrl(zoom, tileX, tileY);
      textureLoader.load(
        url,
        (tex) => {
          tex.anisotropy = 4;
          tileMat.map = tex;
          tileMat.needsUpdate = true;
        },
        undefined,
        (err) => {
          // Graceful fallback to dark satellite green if tile is cached or rate limited
          tileMat.color.setHex(0x233827);
        }
      );
    }
  }

  scene.add(terrainGroup);

  // Runways with Exact Precision Centerlines, Touchdown Zones & 4-Light PAPI
  RUNWAYS.forEach(rwy => {
    const rGroup = new THREE.Group();
    rGroup.position.set(rwy.cx, 0.35, rwy.cz);
    rGroup.rotation.y = (180 - rwy.headingDeg) * DEG_TO_RAD;

    const rwyMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(rwy.width, rwy.length),
      new THREE.MeshLambertMaterial({ color: 0x181c24 })
    );
    rwyMesh.rotation.x = -Math.PI / 2;
    rGroup.add(rwyMesh);

    // Centerline dashes
    for (let z = -rwy.length / 2 + 50; z < rwy.length / 2 - 50; z += 60) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.06, z);
      rGroup.add(dash);
    }

    // Threshold Piano Keys
    for (let x = -rwy.width / 2 + 5; x <= rwy.width / 2 - 5; x += 5) {
      const bar1 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 36), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      bar1.rotation.x = -Math.PI / 2;
      bar1.position.set(x, 0.06, -rwy.length / 2 + 30);
      rGroup.add(bar1);

      const bar2 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 36), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      bar2.rotation.x = -Math.PI / 2;
      bar2.position.set(x, 0.06, rwy.length / 2 - 30);
      rGroup.add(bar2);
    }

    // Active 4-Light PAPI Glideslope for Runway 35C
    if (rwy.id === 'KDFW_35C') {
      for (let i = 0; i < 4; i++) {
        const papiSphere = new THREE.Mesh(
          new THREE.SphereGeometry(1.6, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        papiSphere.position.set(-rwy.width / 2 - 14 - i * 5.5, 1.2, 1850 - 300);
        rGroup.add(papiSphere);
        papiSpheres.push(papiSphere);
      }
    }

    scene.add(rGroup);
  });

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

  // Margaret Hunt Hill Bridge Arch
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(15800, 0, 9600);
  bridgeGroup.rotation.y = 0.45;
  const bridgeArch = new THREE.Mesh(new THREE.TorusGeometry(110, 3.5, 8, 32, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  bridgeArch.position.y = 15;
  bridgeArch.rotation.y = Math.PI / 2;
  bridgeGroup.add(bridgeArch);
  scene.add(bridgeGroup);

  // Arlington AT&T Stadium
  const att = new THREE.Mesh(new THREE.CylinderGeometry(150, 130, 55, 24), new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }));
  att.position.set(-2400, 27.5, 9600);
  scene.add(att);
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

function step6DofPhysics(dt) {
  if (sim.paused) return;

  // Sub-stepping for ultra-stable numerical integration (3 sub-steps per frame)
  const subSteps = 3;
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

  // Update PAPI glideslope lamps
  updatePapi();
}

function integrateSubStep(dt) {
  const spec = sim.spec;

  // Pilot Input Controls
  const targets = pilotTargets(keys);
  let targetPitch = targets.pitch, targetRoll = targets.roll;
  const targetYaw = targets.yaw;

  if (keys['ShiftLeft'] || keys['ShiftRight']) {
    sim.throttle = Math.min(1.0, sim.throttle + dt * 0.4);
    document.getElementById('rngThrottle').value = Math.round(sim.throttle * 100);
  }
  if (keys['ControlLeft'] || keys['ControlRight']) {
    sim.throttle = Math.max(0.0, sim.throttle - dt * 0.4);
    document.getElementById('rngThrottle').value = Math.round(sim.throttle * 100);
  }

  if (sim.mouseYoke) {
    targetRoll = sim.aileronInput;
    targetPitch = sim.elevInput;
  }

  sim.elevInput = THREE.MathUtils.lerp(sim.elevInput, targetPitch, dt * 10);
  sim.aileronInput = THREE.MathUtils.lerp(sim.aileronInput, targetRoll, dt * 10);
  sim.rudderInput = THREE.MathUtils.lerp(sim.rudderInput, targetYaw, dt * 10);

  // Autopilot / ILS Coupling
  if (sim.apMaster) {
    if (sim.apApproach) {
      const locOffset = sim.pos.x;
      sim.aileronInput = THREE.MathUtils.clamp(-locOffset * 0.003, -0.6, 0.6);

      // 3.0° Glideslope profile
      const idealAlt = Math.max(spec.gearHeight, sim.pos.z * Math.tan(3.0 * DEG_TO_RAD));
      const altErr = sim.pos.y - idealAlt;
      const targetPitchAngle = THREE.MathUtils.clamp(-0.052 - altErr * 0.0006, -0.15, 0.1);

      _euler.setFromQuaternion(sim.quat, 'YXZ');
      sim.elevInput = THREE.MathUtils.clamp((targetPitchAngle - _euler.x) * 4.0, -1.0, 1.0);

      // Flare at 50 FT AGL
      if (sim.pos.y < 20) {
        sim.elevInput = -0.22;
        sim.throttle = THREE.MathUtils.lerp(sim.throttle, 0.0, dt * 1.5);
      } else {
        sim.throttle = 0.44;
      }
    } else {
      _euler.setFromQuaternion(sim.quat, 'YXZ');
      if (sim.apHdgHold) {
        const curHdg = (-_euler.y * RAD_TO_DEG + 360) % 360;
        const diff = headingError(sim.targetHdgDeg, curHdg);
        sim.aileronInput = THREE.MathUtils.clamp(diff * 0.025, -0.6, 0.6);
      }
      if (sim.apAltHold) {
        const altErr = sim.targetAltFt - sim.mslFt;
        const desiredPitch = THREE.MathUtils.clamp(altErr * 0.00018, -0.15, 0.2);
        sim.elevInput = THREE.MathUtils.clamp((desiredPitch - _euler.x) * 3.5, -1.0, 1.0);
      }
    }
  }

  // Transform World Velocity to Aircraft Body Frame: u (fwd), v (right), w (down)
  const invQuat = _q1.copy(sim.quat).invert();
  const bodyVel = _v1.copy(sim.vel).applyQuaternion(invQuat);
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
  const groundEffect = groundEffectFactor(sim.pos.y, spec.wingSpanM);
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

  // Ground Spring-Damper Suspension
  const gh = spec.gearHeight;
  if (sim.pos.y <= gh) {
    const penetration = gh - sim.pos.y;
    const kSpring = spec.massKg * 85;
    const kDamper = spec.massKg * 9;
    const normalForce = Math.max(0, penetration * kSpring - sim.vel.y * kDamper);

    totalForceWorld.y += normalForce;
    sim.onGround = true;

    const mu = sim.brakesOn ? 0.45 : 0.025;
    totalForceWorld.x -= sim.vel.x * spec.massKg * mu * 3.5;
    totalForceWorld.z -= sim.vel.z * spec.massKg * mu * 3.5;
  } else {
    sim.onGround = false;
  }

  const accel = totalForceWorld.divideScalar(spec.massKg);
  sim.vel.addScaledVector(accel, dt);
  sim.pos.addScaledVector(sim.vel, dt);

  if (sim.pos.y < gh) {
    sim.pos.y = gh;
    if (sim.vel.y < 0) sim.vel.y = 0;
  }

  // Angular Moments & Inertial Damping
  const qRate = (-sim.elevInput * 1.8 - sim.angVel.x * spec.pitchDamping) * (airspeed / 120);
  const pRate = (sim.aileronInput * 2.8 - sim.angVel.z * spec.rollDamping) * (airspeed / 120);
  const rRate = (-sim.rudderInput * 1.2 - sim.angVel.y * spec.yawDamping) * (airspeed / 120);

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

  // Telemetry derivatives
  sim.aglFt = Math.max(0, Math.round(sim.pos.y * M_TO_FT));
  sim.mslFt = Math.round(sim.aglFt + FIELD_ELEV_FT);
  sim.vsiFpm = Math.round(sim.vel.y * M_TO_FT * 60);
  sim.gLoad = 1.0 + (accel.y / GRAVITY);

  // Warning alerts
  const stallWarning = isStallWarning(sim.iasKts, spec.stallCleanKts, sim.onGround);
  const gpwsWarning = isGpwsWarning(sim.aglFt, sim.vsiFpm, sim.onGround);
  document.getElementById('stallAlertBanner').classList.toggle('hidden', !stallWarning);
  document.getElementById('masterAlertBanner').classList.toggle('hidden', !gpwsWarning);
}

function updatePapi() {
  if (!papiSpheres.length) return;
  const distToThreshold = Math.max(10, sim.pos.z - 1850);
  const currentSlopeDeg = Math.atan2(sim.pos.y, distToThreshold) * RAD_TO_DEG;

  const numWhite = papiWhiteLights(currentSlopeDeg);

  for (let i = 0; i < 4; i++) {
    if (i < numWhite) {
      papiSpheres[i].material.color.setHex(0xffffff);
    } else {
      papiSpheres[i].material.color.setHex(0xff2222);
    }
  }

  const txt = document.getElementById('txtPapiStatus');
  if (numWhite === 2) {
    txt.textContent = 'ON GLIDESLOPE';
    txt.className = 'text-emerald-400 font-bold ml-1';
  } else if (numWhite > 2) {
    txt.textContent = 'SLIGHTLY HIGH';
    txt.className = 'text-sky-300 font-bold ml-1';
  } else {
    txt.textContent = 'SLIGHTLY LOW';
    txt.className = 'text-amber-400 font-bold ml-1';
  }
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
    camera.position.set(-960, 96, -80);
    camera.lookAt(sim.pos);
    camera.up.set(0, 1, 0);

  } else {
    // 6. Tail Drone Cam
    const tailOffset = _v1.set(0, 7.5, 24).applyQuaternion(sim.quat);
    camera.position.copy(sim.pos).add(tailOffset);
    camera.lookAt(sim.pos.clone().add(_v2.set(0, 1.2, -40).applyQuaternion(sim.quat)));
    camera.up.set(0, 1, 0);
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
  if (sim.apApproach || Math.abs(sim.pos.z) > 1000) {
    const locDev = THREE.MathUtils.clamp(sim.pos.x * 0.08, -80, 80);
    const idealAlt = Math.max(0, sim.pos.z * Math.tan(3 * DEG_TO_RAD));
    const gsDev = THREE.MathUtils.clamp((sim.pos.y - idealAlt) * 0.4, -60, 60);

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

  RUNWAYS.forEach(r => {
    const rx = cx + (r.cx - sim.pos.x) * scale;
    const ry = cy + (r.cz - sim.pos.z) * scale;
    mapCtx.fillStyle = '#38bdf8';
    mapCtx.fillRect(rx - 2, ry - 14, 4, 28);
    mapCtx.fillStyle = '#94a3b8';
    mapCtx.font = '8px monospace';
    mapCtx.fillText(r.name.replace('KDFW ', ''), rx + 4, ry);
  });

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
  sim.brakesOn = false;
  sim.apMaster = false;
  sim.apApproach = false;
  sim.lastCalloutIdx = -1;
  sim.angVel.set(0, 0, 0);

  if (key === 'kdfw_35c_final') {
    sim.pos.set(0, 390, 7408);
    sim.vel.set(0, -3.6, -72);
    sim.quat.set(0, 0, 0, 1);
    sim.throttle = 0.44;
    sim.flapsIndex = 2;
    sim.gearDown = true;
    sim.onGround = false;
  } else if (key === 'kdfw_takeoff') {
    sim.pos.set(0, sim.spec.gearHeight, 1800);
    sim.vel.set(0, 0, 0);
    sim.quat.set(0, 0, 0, 1);
    sim.throttle = 0;
    sim.flapsIndex = 1;
    sim.gearDown = true;
    sim.onGround = true;
  } else if (key === 'kdfw_17c_final') {
    sim.pos.set(0, 390, -7408);
    sim.vel.set(0, -3.6, 72);
    sim.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    sim.throttle = 0.44;
    sim.flapsIndex = 2;
    sim.gearDown = true;
    sim.onGround = false;
  } else if (key === 'kdal_31r_final') {
    sim.pos.set(18000, 360, 9000);
    const rad = 316 * DEG_TO_RAD;
    sim.vel.set(-Math.sin(rad) * 70, -3.5, -Math.cos(rad) * 70);
    sim.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rad);
    sim.throttle = 0.42;
    sim.flapsIndex = 2;
    sim.gearDown = true;
    sim.onGround = false;
  } else if (key === 'downtown_skyline') {
    sim.pos.set(17600, 520, 13000);
    sim.vel.set(0, 0, -108);
    sim.quat.set(0, 0, 0, 1);
    sim.throttle = 0.65;
    sim.flapsIndex = 0;
    sim.gearDown = false;
    sim.onGround = false;
  } else if (key === 'att_stadium') {
    sim.pos.set(-2400, 480, 12500);
    sim.vel.set(0, 0, -100);
    sim.quat.set(0, 0, 0, 1);
    sim.throttle = 0.62;
    sim.flapsIndex = 0;
    sim.gearDown = false;
    sim.onGround = false;
  }
  document.getElementById('rngThrottle').value = Math.round(sim.throttle * 100);
}

function toggleTimeOfDay() {
  sim.timeOfDayMode = (sim.timeOfDayMode + 1) % 3;
  const badge = document.getElementById('txtTimeBadge');
  if (sim.timeOfDayMode === 0) {
    badge.textContent = 'Day';
    scene.background.setHex(0x38bdf8);
    scene.fog.color.setHex(0x94a3b8);
    ambientLight.color.setHex(0xdbeafe);
    ambientLight.intensity = 0.85;
    sunLight.intensity = 1.4;
  } else if (sim.timeOfDayMode === 1) {
    badge.textContent = 'Sunset';
    scene.background.setHex(0xf97316);
    scene.fog.color.setHex(0x7c2d12);
    ambientLight.color.setHex(0xfed7aa);
    ambientLight.intensity = 0.6;
    sunLight.intensity = 0.9;
  } else {
    badge.textContent = 'Night';
    scene.background.setHex(0x020617);
    scene.fog.color.setHex(0x0f172a);
    ambientLight.color.setHex(0x1e293b);
    ambientLight.intensity = 0.25;
    sunLight.intensity = 0.15;
  }
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

  const distNm = Math.hypot(sim.pos.x, sim.pos.z) / NM_TO_M;
  document.getElementById('txtNavDist').textContent = `DME ${distNm.toFixed(1)} NM`;
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
}

function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w === 0 || h === 0) return;

  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  hudCanvas.width = w;
  hudCanvas.height = h;

  const mapRect = mapCanvas.parentElement.getBoundingClientRect();
  mapCanvas.width = Math.max(120, Math.floor(mapRect.width));
  mapCanvas.height = Math.max(80, Math.floor(mapRect.height));
}

window.addEventListener('resize', handleResize);

// Modal Triggers
document.getElementById('btnCloseModal').addEventListener('click', () => {
  document.getElementById('onboardingModal').classList.add('hidden');
});
document.getElementById('btnStartFlight').addEventListener('click', () => {
  if (document.getElementById('chkAutoSound').checked) audio.init();
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

// Virtual Stick Dragging
const stickPad = document.getElementById('virtualStickPad');
let isStickActive = false;
function handleStickEvent(e) {
  const rect = stickPad.getBoundingClientRect();
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  if (clientX === undefined) return;
  const stick = stickFromPoint(clientX, clientY, rect);
  sim.aileronInput = stick.x;
  sim.elevInput = stick.y;
}

stickPad.addEventListener('mousedown', e => { isStickActive = true; handleStickEvent(e); });
stickPad.addEventListener('touchstart', e => { isStickActive = true; handleStickEvent(e); }, { passive: true });
window.addEventListener('mousemove', e => { if (isStickActive) handleStickEvent(e); });
window.addEventListener('touchmove', e => { if (isStickActive) handleStickEvent(e); }, { passive: true });
window.addEventListener('mouseup', () => {
  if (isStickActive) { isStickActive = false; sim.aileronInput = 0; sim.elevInput = 0; }
});
window.addEventListener('touchend', () => {
  if (isStickActive) { isStickActive = false; sim.aileronInput = 0; sim.elevInput = 0; }
});

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
function renderLoop(time) {
  requestAnimationFrame(renderLoop);
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  step6DofPhysics(dt);
  updateCamera();
  renderer.render(scene, camera);
  renderHud();
  renderRadar();
  syncUI();
  audio.update();
}

function boot() {
  buildSatelliteTerrain();
  buildAircraft('b738');
  loadScenario('kdfw_35c_final');
  handleResize();
  requestAnimationFrame(renderLoop);
}

// The prototype booted on window.onload; a module script runs before 'load', so wait for it.
if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot, { once: true });
