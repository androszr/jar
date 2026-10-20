import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windPush, windSlant, SLANT_MAX, cloudDrift, CLOUD_DRIFT_MS, REDUCED_DRIFT } from '../src/weather.js';
import { cloudSpot } from '../src/skyweather.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const RECT = { x: 0, y: 0, w: 340, h: 400 };

test('windPush: calm or missing wind is 0', () => {
  for (const [s, d] of [[null, null], [undefined, undefined], [0, 270], ['12', 270], [NaN, 270], [20, NaN], [-5, 270], [20, null]]) {
    assert.ok(Object.is(windPush(s, d), 0), `${s}/${d}`);
  }
  assert.ok(Object.is(windPush(20, 0), 0) || Math.abs(windPush(20, 0)) < 1e-12);
});

test('windPush: from 270 pushes east', () => near(windPush(20, 270), 0.5));
test('windPush: from 90 pushes west', () => near(windPush(20, 90), -0.5));
test('windPush: from 0 and 180 push nothing sideways', () => {
  assert.ok(Math.abs(windPush(30, 0)) < 1e-12);
  assert.ok(Math.abs(windPush(30, 180)) < 1e-12);
});
test('windPush: due north and south are exactly 0', () => {
  for (const d of [0, 180, 360]) assert.ok(Object.is(windPush(30, d), 0), String(d));
});
test('windPush: a gale is clamped', () => {
  assert.equal(windPush(120, 270), 1);
  assert.equal(windPush(120, 90), -1);
});
test('windPush: windSlant shares it', () => {
  assert.equal(windSlant(20, 270, 'rain'), windPush(20, 270) * SLANT_MAX.rain);
  assert.equal(windSlant(20, 90, 'snow'), windPush(20, 90) * SLANT_MAX.snow);
  assert.equal(windSlant(20, 270, 'cloud'), 0);
});

test('cloudDrift: calm or missing wind is 0', () => {
  for (const [s, d] of [[null, null], [undefined, undefined], [0, 270], [NaN, 90]]) {
    assert.ok(Object.is(cloudDrift(s, d, 1.8e12), 0));
  }
});
test('cloudDrift: one width per 90 s at full push', () => near(cloudDrift(40, 270, CLOUD_DRIFT_MS), 1));
test('cloudDrift: east wind drifts west', () => assert.ok(cloudDrift(20, 90, 60000) < 0));
test('cloudDrift: stronger wind drifts further', () => {
  assert.ok(cloudDrift(30, 270, 60000) > cloudDrift(15, 270, 60000));
});
test('cloudDrift: same inputs, same answer', () => {
  assert.equal(cloudDrift(30, 270, 123456), cloudDrift(30, 270, 123456));
});
test('cloudDrift: reduced motion slows, never stops', () => {
  const full = cloudDrift(30, 270, 50000);
  const soft = cloudDrift(30, 270, 50000, { reduced: true });
  assert.ok(soft !== 0);
  near(soft, full * REDUCED_DRIFT);
});
test('cloudDrift: a non-finite clock is 0', () => {
  assert.equal(cloudDrift(30, 270, NaN), 0);
  assert.equal(cloudDrift(30, 270, Infinity), 0);
});

test('cloudSpot: the wind term shifts a cloud by its share of the span', () => {
  const a = cloudSpot(0, RECT, 0, 0);
  const b = cloudSpot(0, RECT, 0, 0.25);
  const span = RECT.w + 4 * a.r;
  const d = (((b.cx - a.cx) % span) + span) % span;
  near(d, 0.25 * span, 1e-6);
});
test('cloudSpot: a cloud never wraps while any of it is inside the jar', () => {
  for (let i = 0; i < 7; i++) {
    let prev = cloudSpot(i, RECT, 0, 0.37);
    for (let t = 250; t <= 600000; t += 250) {
      const cur = cloudSpot(i, RECT, t, 0.37);
      if (Math.abs(cur.cx - prev.cx) > 5) {
        assert.ok(prev.cx - 1.6 * prev.r >= RECT.x + RECT.w || prev.cx + 1.8 * prev.r <= RECT.x, `cloud ${i} left edge at wrap`);
        assert.ok(cur.cx + 1.8 * cur.r <= RECT.x || cur.cx - 1.6 * cur.r >= RECT.x + RECT.w, `cloud ${i} arrival`);
      }
      prev = cur;
    }
  }
});
test('cloudSpot: the calm picture is a pure function of the clock', () => {
  assert.deepEqual(cloudSpot(3, RECT, 777000, 0), cloudSpot(3, RECT, 777000, 0));
  const a = cloudSpot(3, RECT, 0, 0);
  const b = cloudSpot(3, RECT, 900000, 0.6);
  assert.equal(a.cy, b.cy);
  assert.equal(a.r, b.r);
});
