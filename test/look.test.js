import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as look from '../src/look/index.js';
import { KEYFRAMES, sample } from '../src/clock.js';
import { TINTS } from '../src/look/lantern/palette.js';

const REQUIRED = ['PALETTE', 'CSS_VARS', 'tint', 'skyGradient', 'glow', 'bloom', 'spill', 'vignette',
  'plank', 'glassBody', 'glassHighlights', 'lid', 'label', 'text', 'forecastCard', 'weatherIcon', 'droplet'];

test('LOOK is one of the three directions, and Lantern is chosen', () => {
  assert.ok(['lantern', 'toybox', 'pixel'].includes(look.LOOK));
  assert.equal(look.LOOK, 'lantern');
});

test('the active look exports the whole required surface', () => {
  for (const name of REQUIRED) assert.ok(name in look, `look lacks ${name}`);
  for (const name of ['skyGradient', 'glow', 'bloom', 'spill', 'vignette', 'plank', 'glassBody',
    'glassHighlights', 'lid', 'label', 'text', 'tint']) assert.equal(typeof look[name], 'function', name);
});

test('the weather nuances have their colours and a droplet primitive in the look', () => {
  assert.equal(typeof look.droplet, 'function');
  for (const n of ['flash', 'dew', 'dewHighlight']) assert.equal(look.PALETTE[n].length, 3, n);
});

test('TINTS has all nine keyframe names, each with every channel', () => {
  const names = [...new Set(KEYFRAMES.map((k) => k.name))];
  assert.equal(names.length, 9);
  for (const n of names) {
    const t = TINTS[n];
    assert.ok(t, `no tint for ${n}`);
    for (const ch of ['skyTop', 'skyLow', 'lantern', 'spill']) assert.equal(t[ch].length, 3, `${n}.${ch}`);
    for (const ch of ['ambient', 'bloom']) assert.equal(typeof t[ch], 'number', `${n}.${ch}`);
  }
});

test('tint(sample) interpolates between two keyframes and returns every channel', () => {
  const a = TINTS.noon;
  const b = TINTS.afternoon;
  const mid = look.tint({ light: 0.97, a: 'noon', b: 'afternoon', t: 0.5 });
  assert.deepEqual(Object.keys(mid).sort(), ['ambient', 'bloom', 'lantern', 'light', 'skyLow', 'skyTop', 'spill']);
  assert.ok(Math.abs(mid.ambient - (a.ambient + b.ambient) / 2) < 1e-9);
  assert.ok(Math.abs(mid.skyTop[0] - (a.skyTop[0] + b.skyTop[0]) / 2) < 1e-9);
  assert.deepEqual(look.tint({ light: 1, a: 'noon', b: 'afternoon', t: 0 }).skyTop, a.skyTop);
  assert.deepEqual(look.tint({ light: 1, a: 'noon', b: 'afternoon', t: 1 }).skyTop, b.skyTop);
  const real = look.tint(sample(0.3));
  assert.ok(real.skyTop.every(Number.isFinite));
});

test('CSS_VARS feed the stylesheet', () => {
  for (const k of ['--page', '--tag', '--tag-ink']) assert.match(look.CSS_VARS[k], /^rgba\(/, k);
});

test('a city label ink names a colour the look has', async () => {
  const { CITIES } = await import('../src/cities/index.js');
  for (const c of CITIES) for (const name of Object.values(c.label.inks)) assert.ok(name in look.PALETTE, `${c.id}: ${name}`);
});
