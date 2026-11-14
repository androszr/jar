// Renders the bitmap icons with the same headless Chromium the smoke check
// uses. `node tools/icons.mjs`. The outputs are committed: nothing is generated
// at deploy, and this is not a gate. Re-run only when an icon SVG changes; the
// bytes may differ between Chromium versions, the tests check size and signature.
//
// Two sets, drawn from the same jar:
// - the page's own icons (apple-touch-icon.png 180, icon-192.png, icon-512.png)
//   from src/icon.svg. The SVG has transparent top and bottom bands, so the
//   page colour is painted behind it, from the palette (no colour literal here).
// - the install manifest's icons under src/icons/ (jar-180/192/512.png from
//   jar.svg, jar-maskable-512.png from jar-maskable.svg), kept transparent.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { PALETTE, css } from '../src/look/lantern/palette.js';

const SRC = new URL('../src/', import.meta.url);
// [svg under src/, png under src/, size, page colour behind it]
const JOBS = [
  ['icon.svg', 'apple-touch-icon.png', 180, true],
  ['icon.svg', 'icon-192.png', 192, true],
  ['icon.svg', 'icon-512.png', 512, true],
  ['icons/jar.svg', 'icons/jar-180.png', 180, false],
  ['icons/jar.svg', 'icons/jar-192.png', 192, false],
  ['icons/jar.svg', 'icons/jar-512.png', 512, false],
  ['icons/jar-maskable.svg', 'icons/jar-maskable-512.png', 512, false],
];

async function launch() {
  try {
    return await chromium.launch();
  } catch (first) {
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      throw new Error(`No Chromium for playwright-core. Run: npx playwright-core install chromium-headless-shell\n${first.message}`);
    }
  }
}

const browser = await launch();
try {
  for (const [svgName, pngName, size, backed] of JOBS) {
    const svg = readFileSync(new URL(svgName, SRC));
    const dataUrl = `data:image/svg+xml;base64,${svg.toString('base64')}`;
    const bg = backed ? css(PALETTE.page) : 'transparent';
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:${bg}}img{display:block;width:${size}px;height:${size}px}</style></head><body><img src="${dataUrl}"></body></html>`);
    await page.waitForFunction(() => document.images[0].complete);
    const png = await page.screenshot({ type: 'png', omitBackground: !backed, clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(new URL(pngName, SRC), png);
    console.log(`wrote src/${pngName} (${size}x${size})`);
    await page.close();
  }
} finally {
  await browser.close();
}
