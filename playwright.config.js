import { defineConfig, devices } from '@playwright/test';

// Headless Chromium renders WebGL through SwiftShader (software GL), in CI and locally.
// Sound off: Fly starts the engine audio and the spoken coach/GPWS, which a local run would play aloud.
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'];
// Most desktop specs drive the instrument panels, so they start in the full view; the clean
// view (the default for players) has its own spec that clears this (tests/e2e/view.spec.js).
// They also fly the raw airplane (Pilot) and read its plain-key bests; a first visit flies
// Learner (0059), checked with an empty profile in tests/e2e/assists.spec.js.
export const PILOT = { name: 'openaero_assist_v1', value: '{"v":1,"level":"pilot","at":0}' };
export const FULL_VIEW = {
  cookies: [],
  origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'openaero_view_v1', value: '{"v":1,"clean":false,"at":0}' }, PILOT] }],
};
// Desktop specs draw the 3D view at quarter resolution (a screen under 1x keeps its ratio, so CSS
// layout and the HUD canvas are unchanged). CI's SwiftShader pays per pixel and, past ~250 ms a
// frame, sim time falls behind wall time: at 1x a heavier scene pushed the suite past CI's 20 min
// limit (#52); 0.5 → 0.25 took the boot-and-check specs 2.6 → 2.1 min when main's CI hit its
// 30 min limit again with every test green (2026-11-13). Specs that measure 3D canvas pixels use
// FULL_RES (tests/e2e/helpers.js); the perf probe measures at 1x.
const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 0.25, storageState: FULL_VIEW };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // CI's runner has 4 vCPUs: 3 workers (75%), not Playwright's default 2 (50%). In Oct 2026 a
  // third worker starved SwiftShader and flight specs timed out, but since then the desktop 3D
  // view draws at 0.25x, phones at 0.5x and the long flights are warped: on a 4-core sandbox
  // the full suite (388 tests, CI=1) ran 27.2 min on 2 workers and 23.1 min on 3, all green,
  // while main's CI was being cancelled at its 30 min limit with every test passing (2026-11-23).
  // perf and devices still run alone after everything else (one test file each).
  workers: process.env.CI ? '75%' : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { args: GL_ARGS },
    // A trace records screenshots and DOM snapshots for the whole test, which costs CPU that
    // SwiftShader needs: 'retain-on-failure' recorded every test and cut the cost only by
    // deleting it afterwards. The same desktop specs ran 156 s with it and 94 s without
    // (2 workers); CI was cancelled at its 30 min limit with every test green. CI retries a
    // failure once and traces that retry, so a failing test still uploads its trace.
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec|phone-landscape\.spec|perf\.spec|devices\.spec|deviceLayout\.spec/, use: DESKTOP },
    // Phone specs check layout and touch in CSS pixels (the HUD canvas is CSS-sized whatever the
    // ratio), so the 3D view draws at half resolution: the Pixel 7's 2.625 (2x after the resolution
    // cap) made the project 6.6 min, 1x 5.1 (2026-10-27); 1x → 0.5 took it 6.2 → 5.3 min here
    // (2026-11-13). The device-class probe keeps 1x.
    { name: 'phone', testMatch: /mobile\.spec|phone-landscape\.spec/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 0.5, storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [PILOT] }] }, launchOptions: { args: GL_ARGS } } },
    // The frame-time probe runs alone, after everything else: sharing SwiftShader's CPU
    // with a parallel flight test swung the same build from 207 to 314 ms a frame.
    { name: 'perf', testMatch: /perf\.spec/, dependencies: ['desktop', 'phone', 'device-layout'], use: { ...DESKTOP, deviceScaleFactor: 1 } },
    // The device-class probe (0044): iPhone, iPad and Pixel sizes, touch, 4x CPU throttle.
    // After perf, so its throttled frames never share the CPU with the probe or a flight test.
    { name: 'devices', testMatch: /devices\.spec/, dependencies: ['perf'], use: { launchOptions: { args: GL_ARGS } } },
    // The device sizes' layout-only checks (credits, short-phone tapes: no flight, no frame times)
    // run in the parallel phase. In devices.spec.js they were 17 tests run one at a time after perf
    // while two workers sat idle: ~40 s of CI's wall clock on a normal runner, ~1 min on a slow one
    // (main's CI on 45be31b was cancelled at 30 min in that tail, 383/390 green, 2026-11-24).
    { name: 'device-layout', testMatch: /deviceLayout\.spec/, use: { launchOptions: { args: GL_ARGS } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/openaero/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
