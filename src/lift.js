// Lifting a jar: the glide from the table camera to a close-up and back.
import { lerp } from './clock.js';

export const LIFT_SECONDS = 0.8;
export const LIFT_FILL = 0.8; // the lifted jar fills this share of the view height

export const liftEase = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

// The camera at progress `e` (0 table .. 1 lifted). `dview` is the table
// camera { cx, cy, scale } plus `viewH` and optionally `viewW` (CSS px); `rect` the jar's scene rect.
// `extent` (default the jar) is the rect that must stay in view: the jar plus its forecast card.
export function liftCamera(e, rect, dview, extent = rect) {
  let targetScale = (LIFT_FILL * dview.viewH) / rect.h;
  if (dview.viewW) targetScale = Math.min(targetScale, (0.92 * dview.viewW) / extent.w);
  if (extent !== rect) targetScale = Math.min(targetScale, (0.92 * dview.viewH) / extent.h);
  return {
    cx: lerp(dview.cx, extent.x + extent.w / 2, e),
    cy: lerp(dview.cy, extent.y + extent.h / 2, e),
    scale: dview.scale * Math.pow(targetScale / dview.scale, e),
  };
}

export class Lift {
  constructor(seconds = LIFT_SECONDS) {
    this.seconds = seconds;
    this.state = 'closed'; // closed | lifting | up | lowering
    this.startedAt = 0;
  }

  open(now) {
    if (this.state === 'up' || this.state === 'lifting') return;
    const e = this.progress(now);
    this.state = 'lifting';
    this.startedAt = now - e * this.seconds * 1000;
  }

  close(now) {
    if (this.state === 'closed' || this.state === 'lowering') return;
    const e = this.progress(now);
    this.state = 'lowering';
    this.startedAt = now - (1 - e) * this.seconds * 1000;
  }

  // Jump to the end state without a glide.
  snap(up) {
    this.state = up ? 'up' : 'closed';
  }

  // Eased progress 0..1 at `now` (ms), settling the state when a glide ends.
  progress(now) {
    if (this.state === 'closed') return 0;
    if (this.state === 'up') return 1;
    const raw = this.seconds <= 0 ? 1 : (now - this.startedAt) / (this.seconds * 1000);
    const t = Math.max(0, Math.min(1, raw));
    if (t >= 1) {
      this.state = this.state === 'lifting' ? 'up' : 'closed';
      return this.state === 'up' ? 1 : 0;
    }
    return liftEase(this.state === 'lifting' ? t : 1 - t);
  }

  get moving() {
    return this.state === 'lifting' || this.state === 'lowering';
  }
}
