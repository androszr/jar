import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShedArt, drawShed } from '../src/shed.js';
import { sample } from '../src/clock.js';
import {
  PALETTE, css, mix, tint, vignette, VIGNETTE, SHELF_VESSELS, contactShadow, reflection,
} from '../src/look/index.js';

// A recording canvas context: every call, every fillStyle string and every
// gradient with its colour stops.
function recordingCtx() {
  const fills = [];
  const calls = [];
  const gradients = [];
  const ops = [];
  const target = {
    createLinearGradient: (...a) => {
      const g = { kind: 'linear', args: a, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } };
      gradients.push(g);
      return g;
    },
    createRadialGradient: (...a) => {
      const g = { kind: 'radial', args: a, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } };
      gradients.push(g);
      return g;
    },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'fills') return fills;
      if (k === 'calls') return calls;
      if (k === 'gradients') return gradients;
      if (k === 'ops') return ops;
      if (k in t) return t[k];
      return (...a) => { calls.push([String(k), a]); return a; };
    },
    set(t, k, v) {
      if (k === 'fillStyle' && typeof v === 'string') fills.push(v);
      if (k === 'globalCompositeOperation') ops.push(v);
      t[k] = v;
      return true;
    },
  });
}

const NIGHT = 0.94;
const NOON = 0.5;
const build = (tn) => {
  const ctx = recordingCtx();
  buildShedArt(1600, 1000, tn, () => ({ width: 1600, height: 1000, getContext: () => ctx }));
  return ctx;
};
const tintAt = (p) => tint(sample(p));
const stopsOf = (ctx) => ctx.gradients.flatMap((g) => g.stops.map(([, c]) => c));
const idx = (ctx, name, pred = () => true) => ctx.calls.findIndex(([k, a]) => k === name && pred(a));

test('the lamp wash follows 0.07 + 0.13 * (1 - ambient)', () => {
  for (const p of [NIGHT, NOON]) {
    const tn = tintAt(p);
    const ctx = build(tn);
    assert.ok(stopsOf(ctx).includes(css(PALETTE.lamp, 0.07 + 0.13 * (1 - tn.ambient))), `lamp at ${p}`);
  }
  assert.ok(tintAt(NIGHT).ambient < tintAt(NOON).ambient);
});

test('the lamp is painted before the pane is cut', () => {
  const ctx = build(tintAt(NIGHT));
  const lamp = idx(ctx, 'fillRect', (a) => a[0] === -180 && a[1] === -890 && a[2] === 1960 && a[3] === 1960);
  const pane = idx(ctx, 'fillRect', (a) => a[0] === 200 && a[1] === 120 && a[2] === 400 && a[3] === 360);
  assert.ok(lamp >= 0 && pane >= 0 && lamp < pane);
});

test('the curtain is drawn', () => {
  const tn = tintAt(NIGHT);
  const ctx = build(tn);
  assert.ok(idx(ctx, 'roundRect', (a) => a[0] === 134 && a[1] === 80 && a[2] === 528 && a[3] === 6 && a[4] === 3) >= 0);
  assert.ok(idx(ctx, 'bezierCurveTo', (a) => a[0] === 306) >= 0);
  assert.ok(ctx.fills.includes(css(mix(PALETTE.linenDark, PALETTE.linenLight, 0.22 + 0.6 * tn.ambient), 0.96)));
});

test('the shelf is drawn from curves, with palette colours only', () => {
  const ctx = build(tintAt(NIGHT));
  assert.equal(ctx.calls.filter(([k]) => k === 'arc').length, 1);
  assert.ok(ctx.calls.filter(([k]) => k === 'quadraticCurveTo').length >= 10);
  assert.ok(ctx.calls.filter(([k]) => k === 'roundRect').length >= 7);
  assert.equal(SHELF_VESSELS.length, 5);
  for (const [x] of SHELF_VESSELS) assert.ok(x >= 980 && x < 1500, `vessel x ${x}`);
  for (const f of ctx.fills) assert.ok(f.startsWith('rgba('), f);
});

test('the table has a sheen', () => {
  const ctx = build(tintAt(NIGHT));
  const i = idx(ctx, 'translate', (a) => a[0] === 800 && a[1] === 770);
  assert.ok(i >= 0);
  assert.deepEqual(ctx.calls[i + 1], ['scale', [1, 150 / 820]]);
});

test('the seams are fainter', () => {
  const ctx = build(tintAt(NIGHT));
  assert.ok(ctx.fills.includes(css(PALETTE.seam, 0.26)));
  assert.ok(!ctx.fills.includes(css(PALETTE.seam, 0.5)));
});

test('the table front carries a lit lip', () => {
  const ctx = build(tintAt(NIGHT));
  const lip = css(mix(PALETTE.tableTop, PALETTE.lamp, 0.35), 0.5);
  const at = ctx.fills.lastIndexOf(lip);
  assert.ok(at >= 0);
  assert.ok(idx(ctx, 'fillRect', (a) => a[0] === 0 && a[1] === 938 && a[2] === 1600 && a[3] === 3) >= 0);
});

test('the same tint builds the same room, a different one a different room', () => {
  const a = build(tintAt(NIGHT));
  const b = build(tintAt(NIGHT));
  assert.deepEqual(a.calls, b.calls);
  assert.deepEqual(a.fills, b.fills);
  const c = build(tintAt(NOON));
  assert.notDeepEqual([a.fills, stopsOf(a)], [c.fills, stopsOf(c)]);
});

test('the window light on the table fades towards the front', () => {
  const tn = tintAt(NOON);
  const ctx = recordingCtx();
  drawShed(ctx, {}, tn, null, undefined);
  const g = ctx.gradients.find((x) => x.kind === 'linear' && x.args[1] === 680 && x.args[3] === 940);
  assert.ok(g);
  const a = 0.1 * tn.ambient + 0.02;
  assert.deepEqual(g.stops, [[0, css(tn.skyLow, a * 1.3)], [1, css(tn.skyLow, 0)]]);
  assert.ok(!ctx.fills.includes(css(tn.skyLow, a)));
});

test('contact shadow darkens, reflection lights', () => {
  const s = recordingCtx();
  contactShadow(s, 170, 442, 60, 210, 0.09, 0.5);
  assert.deepEqual(s.gradients[0].stops, [[0, css(PALETTE.shadow, 0.5)], [1, css(PALETTE.shadow, 0)]]);
  assert.ok(!s.ops.includes('lighter'));
  const colour = [255, 200, 120];
  const r = recordingCtx();
  reflection(r, 170, 442, 240, 118, colour, 0.1);
  assert.ok(r.ops.includes('lighter'));
  assert.deepEqual(r.gradients[0].stops, [[0, css(colour, 0.1)], [1, css(colour, 0)]]);
});

test('the vignette eases to 0.5 and takes a strength', () => {
  assert.equal(VIGNETTE, 0.5);
  const a = recordingCtx();
  vignette(a, 100, 100);
  assert.equal(a.gradients[0].stops[1][1], css(PALETTE.shadow, 0.5));
  const b = recordingCtx();
  vignette(b, 100, 100, 0.62);
  assert.equal(b.gradients[0].stops[1][1], css(PALETTE.shadow, 0.62));
});
