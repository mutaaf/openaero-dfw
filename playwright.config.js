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
// Desktop specs draw the 3D view at half resolution (a screen under 1x keeps its ratio, so CSS
// layout and the HUD are unchanged). CI's SwiftShader pays per pixel and, past ~250 ms a frame,
// sim time falls behind wall time: at 1x a heavier scene pushed the suite past CI's 20 min
// limit (#52). Specs that measure canvas pixels use FULL_RES (tests/e2e/helpers.js); the perf
// probe measures at 1x.
const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 0.5, storageState: FULL_VIEW };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { args: GL_ARGS },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec|phone-landscape\.spec|perf\.spec|devices\.spec/, use: DESKTOP },
    { name: 'phone', testMatch: /mobile\.spec|phone-landscape\.spec/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [PILOT] }] }, launchOptions: { args: GL_ARGS } } },
    // The frame-time probe runs alone, after everything else: sharing SwiftShader's CPU
    // with a parallel flight test swung the same build from 207 to 314 ms a frame.
    { name: 'perf', testMatch: /perf\.spec/, dependencies: ['desktop', 'phone'], use: { ...DESKTOP, deviceScaleFactor: 1 } },
    // The device-class probe (0044): iPhone, iPad and Pixel sizes, touch, 4x CPU throttle.
    // After perf, so its throttled frames never share the CPU with the probe or a flight test.
    { name: 'devices', testMatch: /devices\.spec/, dependencies: ['perf'], use: { launchOptions: { args: GL_ARGS } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/openaero/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
