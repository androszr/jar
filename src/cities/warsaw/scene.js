// Warsaw in a jar, as a floodlit poster: the downtown cluster (Varso Tower, the
// Palace of Culture and Science, Warsaw Spire, Zlota 44, the InterContinental
// and the Cosmopolitan) as flat silhouettes rim-lit on the sun's side by day and
// lit from within by night, the Vistula in front of them above the label plate,
// and the Mermaid on her plinth on the left bank. Every light is scaled by one
// continuous darkness measure (nightAmount), so dusk is a blend, never a switch.
// Shapes were drawn in a 340 x 396 px box (the jar's body) and are shares of it.
import { LAMP_THRESHOLD, osc, clamp, wrap } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { WARSAW } from './palette.js';

export const FAR_BANK = 0.6; // the skyline stands here; the river runs FAR_BANK..QUAY_TOP
export const QUAY_TOP = 0.7; // the quay (and the Mermaid's plinth) from here down

// The reference box the shapes were drawn in, in px.
const BW = 340;
const BH = 396;

// The six landmarks, left to right: x and hw shares of the width, heights
// shares of the body height above the far bank. `top` (or `mast`, or `h`) is the
// highest point of each.
export const SKYLINE = [
  { id: 'cosmopolitan', x: 0.141, hw: 0.0235, h: 0.303 },
  { id: 'varso', x: 0.271, hw: 0.032, roof: 0.379, crown: 0.449, top: 0.53 },
  { id: 'pkin', x: 0.5, hw: 0.188, base: 0.061, tiers: 0.394, top: 0.475 },
  { id: 'spire', x: 0.694, hw: 0.038, h: 0.396, mast: 0.444 },
  { id: 'zlota', x: 0.82, hw: 0.044, h: 0.359 },
  { id: 'intercontinental', x: 0.9125, hw: 0.0275, h: 0.298 },
];
const TOWER = Object.fromEntries(SKYLINE.map((t) => [t.id, t]));
const summit = (t) => t.top ?? t.mast ?? t.h;

// The low background blocks: centre x, half width (shares of the width), height
// (share of the body height). None starts left of 0.17w: that edge belongs to the
// Cosmopolitan and the Mermaid.
export const BACK_ROW = [
  [68, 10, 100], [120, 9, 74], [134, 12, 94], [204, 10, 86], [214, 8, 110], [256, 11, 92], [300, 9, 82], [334, 12, 98],
].map(([x, hw, h]) => ({ x: x / BW, hw: hw / BW, h: h / BH }));

// The Palace: its stepped tiers (half width, height), the wing ornaments, the
// clock and where the floodlight gradient ends.
export const PALACE = {
  tiers: [[30, 92], [24, 108], [18, 122], [13, 134], [9, 146], [5, 156]].map(([hw, h]) => ({ hw: hw / BW, top: h / BH })),
  ornaments: [0.118, 0.165],
  clock: 0.247, // the clock face, a share of the body height from the top
  floodTop: 0.394,
};

// The Mermaid: figure base (x of the width, base of the height), unit u (a share
// of the height) and the plinth she stands on.
export const MERMAID = { x: 0.13, base: 0.662, u: 0.17, plinth: { hw: 0.05, top: 0.664, h: 0.076 } };

// The x bands the glass streaks occupy (shares of the width); a copy of the
// look's STREAKS, which test/look.test.js keeps in step.
// The two rim passes of the Mermaid at night, as px offsets (right, then left).
export const RIM_DX = [1.2, -1.2];

export const STREAK_CLEAR = [[0.02, 0.065], [0.945, 0.975]];

export const nightAmount = (light) => clamp((LAMP_THRESHOLD + 0.1 - light) / 0.3);
export const sunSide = (phase) => (wrap(phase) < 0.4 ? -1 : 1);

// day -> dusk -> night, blended by the darkness measure.
const tone = (day, dusk, night, n) => mix(mix(day, dusk, Math.min(1, n * 2)), night, Math.max(0, n * 2 - 1));

// Every pixel box derived from the shares above, for a body of w x h at (ox, oy).
export function layout(w, h, ox = 0, oy = 0) {
  const sx = w / BW;
  const sy = h / BH;
  const gy = oy + h * FAR_BANK;
  const qy = oy + h * QUAY_TOP;
  const landmarks = SKYLINE.map((t) => ({ id: t.id, x0: ox + (t.x - t.hw) * w, x1: ox + (t.x + t.hw) * w, top: gy - summit(t) * h }));
  const u = h * MERMAID.u;
  const bx = ox + w * MERMAID.x;
  const by = oy + h * MERMAID.base;
  const pl = MERMAID.plinth;
  return {
    w, h, ox, oy, sx, sy, gy, qy,
    river: { top: gy, bottom: qy },
    quayTop: qy,
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

export function tracePalace(ctx, L) {
  const t = TOWER.pkin;
  const cx = L.X(t.x);
  const { sx, sy, gy } = L;
  ctx.beginPath();
  rectPath(ctx, cx - t.hw * L.w, gy - t.base * L.h, cx + t.hw * L.w, gy);
  PALACE.tiers.forEach((tier, i) => {
    rectPath(ctx, cx - tier.hw * L.w, gy - tier.top * L.h, cx + tier.hw * L.w, gy);
    if (i < 4) {
      for (const s of [-1, 1]) triPath(ctx, cx + s * (tier.hw * L.w - 2 * sx), gy - tier.top * L.h, 2.5 * sx, 9 * sy);
    }
  });
  triPath(ctx, cx, gy - t.tiers * L.h, 4 * sx, (t.top - t.tiers) * L.h);
  for (const o of PALACE.ornaments) {
    for (const s of [-1, 1]) {
      const ox = cx + s * o * L.w;
      rectPath(ctx, ox - 4 * sx, gy - 38 * sy, ox + 4 * sx, gy - 24 * sy);
      triPath(ctx, ox, gy - 38 * sy, 5 * sx, 10 * sy);
    }
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

export function drawSkyline(ctx, rect, phase, tint, plates, weather) {
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
  ctx.fillStyle = css(mix(bodyC, tint.skyLow, 0.42));
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

  // the Palace: a rim-lit silhouette by day, floodlit gold by night
  const pk = TOWER.pkin;
  const px = cx('pkin');
  rimmed(ctx, tracePalace, L, side, bodyC, rimC, rimAlpha);
  if (night > 0) {
    ctx.save();
    tracePalace(ctx, L);
    ctx.clip();
    const g = ctx.createLinearGradient(0, L.gy, 0, L.Y(PALACE.floodTop));
    g.addColorStop(0, css(WARSAW.floodTop, 0.98 * night));
    g.addColorStop(0.55, css(WARSAW.floodMid, 0.72 * night));
    g.addColorStop(1, css(WARSAW.floodFoot, 0.35 * night));
    ctx.fillStyle = g;
    ctx.fillRect(L.ox, L.oy, L.w, L.h);
    ctx.strokeStyle = css(WARSAW.palaceJoint, 0.35 * night);
    ctx.lineWidth = 1.1 * L.sx;
    for (let x = px - 28 * L.sx; x < px + 30 * L.sx; x += 3.5 * L.sx) {
      ctx.beginPath();
      ctx.moveTo(x, L.gy - 130 * L.sy);
      ctx.lineTo(x, L.gy - 26 * L.sy);
      ctx.stroke();
    }
    ctx.restore();
    glow(ctx, px, L.gy - L.h * 0.18, L.w * 0.2, WARSAW.floodGlow, 0.45 * night);
  }
  // the clock: a rim-coloured dot by day, a lit face by night
  const clockY = L.oy + PALACE.clock * L.h;
  if (night < 1) {
    ctx.fillStyle = css(rimC, 1 - night);
    ctx.beginPath();
    ctx.arc(px, clockY, 3 * L.sx, 0, Math.PI * 2);
    ctx.fill();
  }
  if (night > 0) {
    ctx.fillStyle = css(WARSAW.clockFace, night);
    ctx.beginPath();
    ctx.arc(px, clockY, 3.6 * L.sx, 0, Math.PI * 2);
    ctx.fill();
    glow(ctx, px, clockY, 14 * L.sx, WARSAW.clockGlow, 0.7 * night);
  }

  // snow on every roof
  if (snow) {
    for (const lm of L.landmarks) {
      if (lm.id === 'pkin') continue;
      if (lm.id === 'varso') cap(cx('varso') - 5 * L.sx, cx('varso') + 5 * L.sx, L.Y(vs.crown));
      else if (lm.id === 'spire') cap(lm.x0, cx('spire') - 4 * L.sx, L.gy - 150 * L.sy); // the left shoulder only
      else if (lm.id === 'zlota') cap(lm.x0, lm.x0 + 0.2 * (lm.x1 - lm.x0), L.gy - 139 * L.sy); // the high left corner, below the curve's fall
      else if (lm.id === 'cosmopolitan') capCosmopolitan(ctx, L, cap);
      else cap(lm.x0, lm.x1, lm.top);
    }
    cap(px - 64 * L.sx, px + 64 * L.sx, L.gy - pk.base * L.h);
    PALACE.tiers.slice(0, 4).forEach((t) => cap(px - t.hw * L.w, px + t.hw * L.w, L.gy - t.top * L.h));
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
  g.addColorStop(0, css(mix(colour, tint.skyLow, 0.35)));
  g.addColorStop(1, css(colour));
  ctx.fillStyle = g;
  ctx.fillRect(L.ox, top, L.w, bottom - top);
  // ripples, a function of the phase so they loop with the day
  ctx.strokeStyle = css(mix(colour, tint.skyLow, 0.6), 0.5);
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
    reflect(L.X(TOWER.pkin.x), 40 * L.sx, WARSAW.reflectPalace, 0.85, 20);
    reflect(L.X(TOWER.varso.x), 12 * L.sx, WARSAW.reflectVarso, 0.75, 30);
    reflect(L.X(TOWER.spire.x) + 6 * L.sx, 8 * L.sx, WARSAW.reflectSpire, 0.6, 40);
    reflect(L.X(TOWER.zlota.x), 10 * L.sx, WARSAW.reflectZlota, 0.45, 50);
  }
  // the quay, with a rim line at its edge
  const quay = tone(WARSAW.quayDay, WARSAW.quayNight, WARSAW.quayDeep, night);
  ctx.fillStyle = css(quay);
  ctx.fillRect(L.ox, L.quayTop, L.w, L.oy + L.h - L.quayTop);
  ctx.fillStyle = css(mix(quay, tint.skyLow, 0.5));
  ctx.fillRect(L.ox, L.quayTop, L.w, 1.5);
}

// The Mermaid of Warsaw: sword raised, round shield on her arm, tail coiled, on a
// plinth on the left bank. `c` is a css colour string.
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
  ctx.fillRect(cx - hw + 2 * L.sx, p.top, 2 * hw - 4 * L.sx, p.bottom - p.top);
  ctx.fillStyle = css(mix(WARSAW.plinthCapDay, WARSAW.plinthCapNight, night));
  ctx.fillRect(cx - hw, p.top - 3, 2 * hw, 4);
  if (snow) {
    ctx.fillStyle = css(WARSAW.snowCap);
    ctx.fillRect(cx - hw, p.top - 5, 2 * hw, 4);
  }
  if (night > 0) glow(ctx, cx, p.top, 46 * L.sx, WARSAW.floodGlow, 0.3 * night);

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
