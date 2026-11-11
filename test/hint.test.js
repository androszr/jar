import test from 'node:test';
import assert from 'node:assert/strict';
import { hintWording, hintSentence, initialHint, hintOnLift, hintAfter, hintAlpha, hintPose, HINT_Y, HINT_SIZE } from '../src/hint.js';
import { Lift } from '../src/lift.js';
import { TABLE_FOOT } from '../src/shelf.js';
import { TABLE_Y } from '../src/shed.js';

test('wording follows the pointer', () => {
  assert.equal(hintWording(true), 'tap a jar');
  assert.equal(hintWording(false), 'click a jar');
});

test('the spoken sentence capitalises and ends the thought', () => {
  assert.equal(hintSentence('tap a jar'), 'Tap a jar to lift it.');
  assert.equal(hintSentence('click a jar'), 'Click a jar to lift it.');
});

test('a deep link starts with no hint', () => {
  assert.equal(initialHint(true), 'none');
  assert.equal(initialHint(false), 'shown');
});

test('the first lift starts the fade, nothing else does', () => {
  assert.equal(hintOnLift('shown'), 'fading');
  assert.equal(hintOnLift('none'), 'none');
  assert.equal(hintOnLift('fading'), 'fading');
});

test('the fade ends when the lift does and never revives', () => {
  assert.equal(hintAfter('fading', 0.5), 'fading');
  assert.equal(hintAfter('fading', 1), 'none');
  assert.equal(hintAfter('none', 0), 'none');
  assert.equal(hintAfter('none', 1), 'none');
  assert.equal(hintAfter('shown', 0), 'shown');
});

test('a lift called off mid-glide ends the hint for good', () => {
  const lift = new Lift(0.8);
  lift.open(1000);
  let state = hintOnLift('shown');
  state = hintAfter(state, lift.progress(1400), lift.state);
  assert.equal(state, 'fading');
  lift.close(1400);
  for (const t of [1500, 1800, 3000]) {
    const p = lift.progress(t);
    state = hintAfter(state, p, lift.state);
    assert.equal(state, 'none');
    assert.equal(hintAlpha(state, p), 0);
  }
});

test('alpha follows the state and the lift', () => {
  assert.equal(hintAlpha('shown', 0), 1);
  assert.equal(hintAlpha('fading', 0.25), 0.75);
  assert.equal(hintAlpha('none', 0), 0);
  assert.equal(hintAlpha('fading', 1.5), 0);
});

test('driven by a real lift the hint dims then goes', () => {
  const lift = new Lift(0.8);
  lift.open(1000);
  let state = hintOnLift('shown');
  const seen = [];
  for (const t of [1000, 1400, 2000]) {
    const p = lift.progress(t);
    state = hintAfter(state, p);
    seen.push({ state, a: hintAlpha(state, p) });
  }
  assert.deepEqual(seen.map((s) => s.state), ['fading', 'fading', 'none']);
  assert.ok(seen[0].a > seen[1].a && seen[1].a > seen[2].a);
  const quick = new Lift(0);
  quick.open(1000);
  assert.equal(hintAfter(hintOnLift('shown'), quick.progress(1000)), 'none');
});

test('the lettering sits in free wood, clear of the spill, the seams and the edge', () => {
  assert.ok(HINT_Y > TABLE_FOOT + 64 + HINT_SIZE / 2);
  assert.ok(HINT_Y + HINT_SIZE / 2 < 940);
  const off = (HINT_Y - TABLE_Y) % 44;
  assert.ok(off >= HINT_SIZE / 2 && 44 - off >= HINT_SIZE / 2, `offset ${off}`);
});

test('the pose follows the camera centre', () => {
  assert.deepEqual(hintPose(800), { x: 800, y: HINT_Y, size: HINT_SIZE });
});
