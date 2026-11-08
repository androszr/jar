import { test } from 'node:test';
import assert from 'node:assert/strict';
import { label } from '../src/look/index.js';
import { LABEL } from '../src/jar-geometry.js';

// A 2D context that records fillText calls.
function fake() {
  const texts = [];
  const target = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'texts') return texts;
      if (k in t) return t[k];
      if (k === 'fillText') return (s, x, y) => { texts.push({ s, x, y }); };
      if (k === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function paint(lines) {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random in a draw function'); };
  try {
    const ctx = fake();
    label(ctx, LABEL, lines);
    return ctx.texts;
  } finally {
    Math.random = real;
  }
}

test('three lines sit where they always did', () => {
  const t = paint(['WARSAW', '12°', '14:05']);
  assert.equal(t.length, 3);
  assert.deepEqual(t.map((x) => x.y), [0.22, 0.52, 0.82].map((f) => LABEL.y + LABEL.h * f));
});

test('four lines: ascending, inside the plate, the swell last', () => {
  const t = paint(['NAZARÉ', '17°', '13:05', '2.4 m · 12 s']);
  assert.equal(t.length, 4);
  assert.equal(t[3].s, '2.4 m · 12 s');
  for (let i = 0; i < 4; i++) {
    assert.ok(t[i].y > LABEL.y && t[i].y < LABEL.y + LABEL.h, 'inside the plate');
    if (i) assert.ok(t[i].y > t[i - 1].y, 'ascending');
  }
});
