/**
 * Renders every store icon/banner from one SVG design using Playwright's Chromium.
 *   node scripts/generate-icons.cjs
 * Replace LOGO/BANNER below with your final branding and re-run.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const LOGO = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C8CFF"/><stop offset="1" stop-color="#C084FC"/></linearGradient></defs>
  <rect width="100" height="100" rx="22" fill="#0B0D12"/>
  <rect x="14" y="24" width="72" height="48" rx="10" fill="url(#g)"/>
  <path d="M44 38 L60 48 L44 58 Z" fill="#0B0D12"/>
  <path d="M26 82 h48" stroke="#7C8CFF" stroke-width="6" stroke-linecap="round"/>
  <circle cx="74" cy="28" r="10" fill="#22C55E" stroke="#0B0D12" stroke-width="4"/>
  <path d="M69.5 28 l3 3 l5.5 -6" stroke="#0B0D12" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const BANNER = (w, h) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 320 180">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151922"/><stop offset="1" stop-color="#0B0D12"/></linearGradient>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C8CFF"/><stop offset="1" stop-color="#C084FC"/></linearGradient></defs>
  <rect width="320" height="180" fill="url(#bg)"/>
  <rect x="34" y="58" width="72" height="48" rx="10" fill="url(#g)"/>
  <path d="M64 72 L80 82 L64 92 Z" fill="#0B0D12"/>
  <text x="122" y="98" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="800" fill="#F4F6FB">Curato</text>
  <text x="124" y="122" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#9AA3B5">Only the videos you choose</text>
</svg>`;

const targets = [
  // Phone app (Expo)
  { file: 'apps/mobile/assets/icon.png', w: 1024, h: 1024, svg: LOGO(1024) },
  // Android TV / Google TV / Fire TV launcher
  { file: 'platforms/android-tv/app/src/main/res/drawable-xhdpi/banner.png', w: 320, h: 180, svg: BANNER(320, 180) },
  { file: 'platforms/android-tv/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', w: 192, h: 192, svg: LOGO(192) },
  { file: 'platforms/android-tv/app/src/main/res/mipmap-xhdpi/ic_launcher.png', w: 96, h: 96, svg: LOGO(96) },
  { file: 'platforms/android-tv/store/play-feature-banner-1280x720.png', w: 1280, h: 720, svg: BANNER(1280, 720) },
  // Samsung Tizen
  { file: 'platforms/tizen/icon.png', w: 512, h: 512, svg: LOGO(512) },
  // LG webOS
  { file: 'platforms/webos/icon.png', w: 80, h: 80, svg: LOGO(80) },
  { file: 'platforms/webos/largeIcon.png', w: 130, h: 130, svg: LOGO(130) },
  { file: 'platforms/webos/splash.png', w: 1920, h: 1080, svg: BANNER(1920, 1080) },
  // Hosted TV web app favicon
  { file: 'apps/tv/public/icon.png', w: 192, h: 192, svg: LOGO(192) },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const t of targets) {
    await page.setViewportSize({ width: t.w, height: t.h });
    await page.setContent(`<html><body style="margin:0;background:transparent">${t.svg}</body></html>`);
    const out = path.join(root, t.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: t.w, height: t.h } });
    console.log('wrote', t.file);
  }
  await browser.close();
})();
