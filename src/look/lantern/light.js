// Lantern's lighting: tint interpolation, sky gradient, glow, bloom, the
// pool of light on the table, the vignette. Colours arrive as [r, g, b].
import { lerp } from '../../clock.js';
import { PALETTE, TINTS, css, mix } from './palette.js';

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

export const VIGNETTE = 0.5;

// Darkens the corners; called with the identity transform.
export function vignette(ctx, w, h, strength = VIGNETTE) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  g.addColorStop(0, css(PALETTE.shadow, 0));
  g.addColorStop(1, css(PALETTE.shadow, strength));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// The unseen lamp above the table: two additive glows on the wall, strongest
// when the room is dark (`lit` is the ambient the art is built at).
export const LAMP_HIGH = { x: 800, y: 90, r: 980 };
export const LAMP_LOW = { x: 800, y: 520, r: 520 };
export function lampWash(ctx, lit) {
  const s = 0.07 + 0.13 * (1 - lit);
  glow(ctx, LAMP_HIGH.x, LAMP_HIGH.y, LAMP_HIGH.r, PALETTE.lamp, s);
  glow(ctx, LAMP_LOW.x, LAMP_LOW.y, LAMP_LOW.r, PALETTE.lamp, s * 0.5);
}

// An additive elliptical light (rx wide, ry tall) centred on cx, cy.
export function sheen(ctx, cx, cy, rx, ry, colour, strength) {
  if (!(strength > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, css(colour, strength));
  g.addColorStop(0.5, css(colour, strength * 0.4));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

// A polygon of additive light that fades out from y0 to y1.
export function lightPatch(ctx, points, colour, alpha, y0, y1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, css(colour, alpha * 1.3));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// A soft dark ellipse where something stands (source-over).
export function contactShadow(ctx, cx, cy, inner, outer, squash, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
  g.addColorStop(0, css(PALETTE.shadow, alpha));
  g.addColorStop(1, css(PALETTE.shadow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-outer, -outer, outer * 2, outer * 2);
  ctx.restore();
}

// A faint short reflection of a light on the wood below it.
export function reflection(ctx, cx, y, w, h, colour, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(colour, alpha));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - w / 2, y, w, h);
  ctx.restore();
}
