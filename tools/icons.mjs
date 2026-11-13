// Renders the three bitmap icons (apple-touch-icon.png 180, icon-192.png,
// icon-512.png) from src/icon.svg with the same headless Chromium the smoke
// check uses. `node tools/icons.mjs`. The outputs are committed: nothing is
// generated at deploy. Re-run only when src/icon.svg changes; the bytes may
// differ between Chromium versions, the tests check size and signature.
// The SVG has transparent top and bottom bands, so the page colour is painted
// behind it, from the palette (no colour literal here).
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { PALETTE, css } from '../src/look/lantern/palette.js';

const SRC = new URL('../src/', import.meta.url);
const SIZES = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
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

const svg = readFileSync(new URL('icon.svg', SRC));
const dataUrl = `data:image/svg+xml;base64,${svg.toString('base64')}`;
const html = `<!doctype html><html><head><style>html,body{margin:0;background:${css(PALETTE.page)}}img{display:block;width:100vw;height:100vh}</style></head><body><img src="${dataUrl}"></body></html>`;

const browser = await launch();
try {
  const page = await browser.newPage();
  for (const [name, size] of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html);
    await page.waitForFunction(() => document.images[0].complete);
    writeFileSync(new URL(name, SRC), await page.screenshot({ type: 'png' }));
    console.log(`wrote src/${name} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
