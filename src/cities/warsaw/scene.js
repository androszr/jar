// Warsaw in a jar, seen from the Praga bank: Varso and the Palace of Culture and
// Science on the left, the tower cluster (Zlota 44, the InterContinental, Warsaw
// Spire, the Cosmopolitan) to the right, a band of low lit city in front of them,
// the far bank's boulevard with its lamps, the narrow Vistula, then the near bank,
// only forest, with the Swietokrzyski Bridge (bridge.js) leaving the far quay and
// landing in it, and a small Mermaid on the far quay by the bridgehead. The glass is rim-lit on the sun's side by day
// and lit from within by night; the Palace is sandstone by day and floodlit by
// night, white over red on 3 May and 11 November. Every light is scaled by one
// continuous darkness measure (nightAmount), so dusk is a blend, never a switch.
// Shapes were drawn in a 340 x 396 px box (the jar's body) and are shares of it.
import { LAMP_THRESHOLD, osc, clamp, wrap } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { localDate } from '../../placeclock.js';
import { WARSAW } from './palette.js';

// The bands, top to bottom, as shares of the body height.
export const FAR_BANK = 0.575; // the towers stand here
export const RIVER_TOP = 0.64; // the low city runs down to the far quay, the river from here
export const QUAY_TOP = 0.69; // the near bank: forest from here down behind the label plate
export const BOULEVARD = 0.012; // the far bank's paved walk, this tall, just above the river

// The reference box the shapes were drawn in, in px.
const BW = 340;
const BH = 396;

// The six landmarks, left to right: x and hw shares of the width, heights
// shares of the body height above the far bank. `top` (or `mast`, or `h`) is the
// highest point of each.
// Varso keeps clear of the left shoulder of the glass; the cluster sits right of
// the Palace, as it does from across the river.
export const SKYLINE = [
  { id: 'varso', x: 0.235, hw: 0.032, roof: 0.379, crown: 0.449, top: 0.53 },
  { id: 'pkin', x: 0.4, hw: 48 / 340, top: 0.48 },
  { id: 'zlota', x: 0.555, hw: 0.044, h: 0.359 },
  { id: 'intercontinental', x: 0.635, hw: 0.0275, h: 0.298 },
  { id: 'spire', x: 0.72, hw: 0.038, h: 0.396, mast: 0.444 },
  { id: 'cosmopolitan', x: 0.87, hw: 0.0235, h: 0.303 },
];
const TOWER = Object.fromEntries(SKYLINE.map((t) => [t.id, t]));
const summit = (t) => t.top ?? t.mast ?? t.h;

// The low background blocks: centre x, half width (shares of the width), height
// (share of the body height). None starts left of 0.17w: that edge belongs to the
// glass's shoulder and the Mermaid.
export const BACK_ROW = [
  [68, 10, 100], [120, 9, 74], [134, 12, 94], [204, 10, 86], [214, 8, 110], [256, 11, 92], [300, 9, 82], [334, 12, 98],
].map(([x, hw, h]) => ({ x: x / BW, hw: hw / BW, h: h / BH }));

// The low city in front of the towers, down to the far quay: centre x and half
// width (shares of the width), top (share of the body height from the top).
export const FRONT_ROW = Array.from({ length: 30 }, (_, i) => ({
  x: (i + 0.5) / 30 + (hash2(i, 61) - 0.5) * 0.02,
  hw: 0.014 + 0.016 * hash2(i, 62),
  top: RIVER_TOP - 0.042 - 0.05 * hash2(i, 63),
}));

// The Palace, in px of the reference box above the far bank: [half width, top]
// of each mass from the wings up, then the needle's tip. The combs are the rows
// of pinnacles along a setback: [mass index, count, spike height px].
export const PALACE = {
  masses: [[48, 34], [27, 50], [21, 118], [16.5, 127], [11, 143], [6, 152]].map(([hw, top]) => ({ hw: hw / BW, top: top / BH })),
  combs: [[0, 4, 6], [1, 6, 6], [2, 6, 7], [3, 5, 6]],
  clock: 135 / BH, // the clock faces, a share of the body height above the far bank
  needle: 0.48,
};

// The Mermaid: figure base (x of the width, base of the height), unit u (a share
// of the height) and the plinth she stands on, on the far quay, standing on the water's edge.
export const MERMAID = { x: 0.15, base: 0.626, u: 0.055, plinth: { hw: 0.016, top: 0.628, h: 0.012 } };

// The x bands the glass streaks occupy (shares of the width); a copy of the
// look's STREAKS, which test/look.test.js keeps in step.
// The two rim passes of the Mermaid at night, as px offsets (right, then left).
export const RIM_DX = [1.2, -1.2];

export const STREAK_CLEAR = [[0.02, 0.065], [0.945, 0.975]];

export const nightAmount = (light) => clamp((LAMP_THRESHOLD + 0.1 - light) / 0.3);
export const sunSide = (phase) => (wrap(phase) < 0.4 ? -1 : 1);

// day -> dusk -> night, blended by the darkness measure.
export const tone = (day, dusk, night, n) => mix(mix(day, dusk, Math.min(1, n * 2)), night, Math.max(0, n * 2 - 1));

// 3 May and 11 November in Warsaw: the Palace is floodlit white over red.
export function flagDay(nowMs) {
  const d = localDate(nowMs, 'Europe/Warsaw');
  return typeof d === 'string' && (d.endsWith('-05-03') || d.endsWith('-11-11'));
}

// Every pixel box derived from the shares above, for a body of w x h at (ox, oy).
export function layout(w, h, ox = 0, oy = 0) {
  const sx = w / BW;
  const sy = h / BH;
  const gy = oy + h * FAR_BANK;
  const ry = oy + h * RIVER_TOP;
  const qy = oy + h * QUAY_TOP;
  const landmarks = SKYLINE.map((t) => ({ id: t.id, x0: ox + (t.x - t.hw) * w, x1: ox + (t.x + t.hw) * w, top: gy - summit(t) * h }));
  const u = h * MERMAID.u;
  const bx = ox + w * MERMAID.x;
  const by = oy + h * MERMAID.base;
  const pl = MERMAID.plinth;
  return {
    w, h, ox, oy, sx, sy, gy, qy,
    river: { top: ry, bottom: qy },
    quayTop: qy,
    boulevard: ry - h * BOULEVARD,
    landmarks,
    mermaid: { x0: bx - 0.28 * u, x1: bx + 0.31 * u, top: by - 1.07 * u, bottom: by + 0.06 * u, bx, by, u },
    plinth: { x0: ox + w * (MERMAID.x - pl.hw), x1: ox + w * (MERMAID.x + pl.hw), top: oy + h * pl.top, bottom: oy + h * (pl.top + pl.h) },
    // x in px of a share of the width; height above the far bank in px of a share of the height
    X: (share) => ox + share * w,
    Y: (share) => gy - share * h,
  };
}

export function buildPlates(w, h) {
  const lit = [];
  for (let i = 0; i < 160; i++) lit.push(hash2(i, 31));
  return { w, h, lit };
}

// ---- shape tracers: each begins a path on the context; the caller fills ------
const rectPath = (ctx, x0, y0, x1, y1) => {
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0, y1);
  ctx.closePath();
};
const triPath = (ctx, x, base, hw, hh) => {
  ctx.moveTo(x - hw, base);
  ctx.lineTo(x, base - hh);
  ctx.lineTo(x + hw, base);
  ctx.closePath();
};

// The needle alone, from the cupola to the tip.
function traceNeedle(ctx, L) {
  const cx = L.X(TOWER.pkin.x);
  const base = L.gy - PALACE.masses[PALACE.masses.length - 1].top * L.h;
  ctx.beginPath();
  triPath(ctx, cx, base, 2.4 * L.sx, base - (L.gy - PALACE.needle * L.h));
}

// Wings, front block, the tall shaft, crown, clock lantern and cupola, the
// needle, and a comb of pinnacles along each setback.
export function tracePalace(ctx, L) {
  const cx = L.X(TOWER.pkin.x);
  const { sx, sy, gy } = L;
  ctx.beginPath();
  for (const m of PALACE.masses) rectPath(ctx, cx - m.hw * L.w, gy - m.top * L.h, cx + m.hw * L.w, gy);
  const tip = PALACE.masses[PALACE.masses.length - 1].top;
  triPath(ctx, cx, gy - tip * L.h, 2.4 * sx, (PALACE.needle - tip) * L.h);
  for (const [i, n, hh] of PALACE.combs) {
    const m = PALACE.masses[i];
    const hw = m.hw * L.w - 1.5 * sx;
    for (let k = 0; k < n; k++) triPath(ctx, cx - hw + (2 * hw * k) / (n - 1), gy - m.top * L.h, 1.3 * sx, hh * sy);
  }
}

export function traceVarso(ctx, L) {
  const t = TOWER.varso;
  const cx = L.X(t.x);
  const hw = t.hw * L.w;
  ctx.beginPath();
  ctx.moveTo(cx - hw, L.gy);
  ctx.lineTo(cx - hw, L.gy - t.roof * L.h);
  ctx.lineTo(cx - 5 * L.sx, L.gy - t.crown * L.h);
  ctx.lineTo(cx + 5 * L.sx, L.gy - t.crown * L.h);
  ctx.lineTo(cx + hw, L.gy - t.roof * L.h);
  ctx.lineTo(cx + hw, L.gy);
  ctx.closePath();
}

export function traceSpire(ctx, L) {
  const t = TOWER.spire;
  const cx = L.X(t.x);
  const hw = t.hw * L.w;
  const { sx, sy, gy } = L;
  ctx.beginPath();
  ctx.moveTo(cx - hw, gy);
  ctx.lineTo(cx - hw, gy - 150 * sy);
  ctx.lineTo(cx - 4 * sx, gy - t.h * L.h);
  ctx.quadraticCurveTo(cx + hw, gy - 132 * sy, cx + hw, gy - 78 * sy);
  ctx.lineTo(cx + hw, gy);
  ctx.closePath();
}

export function traceZlota(ctx, L) {
  const t = TOWER.zlota;
  const l = L.X(t.x - t.hw);
  const r = L.X(t.x + t.hw);
  const { sx, sy, gy } = L;
  ctx.beginPath();
  ctx.moveTo(l, gy);
  ctx.lineTo(l, gy - t.h * L.h);
  ctx.quadraticCurveTo(l + 20 * sx, gy - 138 * sy, r, gy - 110 * sy);
  ctx.quadraticCurveTo(r + 7 * sx, gy - 56 * sy, r, gy);
  ctx.closePath();
}

export function traceInterContinental(ctx, L) {
  const t = TOWER.intercontinental;
  const l = L.X(t.x - t.hw);
  const r = L.X(t.x + t.hw);
  const { sx, sy, gy } = L;
  ctx.beginPath();
  ctx.moveTo(l, gy - 20 * sy);
  ctx.lineTo(l, gy - t.h * L.h);
  ctx.lineTo(r, gy - t.h * L.h);
  ctx.lineTo(r, gy);
  ctx.lineTo(L.X(t.x) - 3 * sx, gy);
  ctx.lineTo(L.X(t.x) - 3 * sx, gy - 20 * sy);
  ctx.closePath();
}

export function traceCosmopolitan(ctx, L) {
  const t = TOWER.cosmopolitan;
  const l = L.X(t.x - t.hw);
  const r = L.X(t.x + t.hw);
  const { sy, gy } = L;
  ctx.beginPath();
  ctx.moveTo(l, gy);
  ctx.lineTo(l, gy - t.h * L.h);
  ctx.quadraticCurveTo(L.X(t.x), gy - 134 * sy, r, gy - 124 * sy);
  ctx.lineTo(r, gy);
  ctx.closePath();
}

// Snow along the Cosmopolitan's curved top: short caps that follow the roof
// (the curve runs from 120 px at the left, up past 128, to 124 px at the right).
function capCosmopolitan(ctx, L, cap) {
  const t = TOWER.cosmopolitan;
  const l = L.X(t.x - t.hw);
  const wd = 2 * t.hw * L.w;
  const roof = (u) => (1 - u) * (1 - u) * 120 + 2 * u * (1 - u) * 134 + u * u * 124;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const hh = Math.min(roof(i / n), roof((i + 1) / n));
    cap(l + (wd * i) / n, l + (wd * (i + 1)) / n, L.gy - hh * L.sy);
  }
}

export function traceBackRow(ctx, L) {
  ctx.beginPath();
  for (const b of BACK_ROW) rectPath(ctx, L.X(b.x - b.hw), L.gy - b.h * L.h, L.X(b.x + b.hw), L.gy);
}

// Fill `trace` in the rim colour, then in the body colour nudged away from the
// sun, leaving a 1.8 px bright edge on the sun's side.
function rimmed(ctx, trace, L, side, bodyC, rimC, rimAlpha) {
  trace(ctx, L);
  ctx.fillStyle = css(rimC, rimAlpha);
  ctx.fill();
  ctx.save();
  trace(ctx, L);
  ctx.clip();
  ctx.translate(-side * 1.8 * L.sx, 0.6 * L.sy);
  trace(ctx, L);
  ctx.fillStyle = css(bodyC);
  ctx.fill();
  ctx.restore();
}

// Lit floor bands across a tower, seeded so the same tower always shows the same.
function floorBands(ctx, trace, L, t, seed, night) {
  const x0 = L.X(t.x - t.hw);
  const x1 = L.X(t.x + t.hw);
  const top = L.gy - summit(t) * L.h;
  ctx.save();
  trace(ctx, L);
  ctx.clip();
  ctx.lineWidth = 1.3;
  for (let y = L.gy - 4 * L.sy, k = 0; y > top + 3; y -= 4.5 * L.sy, k++) {
    if (hash2(seed, k) > 0.55) continue;
    const a = x0 + (x1 - x0) * hash2(seed + 1, k) * 0.45;
    const b = x1 - (x1 - x0) * hash2(seed + 2, k) * 0.45;
    ctx.strokeStyle = css(WARSAW.floorBand, 0.5 * night * (0.55 + 0.45 * hash2(seed + 3, k)));
    ctx.beginPath();
    ctx.moveTo(a, y);
    ctx.lineTo(b, y);
    ctx.stroke();
  }
  ctx.restore();
}

// Lit windows scattered over the background blocks.
function windowDots(ctx, trace, L, night) {
  ctx.save();
  trace(ctx, L);
  ctx.clip();
  ctx.fillStyle = css(WARSAW.backWindow, 0.85 * night);
  let k = 0;
  for (let y = L.gy - 110 * L.sy; y < L.gy - 3; y += 5 * L.sy) {
    for (let x = L.X(0.17); x < L.X(1); x += 4 * L.sx, k++) {
      if (hash2(7, k) > 0.07) continue;
      ctx.fillRect(x, y, 1.8 * L.sx, 2.2 * L.sy);
    }
  }
  ctx.restore();
}

export function drawSkyline(ctx, rect, phase, tint, plates, weather, nowMs) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = nightAmount(tint.light);
  const side = sunSide(phase);
  const snow = weather && weather.kind === 'snow';
  const bodyC = tone(WARSAW.silhouetteDay, WARSAW.silhouetteDusk, WARSAW.silhouetteNight, night);
  const rimC = tone(WARSAW.rimDay, WARSAW.rimDusk, WARSAW.rimNight, night);
  const rimAlpha = 0.95 * (1 - night) + 0.35 * night;
  const cap = (x0, x1, yTop) => {
    if (!snow) return;
    ctx.fillStyle = css(WARSAW.snowCap);
    ctx.fillRect(x0, yTop, x1 - x0, 3); // sits on the roof line, never above it
  };
  const cx = (id) => L.X(TOWER[id].x);

  // the background blocks, hazed toward the sky, with a few lit windows
  traceBackRow(ctx, L);
  const backC = tone(WARSAW.backBlockDay, WARSAW.silhouetteDusk, WARSAW.silhouetteNight, night);
  ctx.fillStyle = css(mix(backC, tint.skyLow, 0.25));
  ctx.fill();
  if (night > 0) windowDots(ctx, traceBackRow, L, night);

  // the glass towers, rim-lit on the sun's side
  rimmed(ctx, traceCosmopolitan, L, side, bodyC, rimC, rimAlpha);
  rimmed(ctx, traceVarso, L, side, bodyC, rimC, rimAlpha);
  rimmed(ctx, traceInterContinental, L, side, bodyC, rimC, rimAlpha);
  rimmed(ctx, traceSpire, L, side, bodyC, rimC, rimAlpha);
  rimmed(ctx, traceZlota, L, side, bodyC, rimC, rimAlpha);

  // masts: Varso's needle, the Spire's antenna
  const vs = TOWER.varso;
  const sp = TOWER.spire;
  ctx.strokeStyle = css(bodyC);
  ctx.lineWidth = 1.6 * L.sx;
  ctx.beginPath();
  ctx.moveTo(cx('varso'), L.Y(vs.crown));
  ctx.lineTo(cx('varso'), L.Y(vs.top));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx('spire') - 8 * L.sx, L.gy - 153 * L.sy);
  ctx.lineTo(cx('spire') - 8 * L.sx, L.Y(sp.mast));
  ctx.stroke();

  if (night > 0) {
    // Varso's crown, blue, and the red aviation light at the tip of its needle
    ctx.save();
    traceVarso(ctx, L);
    ctx.clip();
    const g = ctx.createLinearGradient(0, L.Y(vs.crown), 0, L.Y(vs.roof) + 6 * L.sy);
    g.addColorStop(0, css(WARSAW.crownTop, 0.95 * night));
    g.addColorStop(1, css(WARSAW.crownBase, 0.5 * night));
    ctx.fillStyle = g;
    ctx.fillRect(L.ox, L.Y(vs.crown), L.w, (vs.crown - vs.roof) * L.h + 6 * L.sy);
    ctx.restore();
    glow(ctx, cx('varso'), L.gy - 166 * L.sy, 26 * L.sx, WARSAW.crownGlow, 0.5 * night);
    ctx.fillStyle = css(WARSAW.aviation, night);
    ctx.beginPath();
    ctx.arc(cx('varso'), L.Y(vs.top), 2 * L.sx, 0, Math.PI * 2);
    ctx.fill();
    glow(ctx, cx('varso'), L.Y(vs.top), 6 * L.sx, WARSAW.aviationGlow, 0.8 * night);

    // the Spire's thin white edge
    ctx.strokeStyle = css(WARSAW.spireEdge, 0.9 * night);
    ctx.lineWidth = 1.2 * L.sx;
    ctx.beginPath();
    ctx.moveTo(cx('spire') - 4 * L.sx, L.Y(sp.h));
    ctx.quadraticCurveTo(L.X(sp.x + sp.hw), L.gy - 132 * L.sy, L.X(sp.x + sp.hw), L.gy - 78 * L.sy);
    ctx.stroke();

    // Zlota's sail, in diagonal streaks of light
    const zl = TOWER.zlota;
    ctx.save();
    traceZlota(ctx, L);
    ctx.clip();
    ctx.strokeStyle = css(WARSAW.sailStreak, 0.55 * night);
    ctx.lineWidth = 0.9 * L.sx;
    for (let i = -8; i < 12; i++) {
      const sx0 = L.X(zl.x - zl.hw) + i * 6 * L.sx;
      ctx.beginPath();
      ctx.moveTo(sx0, L.gy - 150 * L.sy);
      ctx.lineTo(sx0 + 30 * L.sx, L.gy - 105 * L.sy);
      ctx.stroke();
    }
    ctx.restore();

    floorBands(ctx, traceInterContinental, L, TOWER.intercontinental, 91, night);
    floorBands(ctx, traceCosmopolitan, L, TOWER.cosmopolitan, 47, night);
  }

  // the Palace: sandstone by day with its shade side away from the sun, ribs at
  // every hour, floodlit by night (white over red on the flag days)
  const px = cx('pkin');
  const day = 1 - night;
  tracePalace(ctx, L);
  ctx.fillStyle = css(tone(WARSAW.stoneDay, WARSAW.stoneDusk, WARSAW.silhouetteNight, night));
  ctx.fill();
  ctx.save();
  tracePalace(ctx, L);
  ctx.clip();
  if (day > 0) {
    ctx.fillStyle = css(WARSAW.stoneShade, 0.6 * day);
    if (side < 0) ctx.fillRect(px + 2 * L.sx, L.oy, L.w, L.h);
    else ctx.fillRect(L.ox, L.oy, px - 2 * L.sx - L.ox, L.h);
  }
  if (night > 0) {
    if (flagDay(nowMs)) {
      const split = L.gy - 70 * L.sy;
      ctx.fillStyle = css(WARSAW.flagWhite, 0.95 * night);
      ctx.fillRect(L.ox, L.oy, L.w, split - L.oy);
      ctx.fillStyle = css(WARSAW.flagRed, 0.95 * night);
      ctx.fillRect(L.ox, split, L.w, L.gy - split);
    } else {
      const g = ctx.createLinearGradient(0, L.gy, 0, L.Y(PALACE.masses[4].top));
      g.addColorStop(0, css(WARSAW.floodTop, 0.98 * night));
      g.addColorStop(0.55, css(WARSAW.floodMid, 0.72 * night));
      g.addColorStop(1, css(WARSAW.floodFoot, 0.35 * night));
      ctx.fillStyle = g;
      ctx.fillRect(L.ox, L.oy, L.w, L.h);
    }
  }
  // the ribs: pilasters up the shaft and across the front block
  ctx.strokeStyle = css(mix(WARSAW.stoneRib, WARSAW.palaceJoint, night), 0.55 * day + 0.35 * night);
  ctx.lineWidth = 0.9 * L.sx;
  const ribs = (hw, step, y0, y1) => {
    for (let x = px - hw * L.sx; x <= px + hw * L.sx + 0.01; x += step * L.sx) {
      ctx.beginPath();
      ctx.moveTo(x, L.gy - y1 * L.sy);
      ctx.lineTo(x, L.gy - y0 * L.sy);
      ctx.stroke();
    }
  };
  ribs(19, 4.2, 52, 116);
  ribs(25, 5, 3, 47);
  ribs(9, 4.5, 129, 141);
  ctx.restore();
  // the brass needle, with a glint on the sun's side by day
  traceNeedle(ctx, L);
  ctx.fillStyle = css(tone(WARSAW.needleDay, WARSAW.needleDay, WARSAW.needleNight, night));
  ctx.fill();
  if (day > 0) {
    ctx.fillStyle = css(WARSAW.needleGlint, 0.9 * day);
    ctx.beginPath();
    ctx.arc(px + side * 0.8 * L.sx, L.Y(PALACE.needle) + 14 * L.sy, 1.1 * L.sx, 0, Math.PI * 2);
    ctx.fill();
  }
  if (night > 0) glow(ctx, px, L.gy - L.h * 0.16, L.w * 0.2, flagDay(nowMs) ? WARSAW.flagWhite : WARSAW.floodGlow, 0.4 * night);
  // two clock faces, either side of the lantern's corner
  const clockY = L.Y(PALACE.clock);
  for (const s of [-1, 1]) {
    ctx.fillStyle = css(mix(mix(WARSAW.stoneDay, WARSAW.clockFace, 0.6), WARSAW.clockFace, night));
    ctx.beginPath();
    ctx.arc(px + s * 5 * L.sx, clockY, 2.2 * L.sx, 0, Math.PI * 2);
    ctx.fill();
  }
  if (night > 0) glow(ctx, px, clockY, 12 * L.sx, WARSAW.clockGlow, 0.6 * night);

  // the low city in front: each block its own façade (plaster, brick, concrete),
  // hazed a little toward the sky, a grid of windows by day, lit ones at night
  FRONT_ROW.forEach((b, i) => {
    const x0 = L.X(b.x - b.hw);
    const x1 = L.X(b.x + b.hw);
    const top = L.oy + b.top * L.h;
    const day = WARSAW.facades[Math.floor(hash2(i, 64) * WARSAW.facades.length)];
    const shade = mix(day, WARSAW.carpetDay, 0.35 * hash2(i, 65)); // some stand in shade
    ctx.fillStyle = css(mix(tone(shade, WARSAW.carpetDusk, WARSAW.carpetNight, night), tint.skyLow, 0.1));
    ctx.fillRect(x0, top, x1 - x0, L.river.top - top);
    if (night < 1) {
      ctx.fillStyle = css(WARSAW.facadeWindow, 0.35 * (1 - night));
      for (let y = top + 2.5 * L.sy; y < L.river.top - 2 * L.sy; y += 3.4 * L.sy) {
        for (let x = x0 + 1.5 * L.sx; x < x1 - 2 * L.sx; x += 3 * L.sx) ctx.fillRect(x, y, 1.4 * L.sx, 1.5 * L.sy);
      }
    }
  });
  if (night > 0) {
    ctx.fillStyle = css(WARSAW.backWindow, 0.9 * night);
    FRONT_ROW.forEach((b, i) => {
      const x0 = L.X(b.x - b.hw);
      const wd = 2 * b.hw * L.w;
      const top = L.oy + b.top * L.h;
      for (let k = 0; k < 5; k++) {
        if (hash2(i, 70 + k) > 0.55) continue;
        ctx.fillRect(x0 + 1.5 * L.sx + hash2(k, 71 + i) * (wd - 3.5 * L.sx), top + 2 * L.sy + hash2(i + 40, k) * (L.river.top - top - 4 * L.sy), 1.5 * L.sx, 1.7 * L.sy);
      }
    });
  }

  // snow on every roof and every setback
  if (snow) {
    for (const lm of L.landmarks) {
      if (lm.id === 'pkin') continue;
      if (lm.id === 'varso') cap(cx('varso') - 5 * L.sx, cx('varso') + 5 * L.sx, L.Y(vs.crown));
      else if (lm.id === 'spire') cap(lm.x0, cx('spire') - 4 * L.sx, L.gy - 150 * L.sy); // the left shoulder only
      else if (lm.id === 'zlota') cap(lm.x0, lm.x0 + 0.2 * (lm.x1 - lm.x0), L.gy - 139 * L.sy); // the high left corner, below the curve's fall
      else if (lm.id === 'cosmopolitan') capCosmopolitan(ctx, L, cap);
      else cap(lm.x0, lm.x1, lm.top);
    }
    PALACE.masses.slice(0, 5).forEach((m) => cap(px - m.hw * L.w, px + m.hw * L.w, L.gy - m.top * L.h));
    for (const b of FRONT_ROW) cap(L.X(b.x - b.hw), L.X(b.x + b.hw), L.oy + b.top * L.h);
  }
}

export function drawRiver(ctx, rect, phase, tint, weather, nowMs) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = nightAmount(tint.light);
  const top = L.river.top;
  const bottom = L.river.bottom;
  const wet = weather && (weather.kind === 'rain' || weather.kind === 'drizzle' || weather.kind === 'storm' || weather.kind === 'fog');
  let colour = tone(WARSAW.riverDay, WARSAW.riverNight, WARSAW.riverDeep, night);
  if (wet) colour = mix(colour, WARSAW.dull, 0.35 * clamp(tint.light + 0.2));
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, css(mix(colour, tint.skyLow, 0.15)));
  g.addColorStop(1, css(colour));
  ctx.fillStyle = g;
  ctx.fillRect(L.ox, top, L.w, bottom - top);
  // ripples, a function of the phase so they loop with the day
  ctx.strokeStyle = css(mix(mix(colour, tint.skyLow, 0.6), WARSAW.rimNight, 0.5 * night), 0.5 + 0.2 * night);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const ry = top + 6 + i * ((bottom - top - 8) / 3);
    const shift = osc(phase, 6, i * 0.13) * 8;
    ctx.beginPath();
    ctx.moveTo(L.ox + 14 + shift + hash2(i, 41) * 40, ry);
    ctx.lineTo(L.ox + L.w * (0.3 + 0.4 * hash2(i, 42)) + shift, ry);
    ctx.stroke();
  }
  // at night, one long shimmering reflection under each lit tower, in its colour
  if (night > 0) {
    const reflect = (x, wid, c, a, seed) => {
      const n = Math.max(1, Math.floor((bottom - top - 4) / (3 * L.sy)));
      for (let i = 0; i < n; i++) {
        const y = top + 2 + i * 3 * L.sy;
        const j = (hash2(seed, i) - 0.5) * wid * 0.6 + osc(phase, 8, i * 0.2) * 2;
        const bw = wid * (0.5 + 0.5 * hash2(seed + 1, i));
        ctx.fillStyle = css(c, a * night * (1 - i / (n + 3)));
        ctx.fillRect(x - bw / 2 + j, y, bw, 3 * L.sy);
      }
    };
    reflect(L.X(TOWER.pkin.x), 40 * L.sx, flagDay(nowMs) ? WARSAW.flagRed : WARSAW.reflectPalace, 0.85, 20);
    reflect(L.X(TOWER.varso.x), 12 * L.sx, WARSAW.reflectVarso, 0.75, 30);
    reflect(L.X(TOWER.spire.x) + 6 * L.sx, 8 * L.sx, WARSAW.reflectSpire, 0.6, 40);
    reflect(L.X(TOWER.zlota.x), 10 * L.sx, WARSAW.reflectZlota, 0.45, 50);
  }
  drawBoulevard(ctx, L, tint, night, weather);
  drawNearBank(ctx, L, phase, night, weather);
}

// The far bank's boulevard: a paved walk along the water under the low city,
// its quay edge, and lamp posts that come on at dusk.
function drawBoulevard(ctx, L, tint, night, weather) {
  const snow = weather && weather.kind === 'snow';
  const top = L.river.top;
  const walk = L.boulevard;
  ctx.fillStyle = css(snow ? mix(WARSAW.snowCap, WARSAW.boulevardNight, 0.6 * night + 0.05) : mix(tone(WARSAW.boulevardDay, WARSAW.boulevardNight, WARSAW.boulevardNight, night), tint.skyLow, 0.1));
  ctx.fillRect(L.ox, walk, L.w, top - walk);
  ctx.fillStyle = css(mix(tone(WARSAW.quayDay, WARSAW.quayNight, WARSAW.quayDeep, night), tint.skyLow, 0.6));
  ctx.fillRect(L.ox, top - 1.2 * L.sy, L.w, 1.2 * L.sy);
  for (let x = L.ox + 9 * L.sx; x < L.ox + L.w; x += 18 * L.sx) {
    ctx.fillStyle = css(tone(WARSAW.quayDay, WARSAW.quayNight, WARSAW.quayDeep, night));
    ctx.fillRect(x, walk - 4.5 * L.sy, 0.7 * L.sx, 4.5 * L.sy + 1);
    if (night > 0) {
      ctx.fillStyle = css(WARSAW.quayLamp, 0.9 * night);
      ctx.fillRect(x - 0.4 * L.sx, walk - 5.6 * L.sy, 1.5 * L.sx, 1.4 * L.sy);
      glow(ctx, x, walk - 4 * L.sy, 6 * L.sx, WARSAW.quayLamp, 0.3 * night);
    }
  }
}

// The near (Praga) bank: no wall and no path, only the riverside forest, its
// jagged canopy running straight down to the water.
function drawNearBank(ctx, L, phase, night, weather) {
  const snow = weather && weather.kind === 'snow';
  const bottom = L.oy + L.h;
  const treeTop = (k) => L.quayTop + (hash2(k, 90) * 5 - 1 - 3 * Math.sin(k * 0.9)) * L.sy;
  const step = 7 * L.sx;
  const n = Math.ceil(L.w / step) + 1;
  // the water runs under the trees' edge, so no gap of ground shows between them
  ctx.beginPath();
  ctx.moveTo(L.ox, bottom);
  for (let k = 0; k <= n; k++) ctx.lineTo(L.ox + k * step, treeTop(k));
  ctx.lineTo(L.ox + L.w, bottom);
  ctx.closePath();
  ctx.fillStyle = css(tone(WARSAW.treeDay, WARSAW.treeDusk, WARSAW.treeNight, night));
  ctx.fill();
  if (snow) {
    ctx.fillStyle = css(mix(WARSAW.snowCap, WARSAW.treeNight, 0.5 * night + 0.05));
    for (let k = 0; k <= n; k++) ctx.fillRect(L.ox + k * step - 2.5 * L.sx, treeTop(k) - 1, 5 * L.sx, 2 * L.sy);
  }
}

// The Mermaid of Warsaw: sword raised, round shield on her arm, tail coiled, on a
// plinth on the far (left) bank's quay, beside the bridgehead. `c` is a css colour string.
function figure(ctx, bx, by, u, c, shieldDot) {
  const P = (dx, dy) => [bx + dx * u, by + dy * u];
  const move = (dx, dy) => ctx.moveTo(...P(dx, dy));
  const line = (dx, dy) => ctx.lineTo(...P(dx, dy));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  const tail = [[0.0, -0.4], [0.1, -0.29], [0.06, -0.16], [-0.1, -0.09], [-0.15, -0.01], [0.02, 0.02], [0.17, -0.04]];
  for (let i = 0; i < tail.length - 1; i++) {
    ctx.lineWidth = u * (0.13 - i * 0.016);
    ctx.beginPath();
    move(...tail[i]);
    line(...tail[i + 1]);
    ctx.stroke();
  }
  ctx.beginPath(); // the fluke
  move(0.15, -0.03); line(0.29, -0.13); line(0.24, -0.03); line(0.31, 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // the torso
  move(-0.05, -0.4); line(0.06, -0.4); line(0.075, -0.66); line(-0.075, -0.66);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // the head
  ctx.arc(...P(0, -0.735), u * 0.058, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // her hair
  move(-0.03, -0.78); line(-0.12, -0.7); line(-0.04, -0.69);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = u * 0.04; // the sword arm
  ctx.beginPath();
  move(0.06, -0.64); line(0.13, -0.79); line(0.08, -0.92);
  ctx.stroke();
  ctx.lineWidth = u * 0.022; // the blade, curving over her head
  ctx.beginPath();
  move(0.08, -0.93);
  ctx.quadraticCurveTo(...P(0.0, -1.06), ...P(-0.13, -1.04));
  ctx.stroke();
  ctx.lineWidth = u * 0.04; // the shield arm and the shield
  ctx.beginPath();
  move(-0.06, -0.62); line(-0.14, -0.56);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(...P(-0.18, -0.55), u * 0.1, 0, Math.PI * 2);
  ctx.fill();
  if (shieldDot) {
    ctx.fillStyle = shieldDot;
    ctx.beginPath();
    ctx.arc(...P(-0.18, -0.55), u * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawMermaid(ctx, rect, phase, tint, weather) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = nightAmount(tint.light);
  const snow = weather && weather.kind === 'snow';
  const { mermaid: m, plinth: p } = L;
  const hw = (p.x1 - p.x0) / 2;
  const cx = (p.x0 + p.x1) / 2;

  ctx.fillStyle = css(mix(WARSAW.plinthDay, WARSAW.plinthNight, night));
  ctx.fillRect(cx - hw + 1 * L.sx, p.top, 2 * hw - 4 * L.sx, p.bottom - p.top);
  ctx.fillStyle = css(mix(WARSAW.plinthCapDay, WARSAW.plinthCapNight, night));
  ctx.fillRect(cx - hw, p.top - 1.5, 2 * hw, 2);
  if (snow) {
    ctx.fillStyle = css(WARSAW.snowCap);
    ctx.fillRect(cx - hw, p.top - 3, 2 * hw, 2);
  }
  if (night > 0) glow(ctx, cx, p.top, 12 * L.sx, WARSAW.floodGlow, 0.3 * night);

  const body = tone(WARSAW.mermaidDay, WARSAW.mermaidDay, WARSAW.mermaidNight, night);
  if (night > 0) {
    // a warm outline on both sides, so she reads against the dark tower behind her
    for (const dx of RIM_DX) {
      ctx.save();
      ctx.translate(dx, -0.6);
      figure(ctx, m.bx, m.by, m.u, css(WARSAW.mermaidRim, night), null);
      ctx.restore();
    }
  }
  figure(ctx, m.bx, m.by, m.u, css(body), css(mix(body, WARSAW.clockFace, 0.18)));
}
