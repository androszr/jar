import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jarSearch, tableSearch, entryFor, leaveAction } from '../src/address.js';
import { Lift, liftCamera, liftEase } from '../src/lift.js';

test('jarSearch sets ?jar and keeps the rest; tableSearch removes it', () => {
  assert.equal(jarSearch('', 'warsaw'), '?jar=warsaw');
  assert.equal(jarSearch('?x=1&jar=old', 'warsaw'), '?x=1&jar=warsaw');
  assert.equal(tableSearch('?jar=warsaw'), '');
  assert.equal(tableSearch('?x=1&jar=warsaw'), '?x=1');
});

test('entryFor and leaveAction', () => {
  assert.deepEqual(entryFor('jar', 'warsaw', true), { lane: 'jar', id: 'warsaw', pushed: true });
  assert.deepEqual(entryFor('table'), { lane: 'table' });
  assert.equal(leaveAction({ lane: 'jar', id: 'warsaw', pushed: true }), 'back');
  assert.equal(leaveAction({ lane: 'jar', id: 'warsaw', pushed: false }), 'replace');
  assert.equal(leaveAction(null), 'replace');
});

test('the lift glides closed -> up -> closed and the camera meets both ends', () => {
  const l = new Lift(0.8);
  assert.equal(l.progress(0), 0);
  l.open(1000);
  assert.equal(l.state, 'lifting');
  const mid = l.progress(1400);
  assert.ok(mid > 0.3 && mid < 0.7);
  assert.equal(l.progress(2000), 1);
  assert.equal(l.state, 'up');
  l.close(3000);
  assert.equal(l.state, 'lowering');
  assert.equal(l.progress(4000), 0);
  assert.equal(l.state, 'closed');
  assert.equal(liftEase(0), 0);
  assert.equal(liftEase(1), 1);
  const rect = { x: 630, y: 270, w: 340, h: 440 };
  const dview = { cx: 800, cy: 500, scale: 0.8, viewH: 960, viewW: 1280 };
  assert.deepEqual(liftCamera(0, rect, dview), { cx: 800, cy: 500, scale: 0.8 });
  const up = liftCamera(1, rect, dview);
  assert.ok(Math.abs(up.cx - 800) < 1e-9 && Math.abs(up.cy - 490) < 1e-9);
  assert.ok(Math.abs(up.scale * rect.h - 0.8 * 960) < 1e-6, 'the jar fills 80% of the height');
});

test('a narrow screen never lifts the jar wider than itself', () => {
  const rect = { x: 0, y: 0, w: 333, h: 430 };
  const up = liftCamera(1, rect, { cx: 0, cy: 0, scale: 0.844, viewH: 844, viewW: 390 });
  assert.ok(up.scale * rect.w <= 390);
});

test('a zero-length lift jumps; snap sets the end state', () => {
  const l = new Lift(0);
  l.open(10);
  assert.equal(l.progress(10), 1);
  l.snap(false);
  assert.equal(l.progress(11), 0);
});
