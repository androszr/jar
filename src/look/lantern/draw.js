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

// The glass over the diorama: a cool tint, the wall's thickness (a dark band
// inside the outline and a pale inner edge), the lid's shadow on the shoulder,
// a thick base that catches the light, the two edge streaks, a curved highlight
// on the left shoulder with a small hot spot, the rim, and the thread under the
// lid. `opts.shift` slides the highlights sideways by that many px (the viewer
// moved); `opts.glint` 0..1 brightens the rim (a pointer over the jar).
export function glassHighlights(ctx, rect, neck = 0.22, opts = {}) {
  const { x, y, w, h } = rect;
  const shift = Number.isFinite(opts.shift) ? opts.shift : 0;
  const glint = Number.isFinite(opts.glint) ? Math.max(0, Math.min(1, opts.glint)) : 0;
  const nx = w * neck;
  const sh = h * 0.22;
  ctx.save();
  // cool refraction tint over the whole body
  glassBody(ctx, rect, neck);
  ctx.fillStyle = css(PALETTE.glass, 0.07);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // the wall: only the inner half of a wide stroke survives the clip
  glassBody(ctx, rect, neck);
  ctx.lineWidth = 16;
  ctx.strokeStyle = css(PALETTE.glassDark, 0.2);
  ctx.stroke();
  glassBody(ctx, { x: x + 8, y: y + 6, w: w - 16, h: h - 15 }, neck);
  ctx.lineWidth = 1;
  ctx.strokeStyle = css(PALETTE.glass, 0.14);
  ctx.stroke();
  // the lid's shadow falls on the shoulder
  const ls = ctx.createLinearGradient(0, y, 0, y + h * 0.07);
  ls.addColorStop(0, css(PALETTE.shadow, 0.3));
  ls.addColorStop(1, css(PALETTE.shadow, 0));
  ctx.fillStyle = ls;
  ctx.fillRect(x, y, w, h * 0.07);
  // the thick base: a lens of glass that gathers light along its top edge
  const bh = h * 0.05;
  const by = y + h - bh;
  const bg = ctx.createLinearGradient(0, by - 2, 0, y + h);
  bg.addColorStop(0, css(PALETTE.glass, 0.26));
  bg.addColorStop(0.18, css(PALETTE.glass, 0.1));
  bg.addColorStop(1, css(PALETTE.glassDark, 0.3));
  ctx.fillStyle = bg;
  ctx.fillRect(x, by - 2, w, bh + 2);
  const bl = ctx.createLinearGradient(x, 0, x + w, 0);
  bl.addColorStop(0, css(PALETTE.glass, 0));
  bl.addColorStop(0.3 + shift / w, css(PALETTE.glass, 0.5));
  bl.addColorStop(0.7 + shift / w, css(PALETTE.glass, 0.12));
  bl.addColorStop(1, css(PALETTE.glass, 0));
  ctx.fillStyle = bl;
  ctx.fillRect(x + 10, by - 2, w - 20, 1.5);
  // two soft vertical streaks, at the glass edges so no city's skyline sits under one
  const streak = (sx, sw, a) => {
    const g = ctx.createLinearGradient(sx, 0, sx + sw, 0);
    g.addColorStop(0, css(PALETTE.glass, 0));
    g.addColorStop(0.5, css(PALETTE.glass, a));
    g.addColorStop(1, css(PALETTE.glass, 0));
    ctx.fillStyle = g;
    ctx.fillRect(sx, y + h * 0.16, sw, h * 0.62);
  };
  for (const s of STREAKS) streak(x + w * s.x + shift, w * s.w, s.a);
  // the shoulder's curve picks up the lamp: a soft band along it and a hot spot
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = css(PALETTE.glass, 0.2 + 0.14 * glint);
  ctx.beginPath();
  ctx.moveTo(x + nx + 9 + shift, y + sh * 0.2);
  ctx.bezierCurveTo(x + nx + 7 + shift, y + sh * 0.62, x + 15 + shift, y + sh * 0.5, x + 13 + shift, y + sh * 1.05);
  ctx.stroke();
  ctx.fillStyle = css(PALETTE.dewHighlight, 0.3 + 0.2 * glint);
  ctx.beginPath();
  ctx.ellipse(x + w * 0.105 + shift, y + sh * 0.74, 2, 5.5, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // and a fainter answer on the far shoulder
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(PALETTE.glass, 0.1);
  ctx.beginPath();
  ctx.moveTo(x + w - nx - 8 + shift, y + sh * 0.24);
  ctx.bezierCurveTo(x + w - nx - 6 + shift, y + sh * 0.62, x + w - 13 + shift, y + sh * 0.52, x + w - 11 + shift, y + sh * 1.0);
  ctx.stroke();
  ctx.restore();
  // rim
  glassBody(ctx, rect, neck);
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(PALETTE.glass, 0.5 + 0.35 * glint);
  ctx.stroke();
  glassBody(ctx, rect, neck);
  ctx.clip();
  // a rim ellipse at the neck, and the thread the lid screws onto under it
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(PALETTE.glass, 0.4);
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + 3, w * (0.5 - neck), 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (const [ty, a] of [[10, 0.22], [16, 0.13]]) {
    ctx.strokeStyle = css(PALETTE.glass, a);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + ty, w * (0.5 - neck) + 1, 3.5, 0, 0.12, Math.PI - 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

// One cloud as one shape: five lobes filled together (so they never show a
// seam where they overlap), cut flat along the base and shaded darker toward
// it. It spans cx - 1.6r .. cx + 1.8r.
export const CLOUD_LOBES = [[-1.0, 0.1, 0.6, 0.4], [-0.45, -0.14, 0.62, 0.52], [0.2, -0.24, 0.7, 0.6], [0.82, -0.02, 0.62, 0.46], [1.28, 0.14, 0.5, 0.32]];
export function cloud(ctx, cx, cy, r, colour, alpha) {
  if (!(alpha > 0) || !(r > 0)) return;
  const top = cy - r;
  const base = cy + r * 0.34;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 2 * r, top, 4 * r, base - top);
  ctx.clip();
  const g = ctx.createLinearGradient(0, top, 0, base);
  g.addColorStop(0, css(colour, alpha));
  g.addColorStop(0.6, css(colour, alpha));
  g.addColorStop(1, css(mix(colour, PALETTE.shadow, 0.3), alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  for (const [dx, dy, rx, ry] of CLOUD_LOBES) {
    ctx.moveTo(cx + (dx + rx) * r, cy + dy * r);
    ctx.ellipse(cx + dx * r, cy + dy * r, rx * r, ry * r, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

// A lightning bolt along `points` ([[x, y], ...], the main channel first) with
// `forks` (more point lists): a wide soft stroke under a thin bright one.
export function bolt(ctx, points, forks = [], strength = 1) {
  if (!(strength > 0) || !points || points.length < 2) return;
  const trace = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [w, a] of [[7, 0.16], [3.2, 0.4], [1.3, 1]]) {
    ctx.strokeStyle = css(PALETTE.bolt, Math.min(1, a * strength));
    ctx.lineWidth = w;
    trace(points);
    ctx.lineWidth = w * 0.6;
    ctx.strokeStyle = css(PALETTE.bolt, Math.min(1, a * strength * 0.7));
    for (const f of forks) if (f.length > 1) trace(f);
  }
  ctx.restore();
}

// The sun: a pale heart, its own colour, and a soft edge instead of a rim.
export function sunDisc(ctx, x, y, r, strength = 1) {
  if (!(strength > 0)) return;
  const R = r * 1.3;
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, css(mix(PALETTE.sun, PALETTE.grainLight, 0.65), strength));
  g.addColorStop(0.62, css(mix(PALETTE.sun, PALETTE.grainLight, 0.2), strength));
  g.addColorStop(0.82, css(PALETTE.sun, strength * 0.7));
  g.addColorStop(1, css(PALETTE.sun, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
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

// Chalk lettering on the table: a faint dusty off-white with a darker underlay
// and a few deterministic specks. Does nothing at alpha <= 0.
export function chalk(ctx, str, x, y, size, alpha) {
  if (!(alpha > 0)) return;
  ctx.save();
  ctx.font = `500 ${size}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(str).width;
  // A small framed slate, the kind a gardener labels seed trays with, lying
  // on the table a touch askew; the words are chalked on it, not on the wood.
  const bw = w + size * 1.7;
  const bh = size * 1.9;
  ctx.translate(x, y);
  ctx.rotate(-0.035);
  ctx.fillStyle = css(PALETTE.seam, alpha * 0.45);
  ctx.beginPath();
  ctx.roundRect(-bw / 2 + 3, -bh / 2 + 4, bw, bh, 3);
  ctx.fill();
  ctx.fillStyle = css(PALETTE.slateFrame, alpha);
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 3);
  ctx.fill();
  ctx.fillStyle = css(PALETTE.slate, alpha);
  ctx.fillRect(-bw / 2 + 4, -bh / 2 + 4, bw - 8, bh - 8);
  // a few specks of dust, placed by a fixed hash so they never move, whatever the camera does
  ctx.fillStyle = css(PALETTE.chalk, alpha * 0.48);
  ctx.fillText(str, 0, 1);
  ctx.fillStyle = css(PALETTE.chalk, alpha * 0.16);
  for (let i = 0; i < 6; i++) {
    const px = -w / 2 + hash(i, 5) * w;
    const py = -size / 2 + hash(i + 17, 5) * size;
    ctx.fillRect(px, py, 2, 2);
  }
  ctx.restore();
}

// The width chalk lettering takes, so a caller never names a font.
export function chalkWidth(ctx, str, size) {
  ctx.font = `500 ${size}px ${MONO}`;
  return ctx.measureText(str).width;
}

// The size at which str fits in maxW, never below 0.7 of size.
export function fitSize(ctx, str, size, maxW) {
  ctx.font = `500 ${size}px ${MONO}`;
  const width = ctx.measureText(str).width;
  return width <= maxW ? size : Math.max(size * maxW / width, size * 0.7);
}

// A small dark plate with a brass edge and three monospace lines
// ([title, temperature, time]), or four when a swell line follows.
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
  if (lines.length >= 4) {
    // Four lines sit a little tighter than three; the temperature stays the largest.
    text(ctx, lines[0] ?? '', cx, y + h * 0.16, fitSize(ctx, lines[0] ?? '', h * 0.15, w - 16), PALETTE.labelDim);
    text(ctx, lines[1] ?? '', cx, y + h * 0.44, h * 0.27, PALETTE.labelInk);
    text(ctx, lines[2] ?? '', cx, y + h * 0.68, h * 0.15, PALETTE.labelDim);
    text(ctx, lines[3] ?? '', cx, y + h * 0.87, h * 0.15, PALETTE.labelDim);
  } else {
    text(ctx, lines[0] ?? '', cx, y + h * 0.22, fitSize(ctx, lines[0] ?? '', h * 0.17, w - 16), PALETTE.labelDim);
    text(ctx, lines[1] ?? '', cx, y + h * 0.52, h * 0.3, PALETTE.labelInk);
    text(ctx, lines[2] ?? '', cx, y + h * 0.82, h * 0.17, PALETTE.labelDim);
  }
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

// The moon with its real phase: the lit limb is a semicircle (right side while
// waxing, left while waning) closed by the terminator ellipse. One filled path,
// never an erase, so the glow beneath stays whole. `moon` is from moonPhase.
export function moonDisc(ctx, x, y, r, moon, alpha = 1) {
  if (moon.name === 'new') {
    ctx.fillStyle = css(PALETTE.moon, 0.08 * alpha);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const ill = moon.illumination;
  const rx = r * Math.abs(2 * ill - 1);
  const gibbous = ill > 0.5;
  ctx.fillStyle = css(PALETTE.moon, alpha);
  ctx.beginPath();
  if (moon.waxing) {
    ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2);
    if (gibbous) ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, Math.PI * 1.5, false);
    else ctx.ellipse(x, y, rx, r, 0, Math.PI / 2, -Math.PI / 2, true);
  } else {
    ctx.arc(x, y, r, Math.PI / 2, Math.PI * 1.5);
    if (gibbous) ctx.ellipse(x, y, rx, r, 0, Math.PI * 1.5, Math.PI * 2.5, false);
    else ctx.ellipse(x, y, rx, r, 0, Math.PI * 1.5, Math.PI / 2, true);
  }
  ctx.closePath();
  ctx.fill();
}

// The table top: a gradient that brightens with the room's light.
export function tableBoards(ctx, x, y, w, h, lit) {
  const top = ctx.createLinearGradient(0, y, 0, y + h);
  top.addColorStop(0, css(mix(PALETTE.tableEdge, PALETTE.tableTop, 0.4 + lit * 0.4)));
  top.addColorStop(1, css(PALETTE.tableTop));
  ctx.fillStyle = top;
  ctx.fillRect(x, y, w, h);
}

// The table's front face, darkening downward, under a thin lit lip.
export function tableFront(ctx, x, y, w, h) {
  const face = ctx.createLinearGradient(0, y, 0, y + h);
  face.addColorStop(0, css(PALETTE.tableEdge));
  face.addColorStop(1, css(mix(PALETTE.tableEdge, PALETTE.shadow, 0.45)));
  ctx.fillStyle = face;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = css(mix(PALETTE.tableTop, PALETTE.lamp, 0.35), 0.5);
  ctx.fillRect(x, y - 2, w, 3);
}

// A linen curtain gathered at the window's left, hung from a thin rod, in
// soft folds with a scalloped hem. `win` is the pane, `frame` the frame width.
export function curtain(ctx, win, frame, lit) {
  const cTop = win.y - frame - 10;
  const cBot = win.y + win.h + frame + 34;
  const cx0 = win.x - frame - 30;
  const cw = 150;
  const n = 6;
  const linen = mix(PALETTE.linenDark, PALETTE.linenLight, 0.22 + 0.6 * lit);
  ctx.save();
  ctx.fillStyle = css(mix(PALETTE.frame, PALETTE.brass, 0.35));
  ctx.beginPath();
  ctx.roundRect(cx0 - 14, cTop - 8, win.w + 2 * frame + 84, 6, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx0, cTop);
  ctx.lineTo(cx0 + cw, cTop);
  ctx.bezierCurveTo(cx0 + cw + 8, cTop + 160, cx0 + cw - 16, cBot - 140, cx0 + cw - 4, cBot - 6);
  for (let k = 0; k < n; k++) {
    const xa = cx0 + cw - 4 - ((k + 0.5) * (cw - 4)) / n;
    const xb = cx0 + cw - 4 - ((k + 1) * (cw - 4)) / n;
    ctx.quadraticCurveTo(xa, cBot + 9, xb, cBot - 6 + (k % 2 ? 4 : 0));
  }
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = css(linen, 0.96);
  ctx.fillRect(cx0 - 6, cTop, cw + 24, cBot - cTop + 14);
  for (let k = 0; k < n; k++) {
    const fx = cx0 + (k * cw) / n;
    const fw = cw / n + 3;
    const fg = ctx.createLinearGradient(fx, 0, fx + fw, 0);
    fg.addColorStop(0, css(PALETTE.shadow, 0.26));
    fg.addColorStop(0.5, css(PALETTE.linenGlint, 0.09));
    fg.addColorStop(1, css(PALETTE.shadow, 0.04));
    ctx.fillStyle = fg;
    ctx.fillRect(fx, cTop, fw, cBot - cTop + 14);
  }
  const hg = ctx.createLinearGradient(0, cTop, 0, cTop + 26);
  hg.addColorStop(0, css(PALETTE.shadow, 0.3));
  hg.addColorStop(1, css(PALETTE.shadow, 0));
  ctx.fillStyle = hg;
  ctx.fillRect(cx0 - 6, cTop, cw + 24, 26);
  ctx.restore();
}

// The back shelf's vessels as [x, width, height, kind]: 0 flowerpot, 1 jug, 2 crock.
export const SHELF_VESSELS = [[1004, 62, 58, 0], [1096, 74, 84, 1], [1204, 56, 50, 0], [1290, 66, 70, 2], [1392, 70, 60, 0]];

// The back shelf: a rounded board on two curved brackets with a shadow on
// the wall behind it, holding five drawn vessels. Fixed numbers, no hash.
export function backShelf(ctx, lit) {
  ctx.save();
  const ws = ctx.createLinearGradient(0, 432, 0, 474);
  ws.addColorStop(0, css(PALETTE.shadow, 0.32));
  ws.addColorStop(1, css(PALETTE.shadow, 0));
  ctx.fillStyle = ws;
  ctx.fillRect(976, 432, 528, 42);
  ctx.strokeStyle = css(mix(PALETTE.tableEdge, PALETTE.shadow, 0.25));
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  [1050, 1430].forEach((bx) => {
    ctx.beginPath();
    ctx.moveTo(bx, 434);
    ctx.lineTo(bx, 476);
    ctx.moveTo(bx, 472);
    ctx.quadraticCurveTo(bx + 30, 466, bx + 34, 436);
    ctx.stroke();
  });
  SHELF_VESSELS.forEach(([px, pw, ph, kind]) => {
    const by = 420;
    const cxp = px + pw / 2;
    ctx.save();
    ctx.translate(cxp + 6, by);
    ctx.scale(1, 0.12);
    const sg = ctx.createRadialGradient(0, 0, 4, 0, 0, pw * 0.75);
    sg.addColorStop(0, css(PALETTE.shadow, 0.45));
    sg.addColorStop(1, css(PALETTE.shadow, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(-pw, -pw, pw * 2, pw * 2);
    ctx.restore();
    const pg = ctx.createLinearGradient(px, 0, px + pw, 0);
    pg.addColorStop(0, css(mix(PALETTE.pot, PALETTE.lamp, 0.16 + 0.12 * lit)));
    pg.addColorStop(0.45, css(PALETTE.pot));
    pg.addColorStop(1, css(mix(PALETTE.pot, PALETTE.shadow, 0.42)));
    ctx.fillStyle = pg;
    ctx.beginPath();
    if (kind === 1) {
      ctx.moveTo(px + 10, by);
      ctx.bezierCurveTo(px - 12, by - ph * 0.35, px - 2, by - ph * 0.78, cxp - 12, by - ph * 0.86);
      ctx.lineTo(cxp - 12, by - ph);
      ctx.lineTo(cxp + 12, by - ph);
      ctx.lineTo(cxp + 12, by - ph * 0.86);
      ctx.bezierCurveTo(px + pw + 2, by - ph * 0.78, px + pw + 12, by - ph * 0.35, px + pw - 10, by);
    } else if (kind === 2) {
      ctx.moveTo(px + 6, by);
      ctx.quadraticCurveTo(px - 2, by - ph * 0.5, px + 6, by - ph);
      ctx.lineTo(px + pw - 6, by - ph);
      ctx.quadraticCurveTo(px + pw + 2, by - ph * 0.5, px + pw - 6, by);
    } else {
      ctx.moveTo(px + 9, by);
      ctx.quadraticCurveTo(px + 4, by - ph * 0.5, px + 1, by - ph);
      ctx.lineTo(px + pw - 1, by - ph);
      ctx.quadraticCurveTo(px + pw - 4, by - ph * 0.5, px + pw - 9, by);
    }
    ctx.closePath();
    ctx.fill();
    if (kind !== 1) {
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.roundRect(px - 3, by - ph - 5, pw + 6, 12, 5);
      ctx.fill();
      ctx.fillStyle = css(mix(PALETTE.pot, PALETTE.lamp, 0.2), 0.7);
      ctx.beginPath();
      ctx.roundRect(px - 1, by - ph - 4, pw * 0.55, 2, 1);
      ctx.fill();
    } else {
      ctx.strokeStyle = css(mix(PALETTE.pot, PALETTE.shadow, 0.2));
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(px + pw + 2, by - ph * 0.62, 14, -1.2, 1.3);
      ctx.stroke();
    }
  });
  const bg = ctx.createLinearGradient(0, 418, 0, 434);
  bg.addColorStop(0, css(mix(PALETTE.tableTop, PALETTE.tableEdge, 0.25)));
  bg.addColorStop(1, css(mix(PALETTE.tableEdge, PALETTE.shadow, 0.3)));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(972, 418, 536, 16, 5);
  ctx.fill();
  ctx.fillStyle = css(mix(PALETTE.tableTop, PALETTE.lamp, 0.3), 0.45);
  ctx.beginPath();
  ctx.roundRect(976, 418, 528, 2, 1);
  ctx.fill();
  ctx.restore();
}
