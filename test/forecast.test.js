import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD, forecastPose, forecastExtent } from '../src/forecast.js';
import { liftCamera } from '../src/lift.js';

const jar = { x: 600, y: 300, w: 340, h: 440 };

test('wide: a column right of the jar', () => {
  const p = forecastPose(jar, false, 1);
  assert.equal(p.layout, 'column');
  assert.equal(p.rect.x, jar.x + jar.w + CARD.gap);
  assert.equal(p.rect.y, jar.y + jar.h / 2 - CARD.column.h / 2);
  assert.equal(p.alpha, 1);
});

test('tall: a row below the jar', () => {
  const p = forecastPose(jar, true, 1);
  assert.equal(p.layout, 'row');
  assert.equal(p.rect.y, jar.y + jar.h + 36);
  assert.equal(p.rect.x + p.rect.w / 2, jar.x + jar.w / 2);
});

test('half revealed lies between hidden and resting, alpha follows', () => {
  const full = forecastPose(jar, false, 1).rect;
  const half = forecastPose(jar, false, 0.5);
  const hiddenX = jar.x + jar.w - CARD.column.w;
  assert.equal(half.alpha, 0.5);
  assert.ok(half.rect.x > hiddenX && half.rect.x < full.x);
  const rowHalf = forecastPose(jar, true, 0.5).rect;
  assert.ok(rowHalf.y < forecastPose(jar, true, 1).rect.y);
});

test('no reveal, no card', () => {
  assert.equal(forecastPose(jar, false, 0), null);
  assert.equal(forecastPose(jar, true, -1), null);
});

test('the extent contains the jar and the resting card', () => {
  for (const portrait of [false, true]) {
    const e = forecastExtent(jar, portrait);
    const c = forecastPose(jar, portrait, 1).rect;
    for (const r of [jar, c]) {
      assert.ok(e.x <= r.x && e.y <= r.y && e.x + e.w >= r.x + r.w && e.y + e.h >= r.y + r.h);
    }
  }
});

const dview = { cx: 800, cy: 500, scale: 0.6, viewH: 960, viewW: 1280 };

test('liftCamera centres on the extent and keeps the scale when it fits', () => {
  const e = forecastExtent(jar, false);
  const a = liftCamera(1, jar, dview, e);
  const b = liftCamera(1, jar, dview);
  assert.equal(a.cx, e.x + e.w / 2);
  assert.equal(a.cy, e.y + e.h / 2);
  assert.equal(a.scale, b.scale);
  assert.deepEqual(liftCamera(0, jar, dview, e), { cx: dview.cx, cy: dview.cy, scale: dview.scale });
});

test('liftCamera shrinks when the extent is wider than the view allows', () => {
  const narrow = { ...dview, viewW: 500 };
  const e = forecastExtent(jar, false);
  assert.ok(liftCamera(1, jar, narrow, e).scale < liftCamera(1, jar, narrow).scale);
});

import { localDate } from '../src/placeclock.js';
test('localDate is the zone wall-clock date', () => {
  const t = Date.UTC(2026, 9, 18, 22, 30); // 00:30 on the 19th in Warsaw
  assert.equal(localDate(t, 'Europe/Warsaw'), '2026-10-19');
  assert.equal(localDate(t, 'UTC'), '2026-10-18');
  assert.equal(localDate(t, 'No/Such'), null);
});
