// Lantern's lighting: tint interpolation, sky gradient, glow, bloom, the
// pool of light on the table, the vignette. Colours arrive as [r, g, b].
import { lerp } from '../../clock.js';
import { TINTS, css, mix } from './palette.js';

const mix3 = (a, b, t) => mix(a, b, t);

// The tint at a clock sample { light, a, b, t }: every channel interpolated
// between the two bracketing keyframes.
export function tint(sample) {
  const A = TINTS[sample.a] || TINTS.night;
  const B = TINTS[sample.b] || A;
  const t = sample.t;
  return {
    light: sample.light,
    skyTop: mix3(A.skyTop, B.skyTop, t),
    skyLow: mix3(A.skyLow, B.skyLow, t),
    ambient: lerp(A.ambient, B.ambient, t),
    lantern: mix3(A.lantern, B.lantern, t),
    spill: mix3(A.spill, B.spill, t),
    bloom: lerp(A.bloom, B.bloom, t),
  };
}

export function skyGradient(ctx, rect, tn) {
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, css(tn.skyTop));
  g.addColorStop(1, css(tn.skyLow));
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

// A soft round light: additive, so overlapping glows brighten.
export function glow(ctx, x, y, r, colour, strength = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(colour, Math.min(1, strength)));
  g.addColorStop(0.4, css(colour, Math.min(1, strength) * 0.35));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// Bloom: `src` (a canvas a quarter of the view's size, holding the bright
// things) scaled back up with smoothing and added over the view.
export function bloom(src, dst, strength) {
  if (!(strength > 0)) return;
  const c = dst.canvas;
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalCompositeOperation = 'lighter';
  dst.imageSmoothingEnabled = true;
  dst.imageSmoothingQuality = 'high';
  // softened: a blur where the browser supports ctx.filter, else the plain upscale
  if ('filter' in dst) dst.filter = `blur(${Math.max(2, Math.round(c.width / 90))}px)`;
  dst.globalAlpha = Math.min(1, strength);
  dst.drawImage(src, 0, 0, c.width, c.height);
  dst.restore();
}

// The pool of light under a jar: an ellipse in `rect` ({ x, y, w, h } is its
// bounding box on the table), colour and strength from the jar's brightness.
export function spill(ctx, rect, colour, strength) {
  if (!(strength > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.scale(1, rect.h / rect.w);
  const r = rect.w / 2;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, css(colour, Math.min(1, strength)));
  g.addColorStop(0.5, css(colour, Math.min(1, strength) * 0.4));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

// Darkens the corners; called with the identity transform.
export function vignette(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  g.addColorStop(0, css([0, 0, 0], 0));
  g.addColorStop(1, css([0, 0, 0], 0.62));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
