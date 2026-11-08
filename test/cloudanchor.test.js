import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudDrift, cloudTravel, nextCloudAnchor, NO_ANCHOR, CLOUD_DRIFT_MS, REDUCED_DRIFT } from '../src/weather.js';
import { cloudSpot } from '../src/skyweather.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const RECT = { x: 0, y: 0, w: 340, h: 400 };
const AT = 70000;
const PREV_ANCHOR = { sinceMs: 1000, carry: 0.3 };
const SWAPS = [
  ['windy to windy', [30, 270], [12, 90]],
  ['windy to calm', [30, 270], [0, 270]],
  ['calm to windy', [null, null], [20, 270]],
  ['east to west', [20, 90], [20, 270]],
];

test('cloudTravel: no anchor matches cloudDrift', () => {
  near(cloudTravel(30, 270, 123456), cloudDrift(30, 270, 123456), 1e-12);
  near(cloudTravel(30, 270, 123456, { reduced: true }), cloudDrift(30, 270, 123456, { reduced: true }), 1e-12);
  assert.deepEqual({ ...NO_ANCHOR }, { sinceMs: 0, carry: 0 });
});

test('cloudTravel: a calm wind holds the carry', () => {
  assert.equal(cloudTravel(0, 270, 5e5, { sinceMs: 1e5, carry: 2.5 }), 2.5);
  assert.equal(cloudTravel(null, null, 5e5, { sinceMs: 1e5, carry: 2.5 }), 2.5);
});

test('cloudTravel: grows from the anchor at the reading pace', () => {
  near(cloudTravel(40, 270, 190000, { sinceMs: 100000, carry: 1 }), 2);
});

test('cloudTravel: reduced motion scales the whole travel', () => {
  const a = { sinceMs: 1000, carry: 0.7 };
  const full = cloudTravel(30, 270, 80000, a);
  const slow = cloudTravel(30, 270, 80000, { ...a, reduced: true });
  assert.ok(full !== 0);
  near(slow, REDUCED_DRIFT * full, 1e-12);
});

test('cloudTravel: a non-finite clock is 0', () => {
  for (const t of [NaN, Infinity, undefined, null, '5']) assert.equal(cloudTravel(30, 270, t, { carry: 1 }), 0);
});

test('cloudTravel: junk anchor fields default to 0', () => {
  assert.equal(cloudTravel(30, 270, 50000, { sinceMs: NaN, carry: undefined }), cloudTravel(30, 270, 50000));
});

test('nextCloudAnchor: a first reading starts from the shared origin', () => {
  assert.deepEqual({ ...nextCloudAnchor(null, null, 500) }, { sinceMs: 0, carry: 0 });
  assert.deepEqual({ ...nextCloudAnchor(null, null, 99999999) }, { ...NO_ANCHOR });
});

test('nextCloudAnchor: position just before equals position just after a reading swap', () => {
  for (const [name, p, n] of SWAPS) {
    const prev = { windSpeed: p[0], windDir: p[1] };
    const before = cloudTravel(p[0], p[1], AT, PREV_ANCHOR);
    const anchor = nextCloudAnchor(prev, PREV_ANCHOR, AT);
    near(cloudTravel(n[0], n[1], AT, anchor), before, 1e-12);
    const later = cloudTravel(n[0], n[1], AT + 250, anchor);
    assert.ok(Math.abs(later - before) <= 250 / CLOUD_DRIFT_MS + 1e-12, name);
  }
});

test('nextCloudAnchor: chained swaps stay continuous', () => {
  let reading = { windSpeed: 30, windDir: 270 };
  let anchor = PREV_ANCHOR;
  let at = AT;
  for (const n of [[12, 90], [0, 0], [25, 270]]) {
    const before = cloudTravel(reading.windSpeed, reading.windDir, at, anchor);
    anchor = nextCloudAnchor(reading, anchor, at);
    reading = { windSpeed: n[0], windDir: n[1] };
    near(cloudTravel(n[0], n[1], at, anchor), before, 1e-12);
    at += 400000;
  }
});

test('nextCloudAnchor: reduced motion keeps the swap continuous', () => {
  for (const [, p, n] of SWAPS) {
    const prev = { windSpeed: p[0], windDir: p[1] };
    const before = cloudTravel(p[0], p[1], AT, { ...PREV_ANCHOR, reduced: true });
    const anchor = nextCloudAnchor(prev, PREV_ANCHOR, AT);
    near(cloudTravel(n[0], n[1], AT, { ...anchor, reduced: true }), before, 1e-12);
  }
});

test('cloudSpot: a cloud spot is unchanged by a reading swap', () => {
  const prev = { windSpeed: 30, windDir: 270 };
  const before = cloudTravel(30, 270, AT, PREV_ANCHOR);
  const anchor = nextCloudAnchor(prev, PREV_ANCHOR, AT);
  const after = cloudTravel(12, 90, AT, anchor);
  for (let i = 0; i < 7; i++) {
    const a = cloudSpot(i, RECT, AT, before);
    const b = cloudSpot(i, RECT, AT, after);
    near(a.cx, b.cx, 1e-6);
    assert.equal(a.cy, b.cy);
    assert.equal(a.r, b.r);
  }
});

test('nextCloudAnchor: never reads a clock', () => {
  const prev = { windSpeed: 30, windDir: 270 };
  assert.deepEqual(nextCloudAnchor(prev, PREV_ANCHOR, AT), nextCloudAnchor(prev, PREV_ANCHOR, AT));
});
