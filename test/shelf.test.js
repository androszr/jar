import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shelf, shelfMetrics, shelfLayout, TABLE_FOOT, frameDt } from '../src/shelf.js';
import { JAR } from '../src/jar.js';

test('wide metrics are the full jar with a 110 gap; narrow ones shrink and peek', () => {
  const wide = shelfMetrics(1600);
  assert.deepEqual([wide.w, wide.gap], [JAR.w, 110]);
  const narrow = shelfMetrics(462);
  assert.ok(Math.abs(narrow.w - 0.72 * 462) < 1e-9);
  assert.ok(Math.abs(narrow.gap - 0.05 * 462) < 1e-9);
  assert.ok(Math.abs(narrow.h / narrow.w - JAR.h / JAR.w) < 1e-9);
});

test('jarRect for one jar sits centred and on the table, at both widths', () => {
  for (const vw of [1600, 462]) {
    const s = new Shelf(1, shelfMetrics(vw));
    const r = s.jarRect(0);
    assert.ok(Math.abs(r.x + r.w / 2 - 800) < 1e-9);
    assert.equal(r.y + r.h, TABLE_FOOT);
  }
});

test('jarRect for three jars: evenly spaced, middle one centred', () => {
  const m = shelfMetrics(1600);
  const s = new Shelf(3, m);
  const xs = [0, 1, 2].map((i) => s.jarRect(i).x + m.w / 2);
  assert.ok(Math.abs(xs[1] - 800) < 1e-9);
  assert.ok(Math.abs(xs[1] - xs[0] - m.pitch) < 1e-9 && Math.abs(xs[2] - xs[1] - m.pitch) < 1e-9);
  assert.equal(shelfLayout(3, m).xs.length, 3);
  const narrow = new Shelf(3, shelfMetrics(462));
  assert.ok(narrow.jarRect(1).x > narrow.jarRect(0).x + narrow.jarRect(0).w);
});

test('hit finds the jar under a point, or -1', () => {
  const s = new Shelf(3, shelfMetrics(1600));
  for (let i = 0; i < 3; i++) {
    const r = s.jarRect(i);
    assert.equal(s.hit(r.x + r.w / 2, r.y + r.h / 2), i);
  }
  assert.equal(s.hit(5, 5), -1);
  assert.equal(s.hit(800, 20), -1);
});

test('next and prev clamp; centreX follows the position', () => {
  const s = new Shelf(3, shelfMetrics(1600));
  s.prev();
  assert.equal(s.target, 0);
  s.next(); s.next(); s.next();
  assert.equal(s.target, 2);
  for (let i = 0; i < 200 && s.step(0.05); i++);
  assert.equal(s.pos, 2);
  assert.equal(s.index, 2);
  assert.ok(Math.abs(s.centreX - s.layout.xs[2]) < 1e-9);
});

test('a drag settles on the nearest jar, thrown on by its velocity', () => {
  const m = shelfMetrics(462);
  const s = new Shelf(3, m);
  s.dragStart(300, 0);
  s.dragMove(300 - m.pitch * 0.6, 100);
  s.dragEnd(0);
  assert.equal(s.target, 1);
  const t = new Shelf(3, m);
  t.dragStart(300, 0);
  t.dragMove(300 - m.pitch * 0.2, 50);
  t.dragEnd(-800);
  assert.equal(t.target, 1, 'a fast flick carries it to the next jar');
  for (let i = 0; i < 200 && t.step(0.05); i++);
  assert.equal(t.pos, 1);
});

test('with one jar a swipe springs back', () => {
  const s = new Shelf(1, shelfMetrics(462));
  s.dragStart(200, 0);
  s.dragMove(120, 60);
  assert.ok(s.pos > 0.05, 'the row follows the finger');
  s.dragEnd();
  assert.equal(s.target, 0);
  for (let i = 0; i < 200 && s.step(0.05); i++);
  assert.equal(s.pos, 0);
});

test('wheel steps one jar per notch', () => {
  const s = new Shelf(3, shelfMetrics(1600));
  s.wheel(120);
  assert.equal(s.target, 1);
  s.wheel(-5);
  assert.equal(s.target, 0);
});

test('the glide steps by frame time, so skipped redraws never speed it up', () => {
  // 60 Hz frames with a redraw only every third one: the glide must advance
  // exactly the elapsed time, not the time since the last redraw on each frame.
  let prev = null;
  let total = 0;
  for (let i = 0; i <= 30; i++) {
    const t = 1000 + i * (1000 / 60);
    if (prev !== null) total += frameDt(t, prev);
    prev = t;
  }
  assert.ok(Math.abs(total - 0.5) < 1e-9);
  assert.equal(frameDt(5000, 1000), 0.1); // back from the background: capped
  assert.equal(frameDt(1000, null), 0.016); // first frame
  assert.equal(frameDt(1000, 1000), 0); // same timestamp twice
});
