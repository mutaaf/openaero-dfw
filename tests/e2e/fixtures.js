// Every e2e page runs silent. Chrome's --mute-audio (playwright.config.js) silences Web
// Audio, but speechSynthesis goes through the operating system's speech service and would
// talk out loud on a developer's machine. Specs that listen for callouts still replace
// speak() with their own recorder (their init script runs after this one).
//
// `test.use({ simWarp: 2 })` runs sim time twice as fast as wall time. The sim steps on the
// rAF timestamp alone (main.js renderLoop: dt = the frame's time, capped at 0.25 s, split
// into ≤ 1/60 s physics sub-steps), so scaling that clock flies the same physics in fewer
// rendered frames; a frame past the cap loses time, as it does unwarped, so the long flights
// pair it with deviceScaleFactor 0.25 (frames that stay under the cap) to keep CI under its
// 30 min job limit (lesson 2026-10-28). Specs that time frames, count pixels or catch a
// moment that lasts a fraction of a second (the bounce) don't use it.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  simWarp: [1, { option: true }],
  context: async ({ context, simWarp }, use) => {
    await context.addInitScript(() => {
      if (window.speechSynthesis) {
        window.speechSynthesis.speak = () => {};
        window.speechSynthesis.cancel = () => {};
      }
    });
    if (simWarp !== 1) {
      await context.addInitScript((k) => {
        const now = performance.now.bind(performance);
        performance.now = () => now() * k;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => raf((t) => cb(t * k));
      }, simWarp);
    }
    await use(context);
  },
});
export { expect };
