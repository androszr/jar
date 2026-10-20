import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sliceFor, fitScreen, SCENE } from '../src/framing.js';

test('4:3 and wider show the whole scene', () => {
  for (const a of [4 / 3, 1.6, 2.2, 844 / 390]) assert.deepEqual(sliceFor(a, 800, SCENE.w), { x: 0, w: SCENE.w });
});

test('a tall screen shows a full-height slice centred on the jar', () => {
  const aspect = 390 / 844;
  const s = sliceFor(aspect, 800, SCENE.w);
  assert.ok(Math.abs(s.w - SCENE.h * aspect) < 1e-9);
  assert.ok(Math.abs(s.x + s.w / 2 - 800) < 1e-9);
});

test('the slice clamps at both edges', () => {
  const aspect = 0.5;
  assert.equal(sliceFor(aspect, 0, SCENE.w).x, 0);
  const right = sliceFor(aspect, 5000, SCENE.w);
  assert.ok(Math.abs(right.x + right.w - SCENE.w) < 1e-9);
});

test('a junk aspect falls back to the whole scene', () => {
  assert.deepEqual(sliceFor(NaN, 0, SCENE.w), { x: 0, w: SCENE.w });
  assert.deepEqual(sliceFor(0, 0, SCENE.w), { x: 0, w: SCENE.w });
});

test('fitScreen: letterboxed wide, full-height slice tall', () => {
  const wide = fitScreen(1280, 960);
  assert.equal(wide.portrait, false);
  assert.ok(Math.abs(wide.scale - 0.8) < 1e-9);
  const tall = fitScreen(390, 844, 800);
  assert.equal(tall.portrait, true);
  assert.ok(Math.abs(tall.scale - 0.844) < 1e-9);
  assert.ok(Math.abs(tall.cx - 800) < 1e-9);
});
