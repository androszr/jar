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
//
// Room for the credit link: when `dview.credit` ({ left, bottom }, the link's box edges in CSS px)
// and `dview.core` (the extent without the slider band) are given and the lifted picture would reach
// within CREDIT_MARGIN of that box, the picture is instead fitted into the band between the credit's
// bottom and `dview.bottomReserve` px above the view's foot (the slider row). Otherwise the camera is
// exactly the plain one. Everything is a function of the numbers passed in.
export const CREDIT_MARGIN = 8;

export function liftTarget(rect, dview, extent = rect) {
  let scale = (LIFT_FILL * dview.viewH) / rect.h;
  if (dview.viewW) scale = Math.min(scale, (0.92 * dview.viewW) / extent.w);
  if (extent !== rect) scale = Math.min(scale, (0.92 * dview.viewH) / extent.h);
  const plain = { cx: extent.x + extent.w / 2, cy: extent.y + extent.h / 2, scale };
  const { credit, core } = dview;
  if (!credit || !core || !dview.viewW) return plain;
  const top = dview.viewH / 2 + (extent.y - plain.cy) * scale;
  const right = dview.viewW / 2 + (extent.x + extent.w - plain.cx) * scale;
  if (top >= credit.bottom + CREDIT_MARGIN || right <= credit.left - CREDIT_MARGIN) return plain;
  const y0 = credit.bottom + CREDIT_MARGIN;
  const y1 = dview.viewH - (dview.bottomReserve || 0);
  const availH = Math.max(1, y1 - y0);
  // keep the plain scale if the band holds the picture, else shrink to the band; slide down only as far
  // as the credit needs (and up again only as far as the slider row needs).
  const fit = Math.min(scale, availH / core.h);
  const plainTop = dview.viewH / 2 + (core.y - plain.cy) * scale;
  const topY = Math.min(Math.max(plainTop, y0), y1 - core.h * fit);
  return { cx: plain.cx, cy: core.y - (topY - dview.viewH / 2) / fit, scale: fit };
}

export function liftCamera(e, rect, dview, extent = rect) {
  const t = liftTarget(rect, dview, extent);
  return {
    cx: lerp(dview.cx, t.cx, e),
    cy: lerp(dview.cy, t.cy, e),
    scale: dview.scale * Math.pow(t.scale / dview.scale, e),
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

// A press at scene point `p` while a jar is lifted: true when it lands on
// neither the lifted jar nor its forecast card (`card` may be null), which
// puts the jar back on the table.
export function pressLowers(p, jar, card = null) {
  const inside = (r) => !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  return !inside(jar) && !inside(card);
}
