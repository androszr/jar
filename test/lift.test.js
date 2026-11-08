import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pressLowers } from '../src/lift.js';

const jar = { x: 100, y: 100, w: 340, h: 440 };
const card = { x: 480, y: 200, w: 200, h: 240 };

test('a press on the lifted jar or its card keeps it lifted; anywhere else lowers it', () => {
  assert.equal(pressLowers({ x: 270, y: 300 }, jar, card), false, 'on the jar');
  assert.equal(pressLowers({ x: 100, y: 100 }, jar, card), false, 'on the jar edge');
  assert.equal(pressLowers({ x: 560, y: 300 }, jar, card), false, 'on the card');
  assert.equal(pressLowers({ x: 20, y: 300 }, jar, card), true, 'left of the jar');
  assert.equal(pressLowers({ x: 460, y: 150 }, jar, card), true, 'between jar and card, above the card');
  assert.equal(pressLowers({ x: 270, y: 700 }, jar, card), true, 'below the jar');
  assert.equal(pressLowers({ x: 560, y: 300 }, jar, null), true, 'no card drawn: its place is outside');
});
