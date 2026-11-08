import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonAgeMs, moonPhase, moonGlow, SYNODIC_MS, REFERENCE_NEW_MOON_MS } from '../src/moon.js';
import { moonDisc, css, PALETTE, tint } from '../src/look/index.js';
import { drawWindowSky } from '../src/shed.js';
import { drawJarSky } from '../src/skyweather.js';
import { sample } from '../src/clock.js';

const T_FULL = Date.UTC(2026, 5, 29, 23, 30);
const T_DARK = Date.UTC(2026, 5, 15, 23, 30);

function recordingCtx() {
  const fills = [];
  const calls = [];
  const target = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'fills') return fills;
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      return (...a) => { calls.push([String(k), a]); return a; };
    },
    set(t, k, v) {
      if (k === 'fillStyle' && typeof v === 'string') fills.push(v);
      t[k] = v;
      return true;
    },
  });
}
const ellipses = (ctx) => ctx.calls.filter(([k]) => k === 'ellipse');
const arcs = (ctx) => ctx.calls.filter(([k]) => k === 'arc');

test('the reference moment is a new moon at fraction 0', () => {
  const m = moonPhase(REFERENCE_NEW_MOON_MS);
  assert.equal(m.name, 'new');
  assert.equal(m.fraction, 0);
  assert.ok(m.illumination < 1e-6);
});

test('almanac new moons are new', () => {
  const a = moonPhase(Date.UTC(2024, 3, 8, 18, 21));
  assert.equal(a.name, 'new');
  assert.ok(a.illumination < 0.01);
  assert.equal(moonPhase(Date.UTC(2025, 2, 29, 10, 58)).name, 'new');
});

test('almanac full moons are full', () => {
  for (const t of [Date.UTC(2024, 9, 17, 11, 26), Date.UTC(2025, 0, 13, 22, 27)]) {
    const m = moonPhase(t);
    assert.equal(m.name, 'full');
    assert.ok(m.illumination > 0.99);
  }
});

test('almanac quarters are quarters', () => {
  const first = moonPhase(Date.UTC(2024, 0, 18, 3, 53));
  assert.equal(first.name, 'first quarter');
  assert.ok(first.waxing);
  assert.ok(first.illumination > 0.4 && first.illumination < 0.6);
  const last = moonPhase(Date.UTC(2024, 0, 4, 3, 30));
  assert.equal(last.name, 'last quarter');
  assert.ok(!last.waxing);
  assert.ok(last.illumination > 0.4 && last.illumination < 0.6);
});

test('the age wraps for moments before the reference and repeats each month', () => {
  const before = moonAgeMs(Date.UTC(1999, 5, 1));
  assert.ok(before >= 0 && before < SYNODIC_MS);
  const a = Date.UTC(2026, 2, 3, 4);
  assert.ok(Math.abs(moonPhase(a).fraction - moonPhase(a + 3 * SYNODIC_MS).fraction) < 1e-9);
});

test('no moment draws a full moon; moonGlow is bounded', () => {
  for (const bad of [undefined, NaN]) {
    assert.deepEqual(moonPhase(bad), { fraction: 0.5, illumination: 1, waxing: false, name: 'full' });
  }
  assert.equal(moonGlow(0), 0.12);
  assert.equal(moonGlow(1), 1);
  assert.equal(moonGlow(2), 1);
});

test('moonDisc: the terminator width follows the phase', () => {
  const full = recordingCtx();
  moonDisc(full, 50, 50, 10, moonPhase(Date.UTC(2024, 9, 17, 11, 26)));
  assert.ok(Math.abs(ellipses(full)[0][1][2] - 10) < 0.1);
  const quarter = recordingCtx();
  moonDisc(quarter, 50, 50, 10, moonPhase(Date.UTC(2024, 0, 18, 3, 53)));
  assert.ok(ellipses(quarter)[0][1][2] < 2);
});

test('moonDisc: lit on the right while waxing, on the left while waning; new is a faint disc', () => {
  const waxing = recordingCtx();
  moonDisc(waxing, 0, 0, 10, { illumination: 0.2, waxing: true, name: 'waxing crescent' });
  assert.deepEqual(arcs(waxing)[0][1].slice(3, 5), [-Math.PI / 2, Math.PI / 2]);
  const waning = recordingCtx();
  moonDisc(waning, 0, 0, 10, { illumination: 0.2, waxing: false, name: 'waning crescent' });
  assert.deepEqual(arcs(waning)[0][1].slice(3, 5), [Math.PI / 2, Math.PI * 1.5]);
  const fresh = recordingCtx();
  moonDisc(fresh, 0, 0, 10, moonPhase(T_DARK));
  assert.equal(ellipses(fresh).length, 0);
  assert.deepEqual(fresh.fills, [css(PALETTE.moon, 0.08)]);
  const prefix = css(PALETTE.moon, 0).slice(0, 18);
  for (const c of [waxing, waning, fresh]) for (const f of c.fills) assert.ok(f.startsWith(prefix), f);
});

test('the window moon takes the phase from the moment, and a missing moment is a full moon', () => {
  const t = tint(sample(0.92));
  const at = (ms) => {
    const c = recordingCtx();
    drawWindowSky(c, t, 0.92, ms);
    return { ellipses: ellipses(c), calls: c.calls.map(([k, a]) => [k, a.filter((v) => typeof v === 'number')]) };
  };
  const full = at(T_FULL);
  assert.ok(Math.abs(full.ellipses[0][1][2] - 14) < 0.1);
  assert.notDeepEqual(full.calls, at(T_DARK).calls);
  const none = at(undefined);
  assert.ok(Math.abs(none.ellipses[0][1][2] - 14) < 1e-9);
  assert.equal(none.calls.length, full.calls.length);
});

test('the jar sky reports the moon it drew', () => {
  const rect = { x: 0, y: 0, w: 340, h: 396 };
  const weather = { known: true, kind: 'clear', cloudCover: 5 };
  const sky = (phase, ms) => drawJarSky(recordingCtx(), rect, phase, tint(sample(phase)), weather, ms, {});
  const full = sky(0.92, T_FULL).moon;
  assert.equal(full.name, 'full');
  assert.equal(sky(0.92, T_DARK).moon.name, 'new');
  assert.equal(sky(0.4, T_FULL).moon, null);
  assert.ok(full.x >= 0 && full.x <= 1 && full.y >= 0 && full.y <= 1);
});
