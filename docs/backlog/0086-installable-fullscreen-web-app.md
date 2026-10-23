---
id: 0086
title: Add to Home Screen opens the sim fullscreen, like an app, on iPhone, iPad and Android
status: in-progress
priority: P1
size: S
lens: accessibility
created: 2026-10-23
pr:
---

## Why
Every device the game has to impress is a phone or tablet, and in a browser tab Safari's and
Chrome's toolbars eat 100+ px of a 390x844 portrait screen and can reappear mid-flight. The
site has no web app manifest and no apple-touch-icon (`index.html` has only `theme-color`; `public/`
holds no icon), so "Add to Home Screen" saves a screenshot-grade bookmark that still opens in
the browser UI. An installed, fullscreen launch (no URL bar, safe-area aware) is the single
cheapest way to give a phone more horizon. No service worker is needed, so there is no
offline-cache or stale-build risk and no new network host.
Sources: MDN "Web app manifest" https://developer.mozilla.org/en-US/docs/Web/Manifest and
"Making PWAs installable" https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
(`display`, `start_url`, `scope`, icons ≥192 and 512 px); WebKit "Web Push for Web Apps on iOS
and iPadOS" https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (iOS 16.4+
honours the manifest's `display`; `apple-touch-icon` still supplies the icon).

## What
- `public/manifest.webmanifest`: `name` "OpenAero DFW", `short_name` "OpenAero", `start_url`
  and `scope` `/openaero/` (relative, so the base path holds), `display: "fullscreen"` with
  `display_override: ["fullscreen","standalone"]`, `background_color`/`theme_color` `#020617`,
  `orientation: "any"`, icons 192, 512 and a maskable 512.
- Icons generated from an existing in-repo mark (the favicon/start-screen glyph, original work),
  plus `apple-touch-icon` 180 px; committed as small PNGs.
- `index.html`: `<link rel="manifest">`, `<link rel="apple-touch-icon">`,
  `<meta name="apple-mobile-web-app-capable" content="yes">`,
  `<meta name="mobile-web-app-capable" content="yes">`,
  `apple-mobile-web-app-status-bar-style` `black-translucent`; all hrefs via the Vite base
  (`import.meta.env.BASE_URL` / relative), none root-absolute.
- Check that `viewport-fit=cover` plus the existing safe-area insets keep the HUD clear of the
  notch and home indicator when launched standalone (the stylesheet already uses `env()`).

## Acceptance criteria
- [ ] `dist/openaero/manifest.webmanifest` is valid JSON, its `start_url`/`scope`/icon URLs all
      resolve under `/openaero/`, and the icons exist at the sizes it lists
- [ ] index.html links the manifest and apple-touch-icon; no root-absolute URL is added
- [ ] No new runtime host, no service worker, no console error; boot JS budget unchanged
- [ ] At 390x844 and 844x390 with `display-mode: fullscreen` emulated, the HUD top stack and
      the touch controls stay clear of the safe-area insets (existing phone specs still pass)

## Test plan
Unit (vitest) or a small node check in `check:fast`: parse the built manifest, assert the fields
above and that every icon file exists with the stated size. Playwright smoke: the page links a
manifest that returns 200 with a JSON content type and the page still boots with zero console
errors. Add the manifest request to the e2e's allowed same-origin set if it filters requests.

## Out of scope
Service worker, offline play, install prompts or banners, push notifications, store listings.
