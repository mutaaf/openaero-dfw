// Every e2e page runs silent. Chrome's --mute-audio (playwright.config.js) silences Web
// Audio, but speechSynthesis goes through the operating system's speech service and would
// talk out loud on a developer's machine. Specs that listen for callouts still replace
// speak() with their own recorder (their init script runs after this one).
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      if (window.speechSynthesis) {
        window.speechSynthesis.speak = () => {};
        window.speechSynthesis.cancel = () => {};
      }
    });
    await use(context);
  },
});
export { expect };
