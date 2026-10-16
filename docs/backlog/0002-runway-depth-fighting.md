---
id: 0002
title: Stop the modelled runways vanishing under the satellite tiles
status: shipped
priority: P1
size: S
lens: authenticity
created: 2026-10-16
pr: 4
---

## Why
On the default 4 NM final, the modelled KDFW 35C (markings, threshold bars, centreline)
is invisible: with the camera's near plane at 0.5 m and far plane at 95 km, the depth
buffer can't separate the runway (y=0.35) from the tiles (y=0.05, `polygonOffset -1`),
and the tiles win. With tiles stubbed to a flat colour in tests, the approach view shows
no runway at all; in production you only see the runway because it's in the photo. The
PAPI and markings are what make the landing readable.

## What
In `src/main.js`: enable `logarithmicDepthBuffer: true` on the `WebGLRenderer` and/or
raise the near plane dynamically with altitude, and drop the tile `polygonOffset` hack if
it's no longer needed. Verify the runway, centreline and threshold bars are visible from
4 NM and still sit flush with the imagery at touchdown.

## Acceptance criteria
- [ ] With tiles stubbed, a screenshot of the 4 NM approach shows the runway as a dark
      strip with white markings ahead of the aircraft
- [ ] No z-fighting shimmer on the runway at touchdown (screenshot after the takeoff scenario loads)
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
New e2e test: isolate `#simCanvas` (as `distinctColours` does), load `kdfw_35c_final`,
sample the pixel column below the screen centre and assert dark runway pixels are present
where today there are only ground-colour pixels.

## Out of scope
Taxiways, aprons, airport buildings.
