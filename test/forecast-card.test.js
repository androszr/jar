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
  const rects = [];
  const target = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'texts') return texts;
      if (k === 'rects') return rects;
      if (k in t) return t[k];
      if (k === 'fillText') return (s, x, y) => { texts.push({ s, x, y }); };
      if (k === 'fillRect') return (...a) => { rects.push({ a, style: t.fillStyle }); };
      if (k === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const cells = (todayAt = -1) => Array.from({ length: 5 }, (_, i) => ({ day: 'SUN', kind: 'clear', high: '1°', low: '0°', today: i === todayAt }));
const RECT = (layout) => ({ x: 100, y: 50, w: CARD[layout].w, h: CARD[layout].h });

function paint(layout, cs, sun) {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random in a draw function'); };
  try {
    const ctx = fake();
    forecastCard(ctx, RECT(layout), cs, layout, sun);
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
    const stripY = r.y + r.h - CARD.strip[layout];
    const strip = ctx.texts.find((t) => t.s.includes('↑'));
    assert.ok(strip.y > stripY);
    for (const t of ctx.texts.filter((k) => k !== strip)) assert.ok(t.y < stripY, `${t.s} at ${t.y}`);
  });
}

test('today on cell 2 only: one band at the third cell', () => {
  const col = paint('column', cells(2), SUN);
  assert.equal(bands(col).length, 1);
  const rc = RECT('column');
  assert.equal(bands(col)[0].a[1], rc.y + ((rc.h - CARD.strip.column) / 5) * 2);
  const row = paint('row', cells(2), SUN);
  assert.equal(bands(row).length, 1);
  const rr = RECT('row');
  assert.equal(bands(row)[0].a[0], rr.x + (rr.w / 5) * 2);
});
