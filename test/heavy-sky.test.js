import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gloom, GLOOM_CLOUD, GLOOM_KIND, EMPTY, FLASH } from '../src/weather.js';
import { boltPath, BOLT_STEPS, cloudColour, lowSun } from '../src/skyweather.js';
import * as look from '../src/look/index.js';

const w = (kind, cloudCover = null) => ({ known: true, kind, cloudCover });

test('gloom: nothing for no reading, a clear sky or broken cloud', () => {
  assert.equal(gloom(EMPTY), 0);
  assert.equal(gloom(null), 0);
  assert.equal(gloom(w('clear', 0)), 0);
  assert.equal(gloom(w('cloud', 40)), 0);
  assert.equal(gloom(w('cloud', 55)), 0);
});

test('gloom: cloud weighs more with cover, up to GLOOM_CLOUD at a full overcast', () => {
  const a = gloom(w('cloud', 70));
  const b = gloom(w('cloud', 90));
  assert.ok(a > 0 && b > a && b < GLOOM_CLOUD);
  assert.equal(gloom(w('cloud', 100)), GLOOM_CLOUD);
});

test('gloom: rain, snow, fog and a storm carry their own weight, the storm the most', () => {
  for (const k of Object.keys(GLOOM_KIND)) assert.equal(gloom(w(k, 10)), GLOOM_KIND[k], k);
  assert.equal(gloom(w('storm')), 1);
  assert.ok(GLOOM_KIND.rain > GLOOM_CLOUD);
});

test('boltPath: null outside a storm code, the same bolt for a whole period, another the next', () => {
  assert.equal(boltPath(3, 1000), null);
  assert.equal(boltPath(95, NaN), null);
  const period = FLASH[95].periodMs;
  const a = boltPath(95, 5 * period + 10);
  const b = boltPath(95, 5 * period + period - 1);
  const c = boltPath(95, 6 * period + 10);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.points, c.points);
  assert.equal(a.points.length, BOLT_STEPS + 1);
  assert.equal(a.forks.length, 2);
  // it comes down from above the sky
  assert.ok(a.points[0][1] < 0);
  for (let i = 1; i < a.points.length; i++) assert.ok(a.points[i][1] > a.points[i - 1][1]);
});

test('boltPath: a strike point takes the bolt on every other period', () => {
  const period = FLASH[95].periodMs;
  const strike = [0.4, 0.2];
  const even = boltPath(95, 4 * period + 5, strike);
  const odd = boltPath(95, 5 * period + 5, strike);
  assert.equal(even.aimed, true);
  assert.deepEqual(even.points[BOLT_STEPS], strike);
  assert.equal(odd.aimed, false);
});

test('cloudColour: darker under a heavy sky and at night, warmer at a low sun', () => {
  const day = cloudColour(1);
  const heavy = cloudColour(1, 1);
  const night = cloudColour(0.1);
  assert.ok(heavy[0] < day[0] && night[0] < day[0]);
  const warm = cloudColour(1, 0, 1);
  assert.ok(warm[2] < day[2], 'less blue at a low sun');
  // a heavy sky has no warmth to give
  assert.deepEqual(cloudColour(1, 1, 1), heavy);
});

test('lowSun: 1 on the horizon, 0 at noon', () => {
  let best = 0;
  for (let p = 0; p < 1; p += 0.005) best = Math.max(best, lowSun(p));
  assert.ok(best > 0.9);
  assert.equal(lowSun(0.5), 0);
});

test('the look carries the heavy sky and the bolt', () => {
  for (const n of ['overcastSky', 'gloomWash', 'bolt']) assert.equal(typeof look[n], 'function', n);
  for (const n of ['overcastTop', 'overcastLow', 'gloom', 'cloudWarm', 'bolt']) assert.equal(look.PALETTE[n].length, 3, n);
  assert.ok(look.GLOOM_DRAIN > 0 && look.GLOOM_DRAIN <= 1);
  assert.ok(look.GLOOM_DIM > 0 && look.GLOOM_DIM < 0.5);
});
