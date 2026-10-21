import { describe, it, expect } from 'vitest';
import { headingBoxTop, HEADING_BOX_H, TAPE_TOP, BELOW_TOP_BAR, takeoffCallTop, TAKEOFF_CALL_H, TAKEOFF_CALL_W, cameraFovDeg, BASE_FOV_DEG, MIN_HFOV_DEG, MAX_FOV_DEG } from '../../src/hudLayout.js';

describe('headingBoxTop', () => {
  it('keeps the classic cy - 145 on tall screens (desktop, portrait phone)', () => {
    expect(headingBoxTop(720 / 2)).toBe(720 / 2 - 145);
    expect(headingBoxTop(844 / 2)).toBe(844 / 2 - 145);
  });

  it('drops below the top bar on a phone held sideways (0025)', () => {
    for (const h of [320, 360, 375, 390, 414, 430]) {
      const top = headingBoxTop(h / 2);
      // The top bar (and a coach or alert wrapped to three lines) ends by ~66 px.
      expect(top, `${h}: below the top bar`).toBeGreaterThanOrEqual(70);
      // And above the horizon box the layout keeps free (35% … 65% of the height).
      expect(top + HEADING_BOX_H, `${h}: above the horizon box`).toBeLessThanOrEqual(h * 0.35);
    }
  });

  it('sits above the tapes wherever the phone is at least 375 px tall', () => {
    for (const h of [375, 390, 414, 430, 480, 720, 844]) {
      expect(headingBoxTop(h / 2) + HEADING_BOX_H).toBeLessThanOrEqual(h / 2 + TAPE_TOP);
    }
    expect(BELOW_TOP_BAR).toBe(72);
  });
});

describe('takeoffCallTop (0035)', () => {
  it('sits under the heading box and clear above the horizon on every screen height', () => {
    for (const h of [320, 360, 375, 390, 414, 430, 480, 720, 844, 1180, 1366]) {
      const top = takeoffCallTop(h / 2);
      expect(top, `${h}: under the heading box`).toBeGreaterThanOrEqual(headingBoxTop(h / 2) + HEADING_BOX_H);
      // The horizon is at cy on the roll (pitch 0) and only drops once rotated.
      expect(top + TAKEOFF_CALL_H, `${h}: above the horizon`).toBeLessThanOrEqual(h / 2 - 25);
    }
  });
  it('fits between the speed tape (ends cx - 131) and the altitude tape (starts cx + 130)', () => {
    expect(TAKEOFF_CALL_W / 2).toBeLessThanOrEqual(130 - 8);
  });
});

describe('cameraFovDeg (0044)', () => {
  const hFov = (vDeg, aspect) => 2 * Math.atan(Math.tan((vDeg * Math.PI) / 360) * aspect) * (180 / Math.PI);

  it('keeps the classic 62° on landscape screens (desktop, phone sideways, iPad sideways)', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [844, 390], [568, 320], [1180, 820], [1024, 1024]]) {
      expect(cameraFovDeg(w, h), `${w}x${h}`).toBe(BASE_FOV_DEG);
    }
    expect(BASE_FOV_DEG).toBe(62);
  });

  it('opens the vertical FOV in portrait so the view is not a 31° keyhole', () => {
    // At 62° vertical a 390x844 phone saw only 31° across: a crab or a turn put the
    // runway off the side. Portrait keeps at least MIN_HFOV_DEG across, up to the cap.
    for (const [w, h] of [[820, 1180], [768, 1024], [834, 1194], [1024, 1366]]) {
      const v = cameraFovDeg(w, h);
      expect(v, `${w}x${h}`).toBeGreaterThan(BASE_FOV_DEG);
      expect(hFov(v, w / h), `${w}x${h} across`).toBeCloseTo(MIN_HFOV_DEG, 6);
    }
    for (const [w, h] of [[390, 844], [412, 915], [360, 800], [430, 932], [320, 568]]) {
      const v = cameraFovDeg(w, h);
      expect(v, `${w}x${h}`).toBe(MAX_FOV_DEG);
      expect(hFov(v, w / h), `${w}x${h} across`).toBeGreaterThan(40);
    }
  });

  it('never narrows or exceeds the cap, and grows monotonically as the screen gets taller', () => {
    let prev = 0;
    for (let aspect = 2.5; aspect >= 0.3; aspect -= 0.01) {
      const v = cameraFovDeg(1000 * aspect, 1000);
      expect(v).toBeGreaterThanOrEqual(BASE_FOV_DEG);
      expect(v).toBeLessThanOrEqual(MAX_FOV_DEG);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('tolerates a zero-sized window (returns the base FOV)', () => {
    expect(cameraFovDeg(0, 0)).toBe(BASE_FOV_DEG);
    expect(cameraFovDeg(390, 0)).toBe(BASE_FOV_DEG);
  });
});
