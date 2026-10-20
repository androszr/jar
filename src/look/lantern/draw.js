// Lantern's drawing primitives: planks, the glass jar and its highlights, the
// lids, the brass-edged label plate and its monospace text.
import { PALETTE, css, mix } from './palette.js';

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

// A deterministic 0..1 from two integers, for grain and shade.
const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function plank(ctx, x, y, w, h, shade = 0.5) {
  ctx.fillStyle = css(mix(PALETTE.plankDark, PALETTE.plankLight, shade));
  ctx.fillRect(x, y, w, h);
  // grain: a few long faint lines
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const gy = y + h * (0.1 + 0.8 * hash(Math.round(x), i + Math.round(y)));
    ctx.strokeStyle = css(PALETTE.seam, 0.18 + 0.12 * hash(i, 7));
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy + (hash(i, 3) - 0.5) * 3);
    ctx.stroke();
  }
  // the seam below
  ctx.fillStyle = css(PALETTE.seam, 0.9);
  ctx.fillRect(x, y + h - 2, w, 2);
}

// The jar's glass outline as the current path (caller fills, strokes or
// clips): a flat neck, a curved shoulder, straight sides, a rounded foot.
export function glassBody(ctx, rect, neck = 0.22) {
  const { x, y, w, h } = rect;
  const nx = w * neck;
  const sh = h * 0.22;
  const r = Math.min(w * 0.14, h * 0.2);
  ctx.beginPath();
  ctx.moveTo(x + nx, y);
  ctx.lineTo(x + w - nx, y);
  ctx.bezierCurveTo(x + w - nx, y + sh * 0.6, x + w, y + sh * 0.4, x + w, y + sh);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + sh);
  ctx.bezierCurveTo(x, y + sh * 0.4, x + nx, y + sh * 0.6, x + nx, y);
  ctx.closePath();
}

// The glass streaks: x and w are shares of the body width, a the peak alpha.
export const STREAKS = [{ x: 0.02, w: 0.045, a: 0.26 }, { x: 0.945, w: 0.03, a: 0.16 }];

export function glassHighlights(ctx, rect, neck = 0.22) {
  const { x, y, w, h } = rect;
  ctx.save();
  // cool refraction tint over the whole body
  glassBody(ctx, rect, neck);
  ctx.fillStyle = css(PALETTE.glass, 0.07);
  ctx.fill();
  // rim
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(PALETTE.glass, 0.5);
  ctx.stroke();
  glassBody(ctx, rect, neck);
  ctx.clip();
  // two soft vertical streaks, at the glass edges so no city's skyline sits under one
  const streak = (sx, sw, a) => {
    const g = ctx.createLinearGradient(sx, 0, sx + sw, 0);
    g.addColorStop(0, css(PALETTE.glass, 0));
    g.addColorStop(0.5, css(PALETTE.glass, a));
    g.addColorStop(1, css(PALETTE.glass, 0));
    ctx.fillStyle = g;
    ctx.fillRect(sx, y + h * 0.16, sw, h * 0.62);
  };
  for (const s of STREAKS) streak(x + w * s.x, w * s.w, s.a);
  // a rim ellipse at the neck
  ctx.strokeStyle = css(PALETTE.glass, 0.4);
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + 3, w * (0.5 - neck) , 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function lid(ctx, rect, kind = 'cork') {
  const { x, y, w, h } = rect;
  ctx.save();
  if (kind === 'tin') {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, css(PALETTE.tinDark));
    g.addColorStop(0.35, css(PALETTE.tin));
    g.addColorStop(1, css(PALETTE.tinDark));
    ctx.fillStyle = g;
    ctx.fillRect(x, y + h * 0.2, w, h * 0.8);
    ctx.fillStyle = css(PALETTE.tin);
    ctx.fillRect(x - 4, y, w + 8, h * 0.3);
  } else {
    ctx.fillStyle = css(PALETTE.cork);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.fillStyle = css(PALETTE.corkDark, 0.5);
    for (let i = 0; i < 9; i++) {
      ctx.fillRect(x + 6 + hash(i, 1) * (w - 16), y + 5 + hash(i, 2) * (h - 14), 5, 2);
    }
    ctx.fillStyle = css(PALETTE.corkDark, 0.6);
    ctx.fillRect(x, y + h - 5, w, 5);
  }
  ctx.restore();
}

export function text(ctx, str, x, y, size, colour, align = 'center') {
  ctx.font = `500 ${size}px ${MONO}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if ('fontVariantNumeric' in ctx) ctx.fontVariantNumeric = 'tabular-nums';
  ctx.fillStyle = css(colour);
  ctx.fillText(str, x, y);
}

// A small dark plate with a brass edge and three monospace lines
// ([title, temperature, time]).
export function label(ctx, rect, lines) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.fillStyle = css(PALETTE.plate, 0.88);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(PALETTE.brass, 0.85);
  ctx.stroke();
  const cx = x + w / 2;
  text(ctx, lines[0] ?? '', cx, y + h * 0.22, h * 0.17, PALETTE.labelDim);
  text(ctx, lines[1] ?? '', cx, y + h * 0.52, h * 0.3, PALETTE.labelInk);
  text(ctx, lines[2] ?? '', cx, y + h * 0.82, h * 0.17, PALETTE.labelDim);
  ctx.restore();
}

// A bead of dew on the inside of the glass: a flat disc and a small highlight
// offset toward the light, no gradient. `strength` is its alpha, 0..1.
export function droplet(ctx, x, y, r, strength = 1) {
  if (strength <= 0 || r <= 0) return;
  ctx.fillStyle = css(PALETTE.dew, 0.55 * strength);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(PALETTE.dewHighlight, 0.8 * strength);
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.35, Math.max(0.4, r * 0.32), 0, Math.PI * 2);
  ctx.fill();
}
