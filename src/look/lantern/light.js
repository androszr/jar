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

// A heavy sky: the day's gradient goes to grey, by `amount` 0..1, darker the
// less light there is (`light` 0..1), so a night overcast stays a night.
export function overcastSky(ctx, rect, amount, light = 1) {
  if (!(amount > 0)) return;
  const k = 0.12 + 0.88 * Math.max(0, Math.min(1, light));
  const top = [PALETTE.overcastTop[0] * k, PALETTE.overcastTop[1] * k, PALETTE.overcastTop[2] * k];
  const low = [PALETTE.overcastLow[0] * k, PALETTE.overcastLow[1] * k, PALETTE.overcastLow[2] * k];
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, css(top, Math.min(1, amount)));
  g.addColorStop(0.7, css(low, Math.min(1, amount)));
  g.addColorStop(1, css(low, Math.min(1, amount)));
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

// The same weight on the scene under that sky: its colours drain toward grey
// and it dims a little, by `amount`; `light` keeps the night from going black.
export const GLOOM_DRAIN = 0.6;
export const GLOOM_DIM = 0.3;
export function gloomWash(ctx, rect, amount, light = 1) {
  if (!(amount > 0)) return;
  const day = Math.max(0, Math.min(1, light));
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  // lamps and lit windows keep their colour at night
  ctx.fillStyle = css(PALETTE.gloom, Math.min(1, GLOOM_DRAIN * amount * (0.25 + 0.75 * day)));
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = css(mix(PALETTE.grainLight, PALETTE.gloom, 0.75), Math.min(1, GLOOM_DIM * amount * (0.35 + 0.65 * day) / 0.75));
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
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
  // laid in upright strips that fade to nothing at both sides, so the light has no box edge
  const n = 24;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = Math.sin((Math.PI * (i + 0.5)) / n) ** 2;
    ctx.fillRect(cx - w / 2 + (i * w) / n, y, w / n, h);
  }
  ctx.restore();
}

// The room behind a lifted jar: `small` (a canvas a quarter of the view's size)
// takes the frame so far and hands it back upscaled, which softens it, under a
// veil of shadow. `amount` 0..1 is the lift's progress; called with any transform.
export const BACKDROP_DIM = 0.5;
export function backdrop(ctx, small, amount) {
  if (!(amount > 0)) return;
  const c = ctx.canvas;
  const a = Math.min(1, amount);
  const sctx = small.getContext('2d');
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.clearRect(0, 0, small.width, small.height);
  sctx.drawImage(c, 0, 0, small.width, small.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = a;
  ctx.drawImage(small, 0, 0, c.width, c.height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = css(PALETTE.shadow, BACKDROP_DIM * a);
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}

// What a jar hands the bloom: `tile` takes `src` (the jar's interior) times
// the square of its own brightness, so a mid grey falls to a quarter while a
// lit window stays lit, and no colour is pushed toward its strongest channel.
// `luma` is a second canvas of the same size, used for the brightness alone.
export function brights(tile, src, luma) {
  const w = tile.width;
  const h = tile.height;
  const l = luma.getContext('2d');
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, w, h);
  l.imageSmoothingEnabled = true;
  l.drawImage(src, 0, 0, w, h);
  // grey of the same lightness, then cut back to the glass's own shape
  l.globalCompositeOperation = 'saturation';
  l.fillStyle = css(PALETTE.grainDark);
  l.fillRect(0, 0, w, h);
  l.globalCompositeOperation = 'destination-in';
  l.drawImage(src, 0, 0, w, h);
  l.globalCompositeOperation = 'source-over';
  const t = tile.getContext('2d');
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = 'source-over';
  t.clearRect(0, 0, w, h);
  t.imageSmoothingEnabled = true;
  t.drawImage(src, 0, 0, w, h);
  t.globalCompositeOperation = 'multiply';
  t.drawImage(luma, 0, 0);
  t.drawImage(luma, 0, 0);
  t.globalCompositeOperation = 'source-over';
  return tile;
}

// Film grain: a small tile of light and dark specks from a fixed hash (never
// Math.random, so the same frame is the same pixels), laid over the whole view
// in device px. It breaks the bands a long gradient shows on an 8-bit screen.
export const GRAIN = 0.024;
export function grainTile(make, size = 128) {
  const tile = make(size, size);
  const g = tile.getContext('2d');
  const img = g.createImageData(size, size);
  let seed = 0x9e3779b9;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    const v = (seed >>> 8) / 0x1000000; // 0..1
    const c = v < 0.5 ? PALETTE.grainDark : PALETTE.grainLight;
    img.data[i * 4] = c[0];
    img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2];
    img.data[i * 4 + 3] = Math.round(255 * Math.abs(v - 0.5) * 2);
  }
  g.putImageData(img, 0, 0);
  return tile;
}

export function grain(ctx, w, h, tile, strength = GRAIN) {
  if (!tile || !(strength > 0)) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = strength;
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

const speck = (i, s) => {
  const v = Math.sin(i * 91.7 + s * 47.3 + 0.5) * 24634.6345;
  return v - Math.floor(v);
};

// Dust in the lamp's light: slow specks drifting in the cone under the unseen
// lamp, brightest when the room is dark. A function of `nowMs` alone; with
// `still` (reduced motion) they hang where they are.
export const MOTES = 34;
export function motes(ctx, lit, nowMs, still = false) {
  const s = 0.1 + 0.34 * (1 - lit);
  const t = still ? 0 : nowMs;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < MOTES; i++) {
    const depth = 0.4 + 0.6 * speck(i, 3);
    const lap = t / (38000 + 30000 * speck(i, 4)) + speck(i, 5);
    const fall = lap - Math.floor(lap);
    const x = 800 + (speck(i, 1) - 0.5) * 1150 + Math.sin(t / (2600 + 1800 * speck(i, 6)) + i) * 14;
    const y = 60 + fall * 600;
    // a mote shows in the cone and fades near its top and near the table
    const edge = Math.min(1, fall * 5, (1 - fall) * 5);
    const twinkle = 0.6 + 0.4 * Math.sin(t / (700 + 500 * speck(i, 7)) + i * 2.1);
    ctx.fillStyle = css(PALETTE.mote, s * depth * edge * twinkle);
    ctx.beginPath();
    ctx.arc(x, y, 0.9 + 1.5 * depth, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// A moth at the lamp once the room is dark: two small wings on a wandering
// loop around LAMP_HIGH. Nothing by day, nothing with `still`.
export const MOTH_BELOW = 0.3; // the ambient under which it comes out
export function mothAt(nowMs) {
  const t = nowMs / 1000;
  return {
    x: LAMP_HIGH.x + 120 * Math.sin(t * 0.83) + 46 * Math.sin(t * 2.3 + 1),
    y: LAMP_HIGH.y + 44 + 34 * Math.sin(t * 1.27 + 2) + 16 * Math.sin(t * 3.1),
    beat: Math.abs(Math.sin(t * 19)),
  };
}
export function moth(ctx, lit, nowMs, still = false) {
  if (still || !(lit < MOTH_BELOW)) return false;
  const m = mothAt(nowMs);
  const a = Math.min(1, (MOTH_BELOW - lit) / 0.1) * 0.8;
  ctx.save();
  ctx.fillStyle = css(PALETTE.moth, a);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + side * (3 + 5 * m.beat), m.y - 5);
    ctx.lineTo(m.x + side * (2 + 4 * m.beat), m.y + 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return true;
}
