// The device-class matrix (0044) and layout helpers shared by devices.spec.js (the throttled
// flights, alone after `perf`) and deviceLayout.spec.js (layout-only checks, in the parallel phase).
export const DEVICES = [
  { name: 'iPhone 15 portrait', width: 390, height: 844 },
  { name: 'iPhone 15 landscape', width: 844, height: 390 },
  { name: 'iPad Air portrait', width: 820, height: 1180 },
  { name: 'iPad Air landscape', width: 1180, height: 820 },
  // Exactly on the 1024 px breakpoint, where the touch-only desktop-width rule starts.
  { name: 'iPad Pro 12.9 portrait', width: 1024, height: 1366 },
  { name: 'Pixel 8 portrait', width: 412, height: 915 },
  // 0217: the commonest Android width and the iPhone SE / mini, where the tapes' edges come in.
  { name: 'Android 360 portrait', width: 360, height: 800 },
  { name: 'iPhone SE portrait', width: 375, height: 667 },
];
export const ALERTS = ['#masterAlertBanner', '#stallAlertBanner'];
export const PANELS = ['#topRow', '#touchThrottle', '#touchStick', '#touchButtons', '#coach', ...ALERTS];
export const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
