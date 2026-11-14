// One-off: rasterise src/icons/*.svg to the PNGs the install manifest and the
// apple-touch-icon point at. Run `node tools/icons.mjs` and commit the files.
// Not a gate and not run in CI; it needs a browser, through playwright-core.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const JOBS = [
  ['jar.svg', 'jar-180.png', 180],
  ['jar.svg', 'jar-192.png', 192],
  ['jar.svg', 'jar-512.png', 512],
  ['jar-maskable.svg', 'jar-maskable-512.png', 512],
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

const dir = new URL('../src/icons/', import.meta.url);
const browser = await launch();
try {
  for (const [svgName, pngName, size] of JOBS) {
    const svg = await readFile(new URL(svgName, dir), 'utf8');
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setContent(`<!doctype html><body style="margin:0;background:transparent"><img src="${url}" width="${size}" height="${size}" style="display:block"></body>`);
    await page.waitForFunction(() => document.images[0].complete);
    const png = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await writeFile(new URL(pngName, dir), png);
    console.log(`wrote src/icons/${pngName} (${size}x${size})`);
    await page.close();
  }
} finally {
  await browser.close();
}
