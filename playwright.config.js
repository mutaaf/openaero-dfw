import { defineConfig, devices } from '@playwright/test';

// Headless Chromium renders WebGL through SwiftShader (software GL), in CI and locally.
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } };

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
    { name: 'desktop', testIgnore: /mobile\.spec|phone-landscape\.spec|perf\.spec/, use: DESKTOP },
    { name: 'phone', testMatch: /mobile\.spec|phone-landscape\.spec/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, launchOptions: { args: GL_ARGS } } },
    // The frame-time probe runs alone, after everything else: sharing SwiftShader's CPU
    // with a parallel flight test swung the same build from 207 to 314 ms a frame.
    { name: 'perf', testMatch: /perf\.spec/, dependencies: ['desktop', 'phone'], use: DESKTOP },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/openaero/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
