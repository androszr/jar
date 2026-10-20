// The row of jars on the table: a pure model (positions, hit-testing, swipe
// settle) with no drawing and no DOM. Written after the pattern of Memory
// Lane's hall; every number is in scene units.
import { JAR } from './jar-geometry.js';
import { SCENE } from './framing.js';

export const TABLE_FOOT = 710; // the y a jar's foot rests on

// Seconds the glide advances on this animation frame: the time since the
// previous FRAME (never since the last redraw, which skips frames and would
// add the skipped time again on every frame in between), capped at 0.1 s so a
// tab coming back from the background does not jump the row. The first frame
// has no previous one and steps a nominal 60 Hz frame.
export function frameDt(t, prevT) {
  if (prevT === null || !(t > prevT)) return prevT === null ? 0.016 : 0;
  return Math.min(0.1, (t - prevT) / 1000);
}

// Jar size and gap for a view `viewW` scene units wide: the full jar on a wide
// screen; on a narrow one the jar takes 72 % of the width with a small gap, so
// the next jars' edges peek in.
export function shelfMetrics(viewW) {
  const w = Math.min(JAR.w, 0.72 * viewW);
  const gap = viewW >= SCENE.w ? 110 : Math.min(110, 0.05 * viewW);
  return { w, h: (w * JAR.h) / JAR.w, gap, pitch: w + gap };
}

// The x of each jar's centre; jar i stands at 800 + (i - (n-1)/2) pitches.
export function shelfLayout(count, m) {
  const xs = [];
  for (let i = 0; i < count; i++) xs.push(SCENE.w / 2 + (i - (count - 1) / 2) * m.pitch);
  return { xs, left: xs.length ? xs[0] - m.w / 2 : 0, right: xs.length ? xs[count - 1] + m.w / 2 : 0 };
}

export class Shelf {
  constructor(count, metrics) {
    this.count = count;
    this.setMetrics(metrics);
    this.pos = 0; // the focused jar as a float index
    this.target = 0;
    this.dragging = false;
    this.lastX = 0;
    this.lastT = 0;
    this.v = 0;
  }

  setMetrics(m) {
    this.m = m;
    this.layout = shelfLayout(this.count, m);
  }

  get index() {
    return Math.max(0, Math.min(this.count - 1, Math.round(this.pos)));
  }

  // The scene x at the middle of the view: where the focused jar stands.
  get centreX() {
    return SCENE.w / 2 + (this.pos - (this.count - 1) / 2) * this.m.pitch;
  }

  go(i) {
    this.target = Math.max(0, Math.min(this.count - 1, i));
  }

  next() { this.go(Math.round(this.target) + 1); }

  prev() { this.go(Math.round(this.target) - 1); }

  // A wheel or trackpad nudge: step one jar per notch.
  wheel(delta) {
    if (delta > 0) this.next();
    else if (delta < 0) this.prev();
  }

  // The jar's rect in scene units.
  jarRect(i) {
    const x = this.layout.xs[i] - this.m.w / 2;
    return { x, y: TABLE_FOOT - this.m.h, w: this.m.w, h: this.m.h };
  }

  // The jar under scene point (x, y), or -1.
  hit(x, y) {
    for (let i = 0; i < this.count; i++) {
      const r = this.jarRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  // Drag in scene units: x is the pointer's scene x, t its time in ms.
  dragStart(x, t = 0) {
    this.dragging = true;
    this.lastX = x;
    this.lastT = t;
    this.v = 0;
  }

  dragMove(x, t = 0) {
    if (!this.dragging) return;
    const dx = x - this.lastX;
    const dt = Math.max(1, t - this.lastT);
    this.v = (dx / dt) * 1000;
    this.pos -= dx / this.m.pitch;
    // rubber band past the ends
    this.pos = Math.max(-0.35, Math.min(this.count - 1 + 0.35, this.pos));
    this.lastX = x;
    this.lastT = t;
  }

  // Release with the pointer's velocity (scene units / s): settle on the
  // nearest jar, thrown on by the velocity. With one jar it springs back.
  dragEnd(vx = this.v) {
    if (!this.dragging) return;
    this.dragging = false;
    const thrown = this.pos - (vx * 0.25) / this.m.pitch;
    this.target = Math.max(0, Math.min(this.count - 1, Math.round(thrown)));
  }

  // Advance the settle by dt seconds; true while still moving.
  step(dt) {
    if (this.dragging) return true;
    const d = this.target - this.pos;
    if (Math.abs(d) < 0.001) {
      this.pos = this.target;
      return false;
    }
    this.pos += d * (1 - Math.exp(-dt * 12));
    return true;
  }
}
