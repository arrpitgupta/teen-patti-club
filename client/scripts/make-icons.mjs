/* global console */
// Renders the app icons (PNG) from an SVG with Playwright's Chromium.
// Run: pnpm --filter @tpc/client exec node scripts/make-icons.mjs
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

/** Felt square with three fanned cards; `pad` keeps maskable icons inside the safe zone. */
function svg(size, pad) {
  const s = size;
  const c = s / 2;
  const cw = s * 0.22 * (1 - pad);
  const ch = cw * 1.42;
  const card = (dx, rot, fill, extra = '') =>
    `<g transform="translate(${c + dx * (1 - pad)} ${c + s * 0.02}) rotate(${rot})">
      <rect x="${-cw / 2}" y="${-ch / 2}" width="${cw}" height="${ch}" rx="${cw * 0.12}" fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="${s * 0.004}"/>
      ${extra}
    </g>`;
  const pip = (txt, color) =>
    `<text x="0" y="${ch * 0.12}" font-family="Georgia, serif" font-weight="700" font-size="${cw * 0.62}" text-anchor="middle" fill="${color}">${txt}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <defs>
      <radialGradient id="felt" cx="50%" cy="42%" r="70%">
        <stop offset="0" stop-color="#1b6b49"/><stop offset="0.55" stop-color="#0f4630"/><stop offset="1" stop-color="#062417"/>
      </radialGradient>
      <pattern id="back" width="${cw * 0.18}" height="${cw * 0.18}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="100%" height="100%" fill="#5b1220"/><rect width="${cw * 0.04}" height="100%" fill="rgba(251,248,241,0.25)"/>
      </pattern>
    </defs>
    <rect width="${s}" height="${s}" fill="url(#felt)"/>
    ${card(-s * 0.13, -14, 'url(#back)')}
    ${card(s * 0.13, 14, '#FBF8F1', pip('K', '#B3261E'))}
    ${card(0, 0, '#FBF8F1', pip('A', '#111'))}
    <circle cx="${c + s * 0.2 * (1 - pad)}" cy="${c + s * 0.24 * (1 - pad)}" r="${s * 0.07 * (1 - pad)}" fill="#ECC66A" stroke="#7a5a12" stroke-width="${s * 0.008}"/>
  </svg>`;
}

const icons = [
  { name: 'icon-192.png', size: 192, pad: 0 },
  { name: 'icon-512.png', size: 512, pad: 0 },
  { name: 'icon-maskable-512.png', size: 512, pad: 0.22 },
  { name: 'apple-touch-icon.png', size: 180, pad: 0.06 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(icon.size, icon.pad)}</body></html>`,
  );
  await page.screenshot({ path: join(out, icon.name), omitBackground: false });
  console.log('wrote', icon.name);
}
await browser.close();
