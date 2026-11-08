#!/usr/bin/env node
/**
 * Prepares a Samsung (Tizen) or LG (webOS) app folder that launches the hosted Curato TV app.
 *
 *   CURATO_APP_URL=https://tv.yourdomain.com/ pnpm package:tizen
 *   CURATO_APP_URL=https://tv.yourdomain.com/ pnpm package:webos
 *
 * Output: platforms/out/<platform>/ – then sign & package with the vendor tools (see docs/STORES.md):
 *   Tizen:  tizen package -t wgt -s <your-cert-profile> -- platforms/out/tizen
 *   webOS:  ares-package platforms/out/webos -o platforms/out
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const platformsDir = join(here, '..');
const platform = process.argv[2];

if (platform !== 'tizen' && platform !== 'webos') {
  console.error('Usage: package-launcher.mjs <tizen|webos>');
  process.exit(1);
}

const appUrl = process.env.CURATO_APP_URL;
if (!appUrl || !/^https:\/\/[^/]+/.test(appUrl)) {
  console.error('Set CURATO_APP_URL to the https URL of your deployed Curato worker, e.g. CURATO_APP_URL=https://tv.example.com/');
  process.exit(1);
}
const appHost = new URL(appUrl).host;

const outDir = join(platformsDir, 'out', platform);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const fill = (text) => text.replaceAll('__APP_URL__', appUrl).replaceAll('__APP_HOST__', appHost).replaceAll('__PLATFORM__', platform);

writeFileSync(join(outDir, 'index.html'), fill(readFileSync(join(platformsDir, 'shared', 'launcher.html'), 'utf8')));

for (const file of readdirSync(join(platformsDir, platform))) {
  const src = join(platformsDir, platform, file);
  if (file.endsWith('.xml') || file.endsWith('.json')) writeFileSync(join(outDir, file), fill(readFileSync(src, 'utf8')));
  else copyFileSync(src, join(outDir, file));
}

console.log(`Prepared ${platform} app in ${outDir}`);
console.log(platform === 'tizen' ? 'Next: tizen package -t wgt -s <cert-profile> -- ' + outDir : 'Next: ares-package ' + outDir + ' -o ' + join(platformsDir, 'out'));
