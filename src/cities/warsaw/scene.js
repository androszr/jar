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
import { LAMP_THRESHOLD, osc, clamp, wrap, smoothstep, sunAltitude, sunPos, moonPos, isNight } from '../../clock.js';
import { css, mix, glow, sheen, lightPatch } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { localDate, dayFraction } from '../../placeclock.js';
import { moonPhase, moonGlow } from '../../moon.js';
import { WARSAW } from './palette.js';
import { isUsable, gloom, cloudAmount } from '../../weather.js';

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

// The city behind the low row: an unbroken run of roofs from edge to edge, so
// no sky shows between the front blocks or under the towers' feet. Left and
// right edges (shares of the width), top (share of the body height from the
// top), never lower than the far bank the towers stand on.
export const INFILL_ROW = Array.from({ length: 26 }, (_, i) => ({
  x0: i / 26,
  x1: (i + 1) / 26,
  top: FAR_BANK - 0.03 * hash2(i, 66),
}));

// The Palace, in px of the reference box above the far bank: [half width, top]
// of each mass from the wings up, then the needle's tip. The combs are the rows
// of pinnacles along a setback: [mass index, count, spike height px].
export const PALACE = {
  masses: [[48, 34], [27, 50], [21, 118], [16.5, 127], [11, 143], [6, 152]].map(([hw, top]) => ({ hw: hw / BW, top: top / BH })),
  combs: [[0, 4, 6], [1, 6, 6], [2, 6, 7], [3, 5, 6]],
  clock: 135 / BH, // the one clock face, a share of the body height above the far bank
  needle: 0.48,
};

// The Mermaid: figure base (x of the width, base of the height), unit u (a share
// of the height) and the plinth she stands on, on the far quay, standing on the water's edge.
export const MERMAID = { x: 0.15, base: 0.626, u: 0.055, plinth: { hw: 0.016, top: 0.628, h: 0.012 } };

// The x bands the glass streaks occupy (shares of the width); a copy of the
// look's STREAKS, which test/look.test.js keeps in step.
// The two rim passes of the Mermaid at night, as px offsets (right, then left).
export const RIM_DX = [1.2, -1.2];
export const DAY_RIM = { dx: 1.8, dy: -0.75 }; // the sunlit edge by day, px, on the sun's side

export const CLOCK_R = 1.9; // the Palace clock's radius, px of the reference box

// Soft points of light along Varso's lit needle at night.
export const MAST_GLOWS = 4;

export const STREAK_CLEAR = [[0.02, 0.065], [0.945, 0.975]];

export const nightAmount = (light) => clamp((LAMP_THRESHOLD + 0.1 - light) / 0.3);
export const sunSide = (phase) => (wrap(phase) < 0.4 ? -1 : 1);

// How warm the light is for a sun at altitude `alt`: nothing above 0.6 (the sky
// is still blue), rising as it sinks, full on the horizon, gone a little below it.
export const GOLDEN_FROM = 0.6;
export const goldenAmount = (alt) => (alt >= 0 ? smoothstep(1 - alt / GOLDEN_FROM) : clamp(1 + alt / 0.12));

// The hour's light on the scene, read the way the shared sky draws its sun:
//   x        where the sun stands, a share of the width (left in the morning, right in the evening)
//   alt      its altitude, 1 at noon, 0 on the horizon
//   side     -1 while it stands in the left half of the picture, 1 in the right: the lit side of
//            the towers, the Palace and the bridge's pylon (the Mermaid keeps sunSide's morning / afternoon)
//   strength how much of its disc the sky shows (0 with no reading, at night, under rain or a full overcast)
//   golden   0..1 how low and warm the light is, drained by a heavy sky
//   heavy    the sky's gloom, 0..1
export function sunLight(phase, weather) {
  const alt = sunAltitude(phase);
  const known = !!(weather && weather.known);
  const kind = known ? weather.kind : 'cloud';
  const heavy = gloom(weather);
  const amount = cloudAmount(weather ? weather.cloudCover : null, kind);
  const up = !isNight(phase) && alt > -0.05;
  const shown = up && known && (kind === 'clear' || kind === 'cloud');
  const x = clamp((sunPos(phase).x - 250) / 800, 0.12, 0.88);
  return {
    x,
    alt,
    side: x < 0.5 ? -1 : 1,
    strength: shown ? (1 - amount * 0.85) * Math.min(1, 0.4 + alt) * (1 - heavy) : 0,
    golden: goldenAmount(alt) * (1 - heavy),
    heavy,
  };
}

// The moon over the river, as the shared sky draws it: { x (share of the width),
// strength 0..1 } while it is up after dark, else null. A new moon is strength 0.
export const MOON_TRACK_FROM = 0.1; // a thinner moon than this lays no track
export function moonLight(phase, weather, nowMs, light) {
  const mp = moonPos(phase);
  const dark = clamp((0.45 - light) / 0.3);
  if (!(mp.alt > 0) || !(isNight(phase) || dark > 0) || !Number.isFinite(nowMs)) return null;
  const known = !!(weather && weather.known);
  const amount = cloudAmount(weather ? weather.cloudCover : null, known ? weather.kind : 'cloud');
  const lit = moonPhase(nowMs).illumination;
  return {
    x: clamp((mp.x - 400) / 1000, 0.15, 0.85),
    strength: (lit < MOON_TRACK_FROM ? 0 : moonGlow(lit)) * (1 - amount * 0.7) * (1 - gloom(weather)) * Math.max(dark, isNight(phase) ? 0.4 : 0),
  };
}

// Windows go out through the night: the share that is dark at this moment of
// Warsaw's clock. Every window is lit until 22:00, most are out by 01:30, and
// they come back on between 04:30 and 06:30. A window with seed v (0..1, its
// own hash) is lit while v >= windowsOut, so each goes out once and stays out.
export const WINDOWS_OUT_MAX = 0.7;
export function windowsOut(nowMs) {
  const f = dayFraction(nowMs, 'Europe/Warsaw');
  if (typeof f !== 'number') return 0;
  const h = f * 24;
  if (h >= 22) return WINDOWS_OUT_MAX * smoothstep((h - 22) / 3.5);
  if (h < 1.5) return WINDOWS_OUT_MAX * smoothstep((h + 2) / 3.5);
  if (h < 4.5) return WINDOWS_OUT_MAX;
  if (h < 6.5) return WINDOWS_OUT_MAX * (1 - smoothstep((h - 4.5) / 2));
  return 0;
}

// day -> dusk -> night, blended by the darkness measure.
export const tone = (day, dusk, night, n) => mix(mix(day, dusk, Math.min(1, n * 2)), night, Math.max(0, n * 2 - 1));

// 3 May and 11 November in Warsaw: the Palace is floodlit white over red.
export function flagDay(nowMs) {
  const d = localDate(nowMs, 'Europe/Warsaw');
  return typeof d === 'string' && (d.endsWith('-05-03') || d.endsWith('-11-11'));
}

// The forest's seasons, from the city's own date: full strength through the middle of
// each season and a three-week fade across the starts of March, June, September and December.
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_STARTS = { spring: [3, 1], summer: [6, 1], autumn: [9, 1], winter: [12, 1] };
export const SEASON_FADE_DAYS = 21;
const DAY_MS = 86400000;

export function seasonWeights(nowMs) {
  const d = localDate(nowMs, 'Europe/Warsaw');
  const m = typeof d === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
  if (!m) return { spring: 0, summer: 1, autumn: 0, winter: 0 };
  const y = Number(m[1]);
  const dn = Date.UTC(y, Number(m[2]) - 1, Number(m[3])) / DAY_MS;
  const starts = [];
  for (let yy = y - 1; yy <= y + 1; yy++) {
    for (const s of SEASONS) starts.push({ s, b: Date.UTC(yy, SEASON_STARTS[s][0] - 1, SEASON_STARTS[s][1]) / DAY_MS });
  }
  starts.sort((a, b) => a.b - b.b);
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1].b <= dn) i++;
  const out = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  const half = SEASON_FADE_DAYS / 2;
  const next = starts[i + 1];
  const here = starts[i];
  if (next && dn >= next.b - half) {
    const t = smoothstep((dn - next.b) / SEASON_FADE_DAYS + 0.5);
    out[here.s] = 1 - t;
    out[next.s] = t;
  } else if (dn < here.b + half && i > 0) {
    const t = smoothstep((dn - here.b) / SEASON_FADE_DAYS + 0.5);
    out[starts[i - 1].s] = 1 - t;
    out[here.s] = t;
  } else {
    out[here.s] = 1;
  }
  return out;
}

// value noise over the column index: neighbours move together, so the colour drifts rather than blotches
const CANOPY_SEED = 93;
const CANOPY_FREQ_DIV = 10; // columns per noise cell: neighbours differ by at most ~11 per channel in autumn
const smoothNoise = (x, seed) => {
  const i = Math.floor(x);
  return hash2(i, seed) + (hash2(i + 1, seed) - hash2(i, seed)) * smoothstep(x - i);
};
// piecewise-linear through a season's colour stops
function ramp(stops, u) {
  if (stops.length === 1) return stops[0];
  const f = clamp(u) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  return mix(stops[i], stops[i + 1], f - i);
}

// The canopy's daytime colour at column k under the season weights.
export function canopyColour(k, weights) {
  const u = smoothNoise(k / CANOPY_FREQ_DIV, CANOPY_SEED);
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (const s of SEASONS) {
    const w = weights[s] || 0;
    if (w <= 0) continue;
    const c = ramp(WARSAW.canopy[s], u);
    r += c[0] * w;
    g += c[1] * w;
    b += c[2] * w;
    total += w;
  }
  return total > 0 ? [r / total, g / total, b / total] : WARSAW.canopy.summer[0];
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

// One glass tower. A thin soft rim on the sun's side (the rim colour, then the
// body nudged away from the sun), and by day the sky in the glass: lighter
// toward the top, grey under a heavy sky, a darker shade side, faint floor
// lines, orange on the sun's side at golden hour, and a glint that slides
// across and down the face as the sun crosses and sinks.
export const GLASS = { rim: 0.9, floor: 4.5, glintW: 1.5, glintH: 11 };
function glassTower(ctx, trace, L, t, g) {
  trace(ctx, L);
  ctx.fillStyle = css(g.rimC, g.rimAlpha);
  ctx.fill();
  ctx.save();
  trace(ctx, L);
  ctx.clip();
  ctx.save();
  ctx.translate(-g.side * GLASS.rim * L.sx, 0.4 * L.sy);
  trace(ctx, L);
  ctx.fillStyle = css(g.bodyC);
  ctx.fill();
  ctx.restore();
  if (g.day > 0) {
    const x0 = L.X(t.x - t.hw);
    const x1 = L.X(t.x + t.hw);
    const top = L.gy - (t.crown ?? t.h) * L.h;
    const wd = x1 - x0;
    // the sky in the glass
    lightPatch(ctx, [[x0, top], [x1, top], [x1, L.gy], [x0, L.gy]], g.skyC, 0.3 * g.day, top, L.gy + 0.25 * (L.gy - top));
    // the side turned from the sun
    ctx.fillStyle = css(WARSAW.glassShade, 0.2 * g.day);
    ctx.fillRect(g.side > 0 ? x0 : x0 + 0.55 * wd, top, 0.45 * wd, L.gy - top);
    // floors
    ctx.strokeStyle = css(WARSAW.glassLine, 0.13 * g.day);
    ctx.lineWidth = 0.5 * L.sy;
    ctx.beginPath();
    for (let y = L.gy - GLASS.floor * L.sy; y > top; y -= GLASS.floor * L.sy) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
    // golden hour: the sun's side catches orange
    if (g.golden > 0) {
      ctx.fillStyle = css(WARSAW.glassGolden, 0.5 * g.golden * g.day);
      ctx.fillRect(g.side > 0 ? x0 + 0.5 * wd : x0, top, 0.5 * wd, L.gy - top);
      ctx.fillStyle = css(WARSAW.glassGolden, 0.22 * g.golden * g.day);
      ctx.fillRect(x0, top, wd, L.gy - top);
    }
    // the sun's glint
    if (g.sun > 0) {
      const gx = x0 + (0.14 + 0.72 * g.sunX) * wd;
      const gyy = top + (0.16 + 0.5 * (1 - g.alt)) * (L.gy - top);
      sheen(ctx, gx, gyy, GLASS.glintW * L.sx, GLASS.glintH * L.sy, mix(WARSAW.glassGlint, WARSAW.glassGolden, 0.6 * g.golden), 0.6 * g.sun * g.day);
    }
  }
  ctx.restore();
}

// Lit floor bands across a tower, seeded so the same tower always shows the same.
function floorBands(ctx, trace, L, t, seed, night, out = 0) {
  const x0 = L.X(t.x - t.hw);
  const x1 = L.X(t.x + t.hw);
  const top = L.gy - summit(t) * L.h;
  ctx.save();
  trace(ctx, L);
  ctx.clip();
  ctx.lineWidth = 1.3;
  for (let y = L.gy - 4 * L.sy, k = 0; y > top + 3; y -= 4.5 * L.sy, k++) {
    if (hash2(seed, k) > 0.55 || hash2(seed + 4, k) < out) continue;
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
function windowDots(ctx, trace, L, night, out = 0) {
  ctx.save();
  trace(ctx, L);
  ctx.clip();
  ctx.fillStyle = css(WARSAW.backWindow, 0.85 * night);
  let k = 0;
  for (let y = L.gy - 110 * L.sy; y < L.gy - 3; y += 5 * L.sy) {
    for (let x = L.X(0.17); x < L.X(1); x += 4 * L.sx, k++) {
      if (hash2(7, k) > 0.07 || hash2(8, k) < out) continue;
      ctx.fillRect(x, y, 1.8 * L.sx, 2.2 * L.sy);
    }
  }
  ctx.restore();
}

// `layers` lets the city slip its own things between the skyline's layers:
// `behind(L, night)` before any tower (fireworks), `foot(L, night)` in front of
// the Palace and behind the low city's roofs (the Christmas tree), `roofs(L,
// night)` over the low city (steam). Returns { windows } - the share still lit.
export function drawSkyline(ctx, rect, phase, tint, plates, weather, nowMs, layers = {}) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = nightAmount(tint.light);
  const snow = weather && weather.kind === 'snow';
  const sun = sunLight(phase, weather);
  const side = sun.side;
  const golden = sun.golden * (1 - night);
  const out = windowsOut(nowMs);
  const bodyC = tone(WARSAW.silhouetteDay, WARSAW.silhouetteDusk, WARSAW.silhouetteNight, night);
  const rimC = tone(mix(WARSAW.rimDay, tint.skyLow, 0.25), WARSAW.rimDusk, WARSAW.rimNight, night);
  const rimAlpha = 0.6 * (1 - night) + 0.35 * night;
  const glass = {
    side, bodyC, rimC, rimAlpha, golden,
    day: 1 - night,
    skyC: mix(mix(tint.skyLow, tint.skyTop, 0.35), WARSAW.glassDull, sun.heavy),
    sun: sun.strength,
    sunX: (sun.x - 0.12) / 0.76,
    alt: Math.max(0, sun.alt),
  };
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
  if (night > 0) windowDots(ctx, traceBackRow, L, night, out);
  if (layers.behind) layers.behind(L, night);

  // the glass towers: the sky in the glass by day, a thin rim on the sun's side
  glassTower(ctx, traceCosmopolitan, L, TOWER.cosmopolitan, glass);
  glassTower(ctx, traceVarso, L, TOWER.varso, glass);
  glassTower(ctx, traceInterContinental, L, TOWER.intercontinental, glass);
  glassTower(ctx, traceSpire, L, TOWER.spire, glass);
  glassTower(ctx, traceZlota, L, TOWER.zlota, glass);

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
    // the needle's own faint light, drawn before the red dot so the dot stays unmixed
    ctx.strokeStyle = css(WARSAW.mastLit, 0.55 * night);
    ctx.lineWidth = 1.6 * L.sx;
    ctx.beginPath();
    ctx.moveTo(cx('varso'), L.Y(vs.crown));
    ctx.lineTo(cx('varso'), L.Y(vs.top) + 3 * L.sy);
    ctx.stroke();
    for (let k = 0; k < MAST_GLOWS; k++) {
      glow(ctx, cx('varso'), L.Y(vs.crown) + (L.Y(vs.top) - L.Y(vs.crown)) * ((k + 0.5) / MAST_GLOWS), 5 * L.sx, WARSAW.crownGlow, 0.3 * night);
    }
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

    floorBands(ctx, traceInterContinental, L, TOWER.intercontinental, 91, night, out);
    floorBands(ctx, traceCosmopolitan, L, TOWER.cosmopolitan, 47, night, out);
  }

  // the Palace: sandstone by day with its shade side away from the sun, ribs at
  // every hour, floodlit by night (white over red on the flag days)
  const px = cx('pkin');
  const day = 1 - night;
  tracePalace(ctx, L);
  // at golden hour the sandstone warms, its shade side going dusky
  ctx.fillStyle = css(tone(mix(WARSAW.stoneDay, WARSAW.stoneGolden, 0.85 * sun.golden), WARSAW.stoneDusk, WARSAW.silhouetteNight, night));
  ctx.fill();
  ctx.save();
  tracePalace(ctx, L);
  ctx.clip();
  if (day > 0) {
    ctx.fillStyle = css(mix(WARSAW.stoneShade, WARSAW.stoneGoldenShade, sun.golden), (0.6 + 0.15 * sun.golden) * day);
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
  // one clock face on the lantern: small, pale stone by day, a dim warm disc at night
  const clockY = L.Y(PALACE.clock);
  ctx.fillStyle = css(mix(WARSAW.clockDay, WARSAW.clockNight, night), 0.9 - 0.15 * night);
  ctx.beginPath();
  ctx.arc(px, clockY, CLOCK_R * L.sx, 0, Math.PI * 2);
  ctx.fill();
  if (night > 0) glow(ctx, px, clockY, 5 * L.sx, WARSAW.clockNight, 0.22 * night);
  if (layers.foot) layers.foot(L, night);

  // the low city in front: first the unbroken roofs behind, muted toward the
  // background grey, then each block its own façade (plaster, brick, concrete),
  // hazed a little toward the sky, a grid of windows by day, lit ones at night
  INFILL_ROW.forEach((b, i) => {
    const top = L.oy + b.top * L.h;
    const day = mix(WARSAW.facades[Math.floor(hash2(i, 67) * WARSAW.facades.length)], WARSAW.backBlockDay, 0.6);
    ctx.fillStyle = css(mix(tone(day, WARSAW.carpetDusk, WARSAW.carpetNight, night), tint.skyLow, 0.18));
    ctx.fillRect(L.X(b.x0), top, L.X(b.x1) - L.X(b.x0) + 0.5, L.river.top - top); // half a px over the seam
  });
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
        if (hash2(i, 70 + k) > 0.55 || hash2(i, 80 + k) < out) continue;
        ctx.fillRect(x0 + 1.5 * L.sx + hash2(k, 71 + i) * (wd - 3.5 * L.sx), top + 2 * L.sy + hash2(i + 40, k) * (L.river.top - top - 4 * L.sy), 1.5 * L.sx, 1.7 * L.sy);
      }
    });
  }

  // golden hour: the low sun blushes the low city
  if (golden > 0) {
    ctx.fillStyle = css(WARSAW.cityGolden, 0.2 * golden);
    ctx.fillRect(L.ox, L.gy, L.w, L.river.top - L.gy);
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
  if (layers.roofs) layers.roofs(L, night);
  return { windows: 1 - out };
}

// Ice on the Vistula: below ICE.from degrees blocks drift right; full at ICE.full.
export const ICE = { from: -5, full: -12, count: 34, rows: 4, margin: 60, wrap: 120 };

// 0 (open water) at -5 and warmer or with no reading, 1 at -12 and colder.
export function iceAmount(weather) {
  return isUsable(weather) ? clamp((ICE.from - weather.temperature) / (ICE.from - ICE.full)) : 0;
}

// The floes at a moment: a plain function of the clock and the row, no randomness.
export function iceFloes(L, nowMs, amount, reduced = false) {
  const n = amount > 0 ? Math.min(ICE.count, Math.max(6, Math.floor(ICE.count * amount))) : 0;
  const span = 340 + ICE.wrap;
  const floes = [];
  for (let i = 0; i < n; i++) {
    const row = i % ICE.rows;
    const speed = (6 + row * 3) * (reduced ? 0.4 : 1);
    const v = (hash2(i, 1) * span + (speed * nowMs) / 1000) / span;
    floes.push({
      x: L.ox + (v - Math.floor(v)) * span * L.sx - ICE.margin * L.sx,
      y: L.river.top + (0.006 + row * 0.009 + hash2(i, 2) * 0.003) * L.h,
      w: (26 + 46 * hash2(i, 3)) * (0.7 + row * 0.15) * L.sx,
      h: (2.4 + row * 0.6) * L.sy, // the river band is only about 20 px tall
      row,
      i,
    });
  }
  return floes;
}

function drawIce(ctx, L, night, floes) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.ox, L.river.top + 1, L.w, L.river.bottom - L.river.top - 1);
  ctx.clip();
  const shadow = css(WARSAW.iceShadow, 0.6);
  const body = css(mix(WARSAW.iceFloe, WARSAW.riverNight, 0.55 * night));
  for (const { x, y, w, h, i } of floes) {
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(x, y + 0.7 * h, w / 2, 0.6 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y + 0.3 * h);
    ctx.lineTo(x - 0.3 * w, y - 0.4 * h);
    ctx.lineTo(x + 0.1 * w, y - 0.5 * h + hash2(i, 5) * 0.3 * h);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + 0.3 * w, y + 0.6 * h);
    ctx.lineTo(x - 0.2 * w, y + 0.65 * h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// The river band's reflections. Under each lit thing lies a soft upright
// column of its light (`column`, one elliptical sheen, cut to the river), then
// a run of thin lens-shaped dashes in its colour (`ripple`), each narrower and
// fainter than the one above it and nudged sideways by the clock, and across
// both a few dark gaps of plain water that drift down the column (`gaps`), so
// the light is broken by ripples and shimmers. Still under reduced motion.
const RIPPLE_ROW = 1.5; // px between dashes, before the vertical scale
function ripple(ctx, L, nowMs, reduced, x, wid, c, a, seed, spread = 0.6, rows = Infinity, flare = -0.55) {
  const top = L.river.top;
  const room = Math.floor((L.river.bottom - top - 2) / (RIPPLE_ROW * L.sy));
  const n = Math.min(rows, Math.max(1, room));
  const t0 = reduced || !Number.isFinite(nowMs) ? 0 : nowMs / 1000;
  for (let i = 0; i < n; i++) {
    const d = n > 1 ? i / (n - 1) : 0;
    const fade = (1 - 0.75 * d) * (0.8 + 0.2 * hash2(seed + 2, i));
    const y = top + 1.4 * L.sy + i * RIPPLE_ROW * L.sy;
    const sway = Math.sin(t0 * (1.1 + 0.4 * hash2(seed + 3, i)) + i * 1.3 + seed) * (0.6 + 1.6 * d) * L.sx;
    const jx = (hash2(seed, i) - 0.5) * wid * spread * 0.5 + sway;
    const bw = wid * (1 + flare * d) * (0.55 + 0.45 * hash2(seed + 1, i));
    ctx.fillStyle = css(c, clamp(a * fade));
    ctx.beginPath();
    ctx.ellipse(x + jx, y, Math.max(0.4, bw / 2), 0.6 * L.sy, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The soft body of a reflection: an upright sheen hung from the far quay. The
// caller has clipped to the river band.
function column(ctx, L, x, wid, c, a, reach = 1) {
  sheen(ctx, x, L.river.top, Math.max(1.2 * L.sx, wid * 0.62), (L.river.bottom - L.river.top) * 1.25 * reach, c, clamp(a));
}

// Plain water crossing a reflection: `n` thin gaps that drift slowly down it.
export const GAP_MS = 9000;
function gaps(ctx, L, nowMs, reduced, x, wid, water, seed, n = 3) {
  const depth = L.river.bottom - L.river.top;
  const t = reduced || !Number.isFinite(nowMs) ? 0 : nowMs / GAP_MS;
  ctx.fillStyle = css(water, 0.5);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const v = wrap(hash2(seed, 300 + i) + t * (0.7 + 0.6 * hash2(seed, 310 + i)));
    const y = L.river.top + (0.14 + 0.8 * v) * depth;
    const cx = x + Math.sin(t * 5 + i * 2 + seed) * 1.2 * L.sx;
    const rx = wid * (0.5 + 0.25 * hash2(seed, 320 + i));
    ctx.moveTo(cx + rx, y);
    ctx.ellipse(cx, y, rx, 0.55 * L.sy, 0, 0, Math.PI * 2);
  }
  ctx.fill();
}

// Rain, drizzle or a storm: the ground is wet, so lights run longer and stronger on it.
export const rainy = (weather) => !!weather && (weather.kind === 'rain' || weather.kind === 'drizzle' || weather.kind === 'storm');

// Returns { glitter, moonTrack, wet }: how strongly the sun's path and the
// moon's track lie on the water (0 for none), and whether the ground is wet.
export function drawRiver(ctx, rect, phase, tint, weather, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = nightAmount(tint.light);
  const top = L.river.top;
  const bottom = L.river.bottom;
  const wet = weather && (weather.kind === 'rain' || weather.kind === 'drizzle' || weather.kind === 'storm' || weather.kind === 'fog');
  const rain = rainy(weather);
  let colour = tone(WARSAW.riverDay, WARSAW.riverNight, WARSAW.riverDeep, night);
  if (wet) colour = mix(colour, WARSAW.dull, 0.35 * clamp(tint.light + 0.2));
  const ice = iceAmount(weather);
  if (ice > 0) colour = mix(colour, WARSAW.iceWater, 0.3 * ice);
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
  const day = 1 - night;
  const sun = sunLight(phase, weather);
  const moon = moonLight(phase, weather, nowMs, tint.light);
  const glitter = sun.strength * day;
  const track = moon ? moon.strength : 0;
  // the soft columns of light, cut to the river band
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.ox, top, L.w, bottom - top);
  ctx.clip();
  // by day, faint wavy reflections of the Palace and the glass towers, handing over to the night set as the light goes
  if (day > 0) {
    const dim = wet ? 0.5 : 1;
    const stone = mix(WARSAW.reflectDayPalace, WARSAW.sunGolden, 0.5 * sun.golden);
    column(ctx, L, L.X(TOWER.pkin.x), 40 * L.sx, stone, 0.16 * day * dim);
    ripple(ctx, L, nowMs, reduced, L.X(TOWER.pkin.x), 44 * L.sx, WARSAW.reflectDayPalace, 0.42 * day * dim, 60, 0.4);
    ripple(ctx, L, nowMs, reduced, L.X(TOWER.varso.x), 17 * L.sx, WARSAW.reflectDayVarso, 0.32 * day * dim, 70, 0.4);
    ripple(ctx, L, nowMs, reduced, L.X(TOWER.zlota.x), 24 * L.sx, WARSAW.reflectDayZlota, 0.28 * day * dim, 80, 0.4);
    ripple(ctx, L, nowMs, reduced, L.X(TOWER.spire.x) + 6 * L.sx, 20 * L.sx, WARSAW.reflectDaySpire, 0.3 * day * dim, 90, 0.4);
    // the sun's glitter path: under the sun, widening toward the viewer, long and warm when the sun is low
    if (glitter > 0) {
      const sx = L.X(sun.x);
      const c = mix(WARSAW.sunGlitter, WARSAW.sunGolden, 0.8 * sun.golden);
      const wid = (9 + 12 * sun.golden) * L.sx;
      column(ctx, L, sx, wid * 1.6, c, (0.22 + 0.4 * sun.golden) * glitter, 1.3);
      ripple(ctx, L, nowMs, reduced, sx, wid, c, (0.55 + 0.35 * sun.golden) * glitter, 200, 0.9, Infinity, 0.9);
      ripple(ctx, L, nowMs, reduced, sx, wid * 0.5, WARSAW.sunGlitter, 0.6 * glitter, 210, 1.4, Infinity, 1.2);
    }
  }
  // at night, one long shimmering reflection under each lit tower, in its colour
  if (night > 0) {
    const k = rain ? 1.35 : 1; // a wet night: stronger, and the short ones run the river's whole depth
    const short = (rows) => (rain ? Infinity : rows);
    const palaceC = flagDay(nowMs) ? WARSAW.flagRed : WARSAW.reflectPalace;
    const lit = [
      [L.X(TOWER.pkin.x), 40, palaceC, 0.85, 20],
      [L.X(TOWER.varso.x), 12, WARSAW.reflectVarso, 0.75, 30],
      [L.X(TOWER.spire.x) + 6 * L.sx, 8, WARSAW.reflectSpire, 0.6, 40],
      [L.X(TOWER.zlota.x), 10, WARSAW.reflectZlota, 0.45, 50],
    ];
    for (const [x, wid, c, a] of lit) column(ctx, L, x, wid * L.sx * (rain ? 1.25 : 1), c, 0.9 * a * night * k);
    for (const [x, wid, c, a, seed] of lit) ripple(ctx, L, nowMs, reduced, x, wid * L.sx, c, a * night * k * 0.8, seed);
    // Varso's red aviation light, a short thin red thread beside its blue crown
    ripple(ctx, L, nowMs, reduced, L.X(TOWER.varso.x), 3 * L.sx, WARSAW.aviation, 0.6 * night * k, 35, 0.3, short(4));
    // the boulevard lamps, each a short gold shiver; long wet streaks in the rain
    for (let x = L.ox + 9 * L.sx, i = 0; x < L.ox + L.w; x += 18 * L.sx, i++) {
      if (rain) column(ctx, L, x, 5 * L.sx, WARSAW.quayLamp, 0.3 * night, 0.9);
      ripple(ctx, L, nowMs, reduced, x, 3.2 * L.sx, WARSAW.quayLamp, 0.5 * night * k, 100 + i, 0.4, short(3));
    }
    // the moon's track, when it is up
    if (track > 0) {
      const mx = L.X(moon.x);
      column(ctx, L, mx, 12 * L.sx, WARSAW.moonTrack, 0.42 * track, 1.2);
      ripple(ctx, L, nowMs, reduced, mx, 9 * L.sx, WARSAW.moonTrack, 0.75 * track, 220, 0.9, Infinity, 0.8);
    }
    // plain water across the tall ones, drifting
    for (const [x, wid, , , seed] of lit) gaps(ctx, L, nowMs, reduced, x, wid * L.sx, colour, seed, wid > 20 ? 3 : 2);
  }
  ctx.restore();
  if (ice > 0) drawIce(ctx, L, night, iceFloes(L, nowMs, ice, reduced));
  drawBoulevard(ctx, L, tint, night, weather);
  return { glitter, moonTrack: track, wet: rain };
}

// The far bank's boulevard: a paved walk along the water under the low city,
// its quay edge, and lamp posts that come on at dusk. In the rain the walk is
// wet: it darkens, each lamp wears a soft halo and lays a streak on the paving.
function drawBoulevard(ctx, L, tint, night, weather) {
  const snow = weather && weather.kind === 'snow';
  const rain = rainy(weather);
  const top = L.river.top;
  const walk = L.boulevard;
  const paved = mix(tone(WARSAW.boulevardDay, WARSAW.boulevardNight, WARSAW.boulevardNight, night), tint.skyLow, 0.1);
  ctx.fillStyle = css(snow ? mix(WARSAW.snowCap, WARSAW.boulevardNight, 0.6 * night + 0.05) : rain ? mix(paved, WARSAW.quayNight, 0.3) : paved);
  ctx.fillRect(L.ox, walk, L.w, top - walk);
  ctx.fillStyle = css(mix(tone(WARSAW.quayDay, WARSAW.quayNight, WARSAW.quayDeep, night), tint.skyLow, 0.6));
  ctx.fillRect(L.ox, top - 1.2 * L.sy, L.w, 1.2 * L.sy);
  for (let x = L.ox + 9 * L.sx; x < L.ox + L.w; x += 18 * L.sx) {
    ctx.fillStyle = css(tone(WARSAW.quayDay, WARSAW.quayNight, WARSAW.quayDeep, night));
    ctx.fillRect(x, walk - 4.5 * L.sy, 0.7 * L.sx, 4.5 * L.sy + 1);
    if (night > 0) {
      if (rain) {
        ctx.fillStyle = css(WARSAW.quayLamp, 0.4 * night);
        ctx.fillRect(x - 1.6 * L.sx, walk, 3.9 * L.sx, top - walk - 1.2 * L.sy);
      }
      ctx.fillStyle = css(WARSAW.quayLamp, 0.9 * night);
      ctx.fillRect(x - 0.4 * L.sx, walk - 5.6 * L.sy, 1.5 * L.sx, 1.4 * L.sy);
      glow(ctx, x, walk - 4 * L.sy, (rain ? 12 : 6) * L.sx, WARSAW.quayLamp, (rain ? 0.5 : 0.3) * night);
    }
  }
}

// The Mermaid of Warsaw: sword raised, round shield on her arm, tail coiled, on a
// plinth on the far (left) bank's quay, beside the bridgehead. `c` is a css colour string.
// grow widens every stroked limb (the sunlit copy, so a thin blade shows as an edge, not a second blade)
// side is the way the sunlit copy is shifted: its stroked limbs step back by half the growth, so the pale band stays one shift wide
function figure(ctx, bx, by, u, c, shieldDot, grow = 0, side = 0) {
  const P = (dx, dy) => [bx + dx * u, by + dy * u];
  const move = (dx, dy) => ctx.moveTo(...P(dx, dy));
  const line = (dx, dy) => ctx.lineTo(...P(dx, dy));
  ctx.save();
  const back = -side * grow / 2; // x of the stroked limbs
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  const tail = [[0.0, -0.4], [0.1, -0.29], [0.06, -0.16], [-0.1, -0.09], [-0.15, -0.01], [0.02, 0.02], [0.17, -0.04]];
  for (let i = 0; i < tail.length - 1; i++) {
    ctx.lineWidth = u * (0.13 - i * 0.016) + grow;
    ctx.beginPath();
    move(tail[i][0] + back / u, tail[i][1]);
    line(tail[i + 1][0] + back / u, tail[i + 1][1]);
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
  ctx.lineWidth = u * 0.04 + grow; // the sword arm
  ctx.beginPath();
  move(0.06 + back / u, -0.64); line(0.13 + back / u, -0.79); line(0.08 + back / u, -0.92);
  ctx.stroke();
  ctx.lineWidth = u * 0.022 + grow; // the blade, curving over her head
  ctx.beginPath();
  move(0.08 + back / u, -0.93);
  ctx.quadraticCurveTo(...P(0.0 + back / u, -1.06), ...P(-0.13 + back / u, -1.04));
  ctx.stroke();
  ctx.lineWidth = u * 0.04 + grow; // the shield arm and the shield
  ctx.beginPath();
  move(-0.06 + back / u, -0.62); line(-0.14 + back / u, -0.56);
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

  const body = tone(WARSAW.mermaidBronze, WARSAW.mermaidDay, WARSAW.mermaidNight, night);
  const day = 1 - night;
  if (day > 0) {
    // a pale copy shifted toward the sun, drawn before the body so only the sliver shows
    ctx.save();
    ctx.translate(sunSide(phase) * DAY_RIM.dx, DAY_RIM.dy);
    figure(ctx, m.bx, m.by, m.u, css(WARSAW.mermaidSunlit, 0.9 * day), null, DAY_RIM.dx, sunSide(phase));
    ctx.restore();
  }
  if (night > 0) {
    // a warm outline on both sides, so she reads against the dark tower behind her
    for (const dx of RIM_DX) {
      ctx.save();
      ctx.translate(dx, -0.6);
      figure(ctx, m.bx, m.by, m.u, css(WARSAW.mermaidRim, night), null);
      ctx.restore();
    }
  }
  figure(ctx, m.bx, m.by, m.u, css(body), css(mix(WARSAW.mermaidShield, mix(body, WARSAW.clockFace, 0.18), night)));
}
