import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastCard } from '../src/look/index.js';
import { PALETTE, css } from '../src/look/lantern/palette.js';
import { CARD } from '../src/forecast.js';

const BAND = css(PALETTE.brass, 0.12);
const MARK = css(PALETTE.labelInk, 0.9);
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
      if (k === 'fillText') return (s, x, y) => { texts.push({ s, x, y, font: t.font, size: Number(/(\d+(?:\.\d+)?)px/.exec(t.font || '')?.[1]) }); };
      if (k === 'fillRect') return (...a) => { rects.push({ a, style: t.fillStyle }); };
      if (k === 'fill') return () => { calls.push(['fill', [], t.fillStyle]); };
      if (k === 'stroke') return () => { calls.push(['stroke', [], t.strokeStyle]); };
      if (k === 'moveTo' || k === 'lineTo') return (...a) => { calls.push([k, a]); };
      if (k === 'ellipse' || k === 'arc') return (...a) => { calls.push([k, a]); };
      if (k === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const cells = (todayAt = -1) => Array.from({ length: 5 }, (_, i) => ({ day: 'SUN', kind: 'clear', high: '1°', low: '0°', today: i === todayAt }));
const RECT = (layout) => ({ x: 100, y: 50, w: CARD[layout].w, h: CARD[layout].h });

function paint(layout, cs, sun, sunT = null, tides = [], dayT = null) {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random in a draw function'); };
  try {
    const ctx = fake();
    forecastCard(ctx, RECT(layout), cs, layout, sun, sunT, tides, dayT);
    return ctx;
  } finally {
    Math.random = real;
  }
}

const bands = (ctx) => ctx.rects.filter((r) => r.style === BAND);
const marks = (ctx) => ctx.rects.filter((r) => r.style === MARK);

test('no sun and no today: no strip, no band', () => {
  const ctx = paint('column', cells(), null);
  assert.ok(!ctx.texts.some((t) => t.s.includes('↑')));
  assert.equal(bands(ctx).length, 0);
  assert.equal(marks(ctx).length, 0);
});

for (const layout of ['column', 'row']) {
  test(`${layout}: today band and sun strip appear`, () => {
    const ctx = paint(layout, cells(0), SUN);
    assert.equal(bands(ctx).length, 1);
    assert.equal(marks(ctx).length, 1);
    assert.ok(ctx.texts.some((t) => t.s === '↑ 07:05  ↓ 17:32'));
  });

  test(`${layout}: cells stay above the strip`, () => {
    const ctx = paint(layout, cells(0), SUN);
    const r = RECT(layout);
    const stripY = r.y + r.h - CARD.arc[layout] - CARD.strip[layout];
    const strip = ctx.texts.find((t) => t.s.includes('↑'));
    assert.ok(strip.y > stripY);
    for (const t of ctx.texts.filter((k) => k !== strip)) assert.ok(t.y < stripY, `${t.s} at ${t.y}`);
    for (const m of marks(ctx)) assert.ok(m.a[1] + m.a[3] < stripY);
  });
}

test('today on cell 2 only: one band at the third cell', () => {
  const col = paint('column', cells(2), SUN);
  assert.equal(bands(col).length, 1);
  const rc = RECT('column');
  const rh = (rc.h - CARD.arc.column - CARD.strip.column) / 5;
  assert.equal(bands(col)[0].a[1], rc.y + rh * 2);
  assert.equal(marks(col).length, 1);
  assert.ok(marks(col)[0].a[1] >= rc.y + rh * 2 && marks(col)[0].a[1] < rc.y + rh * 3);
  const row = paint('row', cells(2), SUN);
  assert.equal(bands(row).length, 1);
  const rr = RECT('row');
  assert.equal(bands(row)[0].a[0], rr.x + (rr.w / 5) * 2);
  const m = marks(row)[0];
  assert.ok(Math.abs(m.a[0] + m.a[2] / 2 - (rr.x + (rr.w / 5) * 2.5)) < 1e-6);
  assert.ok(m.a[1] < rr.y + (rr.h - CARD.strip.row) * 0.43);
});

test('today mark is drawn without a sun strip too', () => {
  for (const layout of ['row', 'column']) {
    const ctx = paint(layout, cells(0), null);
    assert.equal(marks(ctx).length, 1);
    assert.equal(bands(ctx).length, 1);
  }
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
    assert.ok(!ctx.texts.some((t) => /%$/.test(t.s) || /km\/h/.test(t.s)), 'and no rain or wind without them');
    const day = ctx.texts.find((t) => t.s === 'SUN');
    assert.ok(day.y > r.y && day.y < r.y + r.h / 2);
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

for (const layout of ['row', 'column']) {
  test(`${layout} card with swell still underlines today, clear of the wave figure`, () => {
    const cs = cells(1).map((c, i) => ({ ...c, swell: { height: '2.4 m', period: '12 s' }, day: i === 1 ? 'MON' : 'SUN' }));
    const ctx = paint(layout, cs, SUN);
    assert.equal(marks(ctx).length, 1);
    const m = marks(ctx)[0];
    const day = ctx.texts.find((t) => t.s === 'MON');
    const wave = ctx.texts.filter((t) => t.s === '2.4 m');
    assert.ok(m.a[1] > day.y, 'the underline sits below the day name');
    const r = RECT(layout);
    const h = r.h - CARD.strip[layout] - CARD.arc[layout];
    // The wave figure in the same cell as MON, and half its text size (row: h*0.12, column: rh*0.2).
    const wv = layout === 'row' ? wave[1] : wave.find((t) => t.y > day.y && t.y < day.y + h / 5);
    const half = layout === 'row' ? h * 0.06 : (h / 5) * 0.1;
    assert.ok(m.a[1] + m.a[3] < wv.y - half, `the underline (${m.a[1]}+${m.a[3]}) ends above the wave figure at ${wv.y}`);
  });
}

// ---- rain, wind and tides ---------------------------------------------------
const TIDES = [{ time: '03:12', kind: 'high' }, { time: '09:25', kind: 'low' }, { time: '15:37', kind: 'high' }, { time: '21:50', kind: 'low' }];
const HTIDES = TIDES.map((t, i) => ({ ...t, height: [3.14, 0.4, 3.3, 0.62][i] }));
const fullCells = () => cells(0).map((c, i) => ({ ...c, swell: { height: '2.4 m', period: '12 s' }, rain: `${40 + i}%`, wind: `${20 + i} km/h`, windArrow: '↘', windFrom: 'north-west' }));
const rainTexts = (ctx) => ctx.texts.filter((t) => /^\d+%$/.test(t.s));
const windTexts = (ctx) => ctx.texts.filter((t) => /km\/h/.test(t.s));

for (const layout of ['row', 'column']) {
  test(`${layout} card prints rain and wind once per cell`, () => {
    const ctx = paint(layout, fullCells(), SUN, 0.5, TIDES);
    assert.equal(rainTexts(ctx).length, 5);
    assert.equal(windTexts(ctx).length, 5);
    assert.ok(windTexts(ctx).every((t) => t.s.endsWith('↘')));
  });

  test(`${layout} card prints no rain or wind for a null figure, and no arrow without a direction`, () => {
    const cs = fullCells().map((c, i) => (i === 1 ? { ...c, rain: null, wind: null, windArrow: null, windFrom: null } : i === 2 ? { ...c, windArrow: null, windFrom: null } : c));
    const ctx = paint(layout, cs, SUN, 0.5, TIDES);
    assert.equal(rainTexts(ctx).length, 4);
    assert.equal(windTexts(ctx).length, 4);
    assert.ok(windTexts(ctx).some((t) => t.s === (layout === 'row' ? '22km/h' : '22 km/h')));
  });

  test(`${layout} card prints the tide strip with tides and nothing without`, () => {
    const withT = paint(layout, fullCells(), SUN, 0.5, TIDES);
    assert.ok(withT.texts.some((t) => t.s.startsWith('tide')));
    // Row: one line per kind; column: one line per extreme.
    for (const [arrow, times] of [['↑', ['03:12', '15:37']], ['↓', ['09:25', '21:50']]]) {
      for (const tm of times) assert.ok(withT.texts.some((t) => t.s.includes(arrow) && t.s.includes(tm)), `${arrow} ${tm}`);
    }
    const none = paint(layout, fullCells(), SUN, 0.5, []);
    assert.ok(!none.texts.some((t) => t.s.includes('tide')));
    assert.ok(!none.texts.some((t) => t.s.includes('03:12')));
    const noSun = paint(layout, fullCells(), null, null, []);
    assert.ok(!noSun.texts.some((t) => t.s.includes('tide')));
  });
}

test('row card: two tide lines with heights; column card: one line per extreme', () => {
  const row = paint('row', fullCells(), SUN, 0.5, HTIDES);
  assert.ok(row.texts.some((t) => t.s.startsWith('tide ↑ 03:12 3.1 m')));
  assert.ok(row.texts.some((t) => t.s.includes('↓ 09:25 0.4 m')));
  const col = paint('column', fullCells(), SUN, 0.5, HTIDES);
  const lines = col.texts.filter((t) => /^(tide| +[↑↓])/.test(t.s));
  assert.equal(lines.length, 4);
  assert.ok(lines[0].s.startsWith('tide ↑ 03:12 3.1 m'));
  assert.ok(lines[1].s.includes('↓ 09:25 0.4 m'));
});

test('row card: a lows-only day prints "tide" once, with the arrow', () => {
  const lows = HTIDES.filter((t) => t.kind === 'low');
  const row = paint('row', fullCells(), SUN, 0.5, lows);
  assert.equal(row.texts.filter((t) => /^tide/.test(t.s)).length, 1);
  assert.ok(row.texts.some((t) => t.s === 'tide ↑'));
  assert.ok(row.texts.some((t) => /^ {5}↓ 09:25 0\.4 m/.test(t.s)));
});

test('tides without heights print the times only and add no curve', () => {
  for (const layout of ['row', 'column']) {
    const bare = paint(layout, fullCells(), SUN, 0.5, TIDES, 0.5);
    assert.ok(bare.texts.some((t) => t.s.includes('03:12') && !t.s.includes(' m')), layout);
    assert.ok(!bare.texts.some((t) => / m$/.test(t.s) && t.s.includes(':')), layout);
    const withH = paint(layout, fullCells(), SUN, 0.5, HTIDES, 0.5);
    const lt = (c) => c.calls.filter((k) => k[0] === 'lineTo').length;
    assert.equal(lt(withH) - lt(bare), 47, `${layout}: curve adds 47 lineTo`);
  }
});

for (const layout of ['row', 'column']) {
  test(`${layout} tide curve: inside its box, dot only with dayT, arc below it`, () => {
    const r = RECT(layout);
    const a = paint(layout, fullCells(), SUN, 0.5, HTIDES, null);
    const b = paint(layout, fullCells(), SUN, 0.5, HTIDES, 0.5);
    const dots = (c) => c.calls.filter((k) => k[0] === 'arc').length;
    assert.equal(dots(b) - dots(a), 1);
    const curve = b.calls.filter((k) => k[0] === 'lineTo').slice(-47);
    assert.equal(curve.length, 47);
    const xs = curve.map((k) => k[1][0]);
    const ys = curve.map((k) => k[1][1]);
    // The layout's curve box: row right of the text, column under it.
    const bx = layout === 'row' ? [r.x + r.w * 0.72, r.x + r.w * 0.96] : [r.x + r.w * 0.1, r.x + r.w * 0.9];
    assert.ok(Math.min(...xs) >= bx[0] - 1e-6 && Math.max(...xs) <= bx[1] + 1e-6, `x within ${bx}`);
    const k = layout;
    const tyTop = r.y + r.h - CARD.strip[k] - CARD.arc[k] - CARD.tide[k] - CARD.curve[k] + CARD.strip[k];
    const by = layout === 'row' ? [tyTop + 4, tyTop + CARD.tide[k] - 4] : [tyTop + CARD.tide[k] + 4, tyTop + CARD.tide[k] + CARD.curve[k] - 4];
    assert.ok(Math.min(...ys) >= by[0] - 1e-6 && Math.max(...ys) <= by[1] + 1e-6, `y within ${by}`);
    const ell = b.calls.find((k) => k[0] === 'ellipse');
    if (layout === 'column') assert.ok(ell[1][1] > Math.max(...ys), 'sun arc below the curve');
    assert.ok(Math.max(...ys) <= r.y + r.h);
  });
}

test('the arc sits below the tide strip', () => {
  for (const layout of ['row', 'column']) {
    const r = RECT(layout);
    const ctx = paint(layout, fullCells(), SUN, 0.5, TIDES);
    const tideY = ctx.texts.filter((t) => /^(tide|↓)/.test(t.s)).map((t) => t.y);
    assert.ok(tideY.length >= 1);
    const arc = arcOf(ctx)[0];
    assert.ok(arc[1][1] > Math.max(...tideY), `${layout}: arc baseline ${arc[1][1]} below the tide text`);
    assert.ok(arc[1][1] <= r.y + r.h);
  }
});

for (const layout of ['row', 'column']) {
  test(`${layout} card legibility: no text under the floor, no two lines of a cell touching`, () => {
    const floor = layout === 'row' ? 12.5 : 12;
    const ctx = paint(layout, fullCells(), SUN, 0.5, HTIDES, 0.5);
    for (const t of ctx.texts) assert.ok(t.size >= floor, `${t.s} is ${t.size}px`);
    const byX = new Map();
    for (const t of ctx.texts) byX.set(t.x, [...(byX.get(t.x) || []), t]);
    for (const [x, group] of byX) {
      const sorted = [...group].sort((a, b) => a.y - b.y);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].y - sorted[i - 1].y;
        const need = 0.9 * Math.max(sorted[i].size, sorted[i - 1].size);
        assert.ok(gap >= need, `x=${x}: ${sorted[i - 1].s} / ${sorted[i].s} only ${gap}px apart, need ${need}`);
      }
    }
  });
}

test('every card paints with no rain, wind or tides at all (weather is optional)', () => {
  for (const layout of ['row', 'column']) {
    const ctx = paint(layout, cells(0), SUN, 0.5, []);
    assert.equal(rainTexts(ctx).length, 0);
    assert.equal(windTexts(ctx).length, 0);
  }
});

for (const layout of ['row', 'column']) {
  test(`${layout} card prints the tide text with tides and no sun times`, () => {
    const ctx = paint(layout, fullCells(), null, null, TIDES);
    assert.ok(ctx.texts.some((t) => t.s.startsWith('tide')));
    assert.ok(ctx.texts.some((t) => t.s.includes('↓') && t.s.includes('21:50')));
    assert.ok(!ctx.texts.some((t) => t.s.includes('07:05')));
    const r = RECT(layout);
    for (const t of ctx.texts) assert.ok(t.y < r.y + r.h, `${t.s} inside the card`);
    for (const t of ctx.texts) assert.ok(t.size >= (layout === 'row' ? 12.5 : 12), `${t.s} ${t.size}px`);
  });
}
