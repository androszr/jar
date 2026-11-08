import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastCard } from '../src/look/index.js';
import { PALETTE, css } from '../src/look/lantern/palette.js';
import { CARD } from '../src/forecast.js';

const BAND = css(PALETTE.brass, 0.12);
const SUN = { sunrise: '07:05', sunset: '17:32' };

// A 2D context that records fillText strings (with y) and fillRect calls with the fillStyle at the time.
function fake() {
  const texts = [];
  const calls = [];
  const rects = [];
  const target = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'texts') return texts;
      if (k === 'rects') return rects;
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'fillText') return (s, x, y) => { texts.push({ s, x, y }); };
      if (k === 'fillRect') return (...a) => { rects.push({ a, style: t.fillStyle }); };
      if (k === 'fill') return () => { calls.push(['fill', [], t.fillStyle]); };
      if (k === 'stroke') return () => { calls.push(['stroke', [], t.strokeStyle]); };
      if (k === 'ellipse' || k === 'arc') return (...a) => { calls.push([k, a]); };
      if (k === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const cells = (todayAt = -1) => Array.from({ length: 5 }, (_, i) => ({ day: 'SUN', kind: 'clear', high: '1°', low: '0°', today: i === todayAt }));
const RECT = (layout) => ({ x: 100, y: 50, w: CARD[layout].w, h: CARD[layout].h });

function paint(layout, cs, sun, sunT = null) {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random in a draw function'); };
  try {
    const ctx = fake();
    forecastCard(ctx, RECT(layout), cs, layout, sun, sunT);
    return ctx;
  } finally {
    Math.random = real;
  }
}

const bands = (ctx) => ctx.rects.filter((r) => r.style === BAND);

test('no sun and no today: no strip, no band', () => {
  const ctx = paint('column', cells(), null);
  assert.ok(!ctx.texts.some((t) => t.s.includes('↑')));
  assert.equal(bands(ctx).length, 0);
});

for (const layout of ['column', 'row']) {
  test(`${layout}: today band and sun strip appear`, () => {
    const ctx = paint(layout, cells(0), SUN);
    assert.equal(bands(ctx).length, 1);
    assert.ok(ctx.texts.some((t) => t.s === '↑ 07:05  ↓ 17:32'));
  });

  test(`${layout}: cells stay above the strip`, () => {
    const ctx = paint(layout, cells(0), SUN);
    const r = RECT(layout);
    const stripY = r.y + r.h - CARD.arc[layout] - CARD.strip[layout];
    const strip = ctx.texts.find((t) => t.s.includes('↑'));
    assert.ok(strip.y > stripY);
    for (const t of ctx.texts.filter((k) => k !== strip)) assert.ok(t.y < stripY, `${t.s} at ${t.y}`);
  });
}

test('today on cell 2 only: one band at the third cell', () => {
  const col = paint('column', cells(2), SUN);
  assert.equal(bands(col).length, 1);
  const rc = RECT('column');
  assert.equal(bands(col)[0].a[1], rc.y + ((rc.h - CARD.arc.column - CARD.strip.column) / 5) * 2);
  const row = paint('row', cells(2), SUN);
  assert.equal(bands(row).length, 1);
  const rr = RECT('row');
  assert.equal(bands(row)[0].a[0], rr.x + (rr.w / 5) * 2);
});

const swellCells = () => cells().map((c, i) => ({ ...c, swell: i === 2 ? null : { height: '2.4 m', period: '12 s' } }));

for (const layout of ['row', 'column']) {
  test(`${layout} card with swell prints a height per cell, a dash for a gap, above the strip`, () => {
    const ctx = paint(layout, swellCells(), SUN);
    const r = RECT(layout);
    const stripTop = r.y + r.h - CARD.strip[layout] - CARD.arc[layout];
    const heights = ctx.texts.filter((t) => t.s === '2.4 m');
    assert.equal(heights.length, 4);
    assert.ok(heights.every((t) => t.y < stripTop));
    assert.equal(ctx.texts.filter((t) => t.s === '—').length, 1);
  });

  test(`${layout} card without swell prints no wave figure`, () => {
    const ctx = paint(layout, cells(), SUN);
    assert.ok(!ctx.texts.some((t) => / m$/.test(t.s)));
    const r = RECT(layout);
    const h = r.h - CARD.strip[layout] - CARD.arc[layout];
    const day = ctx.texts.find((t) => t.s === 'SUN');
    assert.equal(day.y, layout === 'row' ? r.y + h * 0.14 : r.y + (h / 5) * 0.5);
  });
}

// The sun arc. Fog cells draw no ellipse and no sun-coloured fill of their own.
const FOG = Array.from({ length: 5 }, () => ({ day: 'SUN', kind: 'fog', high: '1°', low: '0°', today: false }));
const SUNC = css(PALETTE.sun);
const arcOf = (c) => c.calls.filter((k) => k[0] === 'ellipse');
const dots = (c) => c.calls.filter((k) => k[0] === 'fill' && k[2] === SUNC);
const dotXY = (c) => {
  const i = c.calls.findIndex((k) => k[0] === 'fill' && k[2] === SUNC);
  return c.calls.slice(0, i).reverse().find((k) => k[0] === 'arc')[1];
};
const strokeStyles = (c) => new Set(c.calls.filter((k) => k[0] === 'stroke').map((k) => k[2]));

test('arc: a bright arc and one dot at the apex at sunT 0.5', () => {
  const ctx = paint('column', FOG, SUN, 0.5);
  const r = RECT('column');
  assert.equal(arcOf(ctx).length, 1);
  assert.ok(strokeStyles(ctx).has(css(PALETTE.brass, 0.55)));
  assert.equal(dots(ctx).length, 1);
  const [dx, dy] = dotXY(ctx);
  assert.ok(Math.abs(dx - (r.x + r.w / 2)) < 0.5);
  assert.ok(dy >= r.y + r.h - CARD.arc.column && dy <= r.y + r.h);
});

test('arc: the dot sits at the arc ends at sunT 0 and 1', () => {
  const r = RECT('column');
  assert.ok(Math.abs(dotXY(paint('column', FOG, SUN, 0))[0] - (r.x + r.w * 0.08)) < 0.5);
  assert.ok(Math.abs(dotXY(paint('column', FOG, SUN, 1))[0] - (r.x + r.w * 0.92)) < 0.5);
});

test('arc: dim and dotless at night or when unknown', () => {
  for (const t of [-0.1, 1.04, null]) {
    const ctx = paint('column', FOG, SUN, t);
    assert.equal(arcOf(ctx).length, 1);
    assert.ok(strokeStyles(ctx).has(css(PALETTE.brass, 0.3)));
    assert.ok(!strokeStyles(ctx).has(css(PALETTE.brass, 0.55)));
    assert.equal(dots(ctx).length, 0);
  }
});

test('arc: no sun times, no arc and no dot', () => {
  const ctx = paint('column', FOG, null, 0.5);
  assert.equal(arcOf(ctx).length, 0);
  assert.equal(dots(ctx).length, 0);
});

test('arc: the row layout carries it below the cells and the strip', () => {
  const ctx = paint('row', FOG, SUN, 0.25);
  const r = RECT('row');
  assert.equal(arcOf(ctx).length, 1);
  assert.equal(dots(ctx).length, 1);
  const [dx, dy] = dotXY(ctx);
  assert.ok(dx < r.x + r.w / 2);
  assert.ok(dy >= r.y + r.h - CARD.arc.row && dy <= r.y + r.h);
  assert.ok(ctx.texts.every((t) => t.y < r.y + r.h - CARD.arc.row));
});
