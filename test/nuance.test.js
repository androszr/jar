import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windSlant, SLANT_MAX, flashIntensity, nextFlashPeak, FLASH, dewAmount, DEW_MS } from '../src/weather.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const sweep = (code, opts, step = 16) => {
  const out = [];
  for (let t = 0; t < FLASH[code].periodMs; t += step) out.push(flashIntensity(code, t, opts));
  return out;
};
const burstsSeen = (code) => {
  let n = 0;
  let prev = 0;
  for (const v of sweep(code, {}, 5)) {
    if (v > 0 && prev === 0) n += 1;
    prev = v;
  }
  return n;
};

test('windSlant: null wind is vertical', () => {
  assert.equal(windSlant(null, null, 'rain'), 0);
  assert.equal(windSlant(20, null, 'rain'), 0);
  assert.equal(windSlant(null, 270, 'rain'), 0);
});

test('windSlant: calm or non-finite wind is vertical', () => {
  assert.equal(windSlant(0, 270, 'rain'), 0);
  assert.equal(windSlant(NaN, 270, 'rain'), 0);
  assert.equal(windSlant(-5, 270, 'rain'), 0);
});

test('windSlant: a west wind (from 270) tilts rain east', () => {
  near(windSlant(20, 270, 'rain'), 0.25);
});

test('windSlant: an east wind (from 90) tilts rain west', () => {
  near(windSlant(20, 90, 'rain'), -0.25);
});

test('windSlant: a north or south wind does not tilt', () => {
  near(windSlant(30, 0, 'rain'), 0);
  near(windSlant(30, 180, 'rain'), 0);
});

test('windSlant: a gale is clamped to the maximum lean', () => {
  near(windSlant(120, 270, 'rain'), SLANT_MAX.rain);
  near(windSlant(120, 90, 'rain'), -SLANT_MAX.rain);
});

test('windSlant: snow leans further than rain for the same wind', () => {
  assert.ok(windSlant(20, 270, 'snow') > windSlant(20, 270, 'rain'));
  assert.ok(windSlant(20, 270, 'drizzle') < windSlant(20, 270, 'rain'));
});

test('windSlant: kinds that do not fall, and unknown kinds, give 0; a storm falls like rain', () => {
  for (const k of ['clear', 'cloud', 'fog', 'nonsense']) assert.equal(windSlant(20, 270, k), 0, k);
  near(windSlant(20, 270, 'storm'), windSlant(20, 270, 'rain'));
});

test('flashIntensity: no lightning outside a thunderstorm', () => {
  for (const code of [61, 0, 45, null]) {
    for (let t = 0; t < 14000; t += 100) assert.equal(flashIntensity(code, t), 0, `${code}@${t}`);
  }
});

test('flashIntensity: a thunderstorm flashes somewhere in its period', () => {
  assert.ok(Math.max(...sweep(95, {}, 5)) > 0);
});

test('flashIntensity: 99 has more bursts than 95', () => {
  assert.ok(burstsSeen(99) > burstsSeen(95));
});

test('flashIntensity: hail flashes more often than a plain storm', () => {
  assert.ok(FLASH[99].periodMs < FLASH[95].periodMs);
  const perMinute = (code) => burstsSeen(code) * (60000 / FLASH[code].periodMs);
  assert.ok(perMinute(99) > perMinute(95));
});

test('flashIntensity: the same moment gives the same value twice', () => {
  for (const t of [0, 1680, 1700, 123456789]) {
    assert.equal(flashIntensity(95, t), flashIntensity(95, t));
    assert.equal(flashIntensity(95, t, { reduced: true }), flashIntensity(95, t, { reduced: true }));
  }
});

test('flashIntensity: periodic in the period', () => {
  for (const code of [95, 99]) {
    for (const t of [10, 1690, 3000, 5000]) {
      near(flashIntensity(code, t), flashIntensity(code, t + FLASH[code].periodMs));
      near(flashIntensity(code, t, { reduced: true }), flashIntensity(code, t + FLASH[code].periodMs, { reduced: true }));
    }
  }
});

test('flashIntensity: sharp mode reaches full strength', () => {
  assert.ok(Math.max(...sweep(95, {}, 1)) >= 0.99);
  assert.ok(Math.max(...sweep(99, {}, 1)) >= 0.99);
});

test('flashIntensity: reduced motion never exceeds 0.5 and never jumps between frames', () => {
  for (const code of [95, 99]) {
    const v = sweep(code, { reduced: true }, 16);
    assert.ok(Math.max(...v) <= 0.5);
    assert.ok(Math.max(...v) > 0);
    let step = Math.abs(v[0] - v[v.length - 1]);
    for (let i = 1; i < v.length; i++) step = Math.max(step, Math.abs(v[i] - v[i - 1]));
    assert.ok(step <= 0.01, `${code}: step ${step}`);
  }
});

test('flashIntensity: codes 97 and 98 follow the plain storm', () => {
  for (const t of [1680, 1700, 9940]) assert.equal(flashIntensity(97, t), flashIntensity(95, t));
});

test('nextFlashPeak: is at or after the start and is a full flash', () => {
  for (const code of [95, 99]) {
    for (const from of [0, 1, 1680, 1681, 50000, 123456789]) {
      const p = nextFlashPeak(code, from);
      assert.ok(p >= from, `${code} from ${from}`);
      assert.ok(flashIntensity(code, p) >= 0.99, `${code} at ${p}`);
    }
  }
});

test('nextFlashPeak: is the first such moment, and null for a non-storm', () => {
  const p = nextFlashPeak(95, 5000);
  assert.ok(p - 5000 < FLASH[95].periodMs);
  assert.equal(nextFlashPeak(61, 0), null);
});

test('dewAmount: nothing for null, negative or no fog yet', () => {
  assert.equal(dewAmount(null), 0);
  assert.equal(dewAmount(-1), 0);
});

test('dewAmount: full the moment fog clears', () => {
  assert.equal(dewAmount(0), 1);
});

test('dewAmount: half gone halfway', () => {
  near(dewAmount(DEW_MS / 2), 0.5);
});

test('dewAmount: gone at forty-five minutes and after', () => {
  assert.equal(DEW_MS, 45 * 60 * 1000);
  assert.equal(dewAmount(DEW_MS), 0);
  assert.equal(dewAmount(DEW_MS * 3), 0);
});

test('dewAmount: only ever fades', () => {
  let prev = 1;
  for (let m = 0; m < 45; m++) {
    const v = dewAmount(m * 60000);
    assert.ok(v <= prev);
    prev = v;
  }
});
