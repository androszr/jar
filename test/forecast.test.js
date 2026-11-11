import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD, forecastPose, forecastExtent, liftExtent } from '../src/forecast.js';
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

test('liftExtent contains forecastExtent and is exactly scrubBand taller, in both layouts', () => {
  for (const portrait of [false, true]) {
    const a = forecastExtent(jar, portrait);
    const b = liftExtent(jar, portrait);
    assert.deepEqual({ x: b.x, y: b.y, w: b.w }, { x: a.x, y: a.y, w: a.w });
    assert.equal(b.h, a.h + CARD.scrubBand);
    assert.ok(b.y + b.h >= a.y + a.h);
  }
});

test('liftCamera with the taller extent never scales larger than with the plain one', () => {
  const rect = jar;
  for (const [W, H, portrait] of [[1280, 800, false], [390, 844, true], [844, 390, false]]) {
    const dview = { cx: 800, cy: 500, scale: 0.8, viewW: W, viewH: H };
    const plain = liftCamera(1, rect, dview, forecastExtent(jar, portrait));
    const tall = liftCamera(1, rect, dview, liftExtent(jar, portrait));
    assert.ok(tall.scale <= plain.scale + 1e-9, `${W}x${H}`);
  }
});

test('the row card, resting under a jar whose foot is on the table, ends inside the scene', () => {
  const foot = 710;
  const onTable = { x: 600, y: foot - 440, w: 340, h: 440 };
  const { rect } = forecastPose(onTable, true, 1);
  assert.ok(rect.y + rect.h < 1000, `ends at ${rect.y + rect.h}`);
  assert.equal(rect.h, 250);
});

test('the resting cards stay in the scene: row bottom above 1000, column within the jar', () => {
  const foot = { x: 600, y: 270, w: 340, h: 440 };
  const row = forecastPose(foot, true, 1).rect;
  assert.ok(row.y + row.h < 1000, `row bottom ${row.y + row.h}`);
  const col = forecastPose(foot, false, 1).rect;
  assert.ok(col.y >= foot.y && col.y + col.h <= foot.y + foot.h);
});

// ---- room for the credit link ------------------------------------------------
import { liftTarget, CREDIT_MARGIN } from '../src/lift.js';

const screenTop = (t, ext, viewH) => viewH / 2 + (ext.y - t.cy) * t.scale;

test('liftCamera without a credit box is the plain camera', () => {
  const ext = liftExtent(jar, false);
  const plain = liftCamera(1, jar, dview, ext);
  const withNull = liftCamera(1, jar, { ...dview, credit: null, core: forecastExtent(jar, false) }, ext);
  assert.deepEqual(withNull, plain);
});

test('a credit the lifted picture does not reach leaves the camera exactly where it was', () => {
  const ext = liftExtent(jar, false);
  const view = { ...dview, credit: { left: 1090, bottom: 31 }, core: forecastExtent(jar, false), bottomReserve: 66 };
  const t = liftTarget(jar, { ...view, credit: { left: view.viewW + 100, bottom: 31 } }, ext);
  assert.deepEqual(t, liftTarget(jar, dview, ext));
});

test('a credit the picture would reach pushes it below the credit and above the slider row', () => {
  for (const [viewW, viewH, portrait] of [[1024, 768, false], [667, 375, false], [375, 667, true]]) {
    const ext = liftExtent(jar, portrait);
    const core = forecastExtent(jar, portrait);
    const credit = { left: viewW - 194, bottom: 31 };
    const view = { cx: 800, cy: 500, scale: 0.5, viewW, viewH, credit, core, bottomReserve: 66 };
    const t = liftTarget(jar, view, ext);
    assert.ok(screenTop(t, core, viewH) >= credit.bottom + CREDIT_MARGIN - 1e-6, `${viewW}x${viewH} top clears the credit`);
    assert.ok(screenTop(t, core, viewH) + core.h * t.scale <= viewH - 66 + 1e-6, `${viewW}x${viewH} bottom clears the slider row`);
    assert.ok(t.scale <= liftTarget(jar, { ...view, credit: null }, ext).scale + 1e-9, 'never larger than the plain camera');
    assert.equal(liftCamera(0, jar, view, ext).scale, view.scale);
  }
});
