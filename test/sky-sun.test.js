import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawJarSky } from '../src/skyweather.js';
import { tint } from '../src/look/index.js';
import { sample } from '../src/clock.js';
import { EMPTY } from '../src/weather.js';

const rect = { x: 0, y: 0, w: 340, h: 396 };
const clearNoon = { ...EMPTY, known: true, kind: 'clear', code: 0, cloudCover: 0, temperature: 20 };

function arcs(opts) {
  const calls = [];
  const target = { createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([String(k), a]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  drawJarSky(ctx, rect, 0.4, tint(sample(0.4)), clearNoon, 0, opts);
  return calls.filter(([k]) => k === 'arc').length;
}

test('the shared sky draws its sun disc by day unless the city declines it', () => {
  const withSun = arcs({});
  assert.ok(withSun >= 1, 'a clear noon draws the sun disc');
  assert.equal(arcs({ sun: false }), withSun - 1, 'sun: false drops the disc and nothing else');
  assert.equal(arcs({ sun: true }), withSun);
});
