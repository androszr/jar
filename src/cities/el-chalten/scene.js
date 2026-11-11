// El Chalten in a jar: Fitz Roy seen from the east shore of Laguna de los Tres,
// looking west. Back to front: the southern sky, the far ridge, Poincenot and
// the Fitz Roy massif, the glacier, the moraine, the banner cloud, a cloud deck,
// the lake (water.js) and the shore (shore.js). The rock is built once from a
// fixed seed (buildPlates) as faceted granite, then shaded each frame by the
// hour. Shapes are shares of the jar body: x of its width, y of its height.
// Every mover is a function of `nowMs` or `phase`, so the same moment draws the
// same pixels.
import { LAMP_THRESHOLD, clamp, wrap, smoothstep } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { EL_CHALTEN as EC } from './palette.js';
import {
  visibilityBand, windOf, coverOf, plumeLength, plumeSide, mirrorAmount, deckHeight, glowLine, glowStrength,
  silhouetteAmount, monthAt, seasonOf, freshSnow, facetShade,
} from './massif.js';

export const SEED = 0xf172;
// the lake's far shore, and the gravel shore below it
export const SHORE = 0.5;
export const GRAVEL = { y0: 0.7, y1: 0.737 };
export const SUMMIT = { x: 0.566, y: 0.22 };
export const BIVOUAC = { x: 0.545, y: 0.345 };
// where the headlamps wait on the shore, first lit first
export const LAMPS = [[0.16, 0.705], [0.31, 0.708], [0.46, 0.72], [0.8, 0.714], [0.24, 0.715], [0.53, 0.706], [0.88, 0.708]];
// the hiker's rock, clear of both glass streaks (the look's STREAKS)
export const ROCK = { x0: 0.6, x1: 0.74, y: 0.704, h: 0.032 };
// The x bands the glass streaks occupy (shares of the width); the look's STREAKS.
export const STREAK_CLEAR = [[0.02, 0.065], [0.945, 0.975]];

export const nightAmount = (light) => clamp((LAMP_THRESHOLD + 0.1 - light) / 0.3);
const tone = (day, dusk, night, n) => mix(mix(day, dusk, Math.min(1, n * 2)), night, Math.max(0, n * 2 - 1));
const snowTone = (n) => mix(EC.snow, EC.snowNight, n);

export function layout(w, h, ox = 0, oy = 0) {
  return { w, h, ox, oy, X: (s) => ox + s * w, Y: (s) => oy + s * h };
}

// ---- the geometry, built once ------------------------------------------------
// The mock's traced points are photograph pixels; this maps them into body shares
// (the whole photo spans a little more than the glass, the tip lifted to 0.22 and
// the lake's far shore to 0.50).
const px = ([x, y]) => [-0.02 + ((x + 20) / 820) * 1.04, 0.22 + (y - 37) * 0.000906];
const P = (pts) => pts.map(px);
const hh = (i, k) => hash2(i, SEED + k);
const chainY = (chain, x) => {
  if (x <= chain[0][0]) return chain[0][1];
  for (let i = 1; i < chain.length; i++) {
    if (x <= chain[i][0]) {
      const [x0, y0] = chain[i - 1];
      const [x1, y1] = chain[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return chain[chain.length - 1][1];
};
const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// The skyline of the whole massif, left to right, in photograph pixels.
const SKYLINE = [[255, 175], [258, 130], [268, 100], [280, 70], [290, 62], [298, 66], [304, 95], [306, 108], [312, 92], [322, 97], [332, 100], [342, 112], [352, 125],
  [365, 118], [378, 113], [392, 112], [396, 95], [405, 70], [420, 52], [435, 40], [442, 37], [450, 42], [458, 60], [465, 75], [472, 67], [480, 72], [488, 100], [498, 128], [510, 133], [530, 130], [545, 133],
  [560, 125], [572, 115], [590, 110], [600, 115], [605, 128], [620, 130], [628, 124], [660, 123], [680, 132], [700, 148], [712, 158], [740, 160], [780, 165], [800, 170]];
const FAR_RIDGE = [[-20, 190], [0, 172], [25, 160], [48, 148], [60, 150], [72, 170], [88, 180], [112, 160], [122, 135], [130, 118], [136, 113], [146, 118], [150, 140], [154, 165]];

// A rock body: the ridgeline split into vertical slabs whose shared edges lean,
// each slab cut in two by a broken mid line, so the body is `2 * slabs` planes,
// each facing a little left (-1) or right (1) of the summit. Ridges, gullies
// with a snow sliver lodged at the top, and a fine vertical grain sit on top.
function rockBody(ridge, slabs, k, grain, base = SHORE) {
  const n = ridge.length - 1;
  const idx = Array.from({ length: slabs + 1 }, (_, j) => Math.round((j * n) / slabs));
  let top = ridge[0];
  for (const r of ridge) if (r[1] < top[1]) top = r;
  const xmin = ridge[0][0];
  const xmax = ridge[n][0];
  const half = Math.max(top[0] - xmin, xmax - top[0], 0.02);
  const bot = idx.map((i, j) => [j === 0 || j === slabs ? ridge[i][0] : ridge[i][0] + (hh(j, k) - 0.5) * 0.07, base]);
  const mid = idx.map((i, j) => {
    const r = ridge[i];
    return [(r[0] + bot[j][0]) / 2 + (j === 0 || j === slabs ? 0 : (hh(j, k + 9) - 0.5) * 0.02), r[1] + (base - r[1]) * (0.42 + 0.2 * hh(j, k + 5))];
  });
  const facets = [];
  const ridges = [];
  const couloirs = [];
  const streaks = [];
  for (let j = 0; j < slabs; j++) {
    const run = ridge.slice(idx[j], idx[j + 1] + 1);
    const cx = run.reduce((s, p) => s + p[0], 0) / run.length;
    const f = clamp(((cx - top[0]) / half) * 1.4 + (hh(j, k + 2) - 0.5) * 0.5, -1, 1);
    facets.push({ poly: [...run, mid[j + 1], mid[j]], facing: f });
    facets.push({ poly: [mid[j], mid[j + 1], bot[j + 1], bot[j]], facing: clamp(f + (hh(j, k + 3) - 0.5) * 0.7, -1, 1) });
  }
  for (let j = 1; j < slabs; j++) {
    const t = ridge[idx[j]];
    ridges.push([t, mid[j], bot[j]]);
    streaks.push([[t[0], t[1] + 0.006], [t[0] + 0.005, t[1] + 0.04], [t[0] - 0.004, t[1] + 0.038]]);
    if (j % 2 === 1) couloirs.push([[t[0], t[1] + 0.008], [mid[j][0] + 0.008, mid[j][1]], [mid[j][0] - 0.008, mid[j][1]]]);
  }
  const g = [];
  for (let i = 0; i < grain; i++) {
    const x = xmin + (xmax - xmin) * hh(i, k + 20);
    const y = chainY(ridge, x) + 0.01;
    const len = 0.02 + 0.03 * hh(i, k + 30);
    const y0 = y + Math.max(0, base - y - len - 0.01) * hh(i, k + 40);
    g.push([[x, y0], [x + (hh(i, k + 50) - 0.5) * 0.004, y0 + len]]);
  }
  return { outline: [...ridge, [xmax, base], [xmin, base]], facets, ridges, couloirs, streaks, grain: g };
}

export function buildPlates(w, h) {
  const sky = P(SKYLINE);
  // Poincenot (the blade), Fitz Roy (the fin), then the needles stepping down
  const bodies = {
    poincenot: rockBody(sky.slice(0, 13), 4, 100, 40),
    fitzroy: rockBody(sky.slice(12, 31), 8, 200, 60),
    needles: [[30, 35], [35, 39], [39, 45]].map(([a, b], i) => rockBody(sky.slice(a, b), 1, 300 + i * 10, 12)),
  };
  const far = rockBody(P(FAR_RIDGE), 3, 400, 0);
  // the glacier tongue on the right, with cracks curving down-slope and dark outcrops
  const glTop = [[520, 180], [560, 155], [600, 140], [640, 150], [700, 160], [780, 185], [800, 190]];
  const glBot = [[495, 275], [540, 310], [640, 320], [700, 300], [740, 260], [800, 230]];
  const crevasses = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const x = 540 + 38 * i + 10 * hh(i, 60);
    const yt = chainY(glTop, x) + 6;
    const yb = chainY(glBot, x);
    const bend = (hh(i, 61) - 0.5) * 30;
    return P([[x, yt], [x + bend, yt + (yb - yt) * 0.35], [x - 14 + bend, yt + (yb - yt) * 0.7]]);
  });
  const glacier = {
    outline: P([[470, 270], [500, 200], [520, 180], [560, 155], [600, 140], [640, 150], [700, 160], [780, 185], [800, 190], [800, 230], [740, 260], [700, 300], [640, 320], [540, 310], [495, 275]]),
    crevasses,
    outcrops: [
      P([[512, 188], [525, 165], [550, 160], [560, 180], [530, 190]]),
      P([[632, 190], [650, 170], [680, 165], [685, 185], [655, 197]]),
      P([[690, 160], [740, 158], [780, 170], [780, 185], [730, 188]]),
    ],
  };
  // the moraine: the big brown bulk on the left, scree on it, snow patches, and the slope under the glacier
  const moraine = P([[-20, 345], [0, 330], [15, 315], [40, 250], [88, 168], [120, 150], [165, 135], [185, 125], [205, 120], [225, 128], [245, 150], [262, 170], [280, 180], [300, 160], [312, 148], [325, 165], [345, 175],
    [380, 185], [410, 170], [430, 178], [450, 195], [480, 210], [495, 225], [475, 255], [490, 280], [520, 310], [600, 335], [640, 345]]);
  const xs = moraine.map((p) => p[0]);
  const ys = moraine.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const scree = [];
  for (let i = 0; i < 400 && scree.length < 70; i++) {
    const x = x0 + (x1 - x0) * hh(i, 70);
    const y = y0 + (SHORE - y0) * hh(i, 71);
    if (inside(moraine, x, y)) scree.push({ x, y, r: 0.0025 + 0.004 * hh(i, 72), shade: hh(i, 73) });
  }
  return {
    w, h, ...bodies, far, glacier,
    moraine: {
      outline: moraine,
      shade: P([[-20, 345], [0, 330], [15, 315], [40, 250], [88, 168], [120, 200], [92, 262], [112, 322], [60, 345]]),
      slope: P([[630, 345], [660, 320], [700, 300], [730, 240], [760, 205], [800, 195], [800, 345]]),
      scree,
      patches: [P([[150, 150], [190, 138], [212, 158], [172, 170]]), P([[298, 172], [318, 158], [336, 180], [310, 192]]), P([[392, 190], [420, 180], [446, 204], [410, 210]])],
    },
    shore: {
      edge: Array.from({ length: 11 }, (_, i) => [i / 10, GRAVEL.y0 + 0.006 * hh(i, 80)]),
      pebbles: Array.from({ length: 28 }, (_, i) => ({ x: hh(i, 81), y: GRAVEL.y0 + 0.012 + 0.03 * hh(i, 82), r: 0.002 + 0.003 * hh(i, 83), shade: hh(i, 84) })),
      shrubs: [0.09, 0.13, 0.17, 0.12, 0.2, 0.86, 0.82].map((x, i) => ({ x, y: GRAVEL.y0 + 0.004 + 0.01 * hh(i, 85), r: 0.012 + 0.008 * hh(i, 86), k: i })),
    },
    lamps: LAMPS,
    cross: { stars: [[0.66, 0.11], [0.69, 0.17], [0.63, 0.15], [0.72, 0.14]], pointers: [[0.55, 0.12], [0.58, 0.15]] },
  };
}

// ---- the weather and the clock, as numbers -----------------------------------
export function mood(tint, weather, nowMs, location) {
  const band = visibilityBand(weather);
  const wind = windOf(weather);
  const month = monthAt(nowMs, location && location.zone);
  const season = seasonOf(month);
  const frozen = season === 'winter';
  return {
    n: nightAmount(tint.light), band, wind, side: plumeSide(weather && weather.windDir), cover: coverOf(weather),
    month, season, frozen, fresh: freshSnow(weather && weather.temperature), mirror: mirrorAmount(wind, band, frozen),
  };
}

// ---- drawing helpers ---------------------------------------------------------
function poly(ctx, L, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(L.X(x), L.Y(y)) : ctx.moveTo(L.X(x), L.Y(y))));
  ctx.closePath();
}
function line(ctx, L, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(L.X(x), L.Y(y)) : ctx.moveTo(L.X(x), L.Y(y))));
  ctx.stroke();
}
// A soft round puff of colour, painted over what is there.
export function puff(ctx, x, y, r, colour, alpha) {
  if (alpha <= 0.002 || r <= 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(colour, Math.min(1, alpha)));
  g.addColorStop(0.55, css(colour, Math.min(1, alpha) * 0.7));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

// The colour of one face of the granite: lit or shaded by where the sun is at
// this hour, toned to night, flattened toward the dusk rock in the evening, and
// hazed toward the sky. Pure, so the tests can name the fills.
export function facetColour(facing, phase, tint, haze = 0.12) {
  let c = mix(EC.graniteShade, EC.graniteLit, facetShade(facing, phase, tint.light));
  c = mix(c, EC.graniteNight, nightAmount(tint.light));
  c = mix(c, EC.graniteDusk, silhouetteAmount(phase) * 0.85);
  return mix(c, tint.skyLow, haze);
}

function drawRock(ctx, L, body, phase, tint, m, haze) {
  const glowK = glowStrength(phase);
  const edge = glowLine(phase);
  const hazeEdge = mix(EC.graniteDeep, EC.graniteNight, m.n);
  ctx.lineWidth = 0.6;
  for (const f of body.facets) {
    let col = facetColour(f.facing, phase, tint, haze);
    if (glowK > 0) {
      const top = Math.min(...f.poly.map((p) => p[1]));
      col = mix(col, EC.ember, 0.92 * glowK * clamp(1 - (top - SUMMIT.y) / Math.max(0.02, edge - SUMMIT.y)));
    }
    poly(ctx, L, f.poly);
    ctx.fillStyle = css(col);
    ctx.fill();
    ctx.strokeStyle = css(hazeEdge, 0.18);
    ctx.stroke();
  }
  if (haze > 0.2) return;
  const lit = mix(EC.graniteLit, EC.graniteNight, m.n);
  ctx.strokeStyle = css(lit, 0.22);
  ctx.lineWidth = 1.2;
  for (const r of body.ridges) line(ctx, L, r);
  ctx.fillStyle = css(mix(EC.graniteDeep, EC.graniteNight, m.n), 0.75);
  for (const c of body.couloirs) { poly(ctx, L, c); ctx.fill(); }
  ctx.fillStyle = css(snowTone(m.n), 0.9 * (1 - silhouetteAmount(phase)));
  for (const s of body.streaks) { poly(ctx, L, s); ctx.fill(); }
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = css(EC.graniteDeep, 0.08);
  body.grain.forEach((g, i) => { if (i % 2 === 0) line(ctx, L, g); });
  ctx.strokeStyle = css(EC.graniteDeep, 0.16);
  body.grain.forEach((g, i) => { if (i % 2 === 1) line(ctx, L, g); });
}

// The southern sky's extras: the Southern Cross and its pointers on a clear
// night, and the evening sun's glow behind the wall (the view faces west, so it
// sets behind the peak and never rises in frame).
export function drawSky(ctx, L, phase, tint, plates, m) {
  const clearish = m.band === 'clear' || m.band === 'smoking';
  if (clearish && m.n > 0.5) {
    ctx.fillStyle = css(EC.star, 0.9 * (m.n - 0.5) * 2);
    for (const [x, y] of [...plates.cross.stars, ...plates.cross.pointers]) ctx.fillRect(L.X(x), L.Y(y), 1.8, 1.8);
  }
  const p = wrap(phase);
  if (m.band !== 'hidden' && p > 0.55 && p < 0.86) {
    const t = clamp((p - 0.6) / 0.24);
    const k = (1 - m.cover / 100 * 0.8) * smoothstep((p - 0.55) / 0.15) * (1 - smoothstep((p - 0.78) / 0.07));
    glow(ctx, L.X(0.4), L.Y(0.14 + 0.2 * t), L.w * 0.3, EC.sunset, 0.7 * k);
  }
}

export function drawWall(ctx, L, phase, tint, plates, m) {
  drawRock(ctx, L, plates.far, phase, tint, m, 0.38);
  drawRock(ctx, L, plates.poincenot, phase, tint, m, 0.12);
  drawRock(ctx, L, plates.fitzroy, phase, tint, m, 0.12);
  for (const b of plates.needles) drawRock(ctx, L, b, phase, tint, m, 0.12);
}

export function drawGlacier(ctx, L, phase, tint, plates, m) {
  const g = plates.glacier;
  poly(ctx, L, g.outline);
  ctx.fillStyle = css(mix(mix(EC.glacier, EC.glacierNight, m.n), tint.skyLow, 0.08));
  ctx.fill();
  ctx.fillStyle = css(mix(EC.outcrop, EC.graniteNight, m.n), 0.9);
  for (const o of g.outcrops) { poly(ctx, L, o); ctx.fill(); }
  ctx.strokeStyle = css(mix(EC.crevasse, EC.glacierNight, m.n * 0.6), 0.8);
  ctx.lineWidth = 1;
  for (const c of g.crevasses) line(ctx, L, c);
}

// The big brown moraine, its scree, and the snow of the season.
export function drawMoraine(ctx, L, phase, tint, plates, m) {
  const mo = plates.moraine;
  const base = tone(EC.moraineDay, EC.moraineDusk, EC.moraineNight, m.n);
  poly(ctx, L, mo.slope);
  ctx.fillStyle = css(base);
  ctx.fill();
  poly(ctx, L, mo.outline);
  ctx.fillStyle = css(base);
  ctx.fill();
  poly(ctx, L, mo.shade);
  ctx.fillStyle = css(mix(EC.moraineShade, EC.moraineNight, m.n), 0.55);
  ctx.fill();
  for (const s of mo.scree) {
    ctx.fillStyle = css(mix(mix(EC.screeDark, EC.screeLight, s.shade), EC.moraineNight, m.n * 0.85), 0.9);
    ctx.fillRect(L.X(s.x), L.Y(s.y), Math.max(1, s.r * L.w), Math.max(1, s.r * L.w * 0.8));
  }
  const snow = snowTone(m.n);
  const patchAlpha = m.season === 'spring' ? 0.9 : m.season === 'autumn' ? 0.3 : 0;
  if (patchAlpha > 0) {
    ctx.fillStyle = css(snow, patchAlpha);
    for (const p of mo.patches) { poly(ctx, L, p); ctx.fill(); }
  }
  const cover = m.frozen ? 0.85 : m.fresh ? 0.5 : 0;
  if (cover > 0) {
    ctx.fillStyle = css(snow, cover);
    poly(ctx, L, mo.outline);
    ctx.fill();
    poly(ctx, L, mo.slope);
    ctx.fill();
  }
}

// The banner cloud streaming off the summit: longer in more wind, carried the
// way the wind goes, short and fat towards you when it comes from due west.
export function drawPlume(ctx, L, phase, tint, plates, nowMs, m) {
  const len = m.band === 'clear' || m.band === 'smoking' ? plumeLength(m.wind) : 0;
  if (len <= 0) return;
  const fat = 1 + (1 - Math.abs(m.side)) * 0.6;
  const col = mix(mix(EC.plume, tint.skyLow, 0.25), EC.graniteNight, m.n * 0.75);
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = L.X(SUMMIT.x + m.side * len * t);
    const y = L.Y(SUMMIT.y + 0.012 + 0.018 * t + 0.004 * Math.sin(nowMs / 1100 + i));
    puff(ctx, x, y, L.w * (0.014 + 0.032 * t) * fat, col, 0.85 * (1 - t * 0.6));
  }
}

// A deck of cloud sitting on the summits when the peak is capped, or gone.
export function drawDeck(ctx, L, phase, tint, plates, nowMs, m) {
  if (m.band !== 'capped' && m.band !== 'hidden') return;
  const edge = deckHeight(m.cover);
  const col = mix(mix(EC.deck, EC.deckDark, m.band === 'hidden' ? 0.55 : 0.25), EC.graniteNight, m.n * 0.8);
  ctx.fillStyle = css(col, m.band === 'hidden' ? 0.97 : 0.92);
  ctx.fillRect(L.ox, L.oy, L.w, L.Y(edge) - L.oy);
  const drift = (m.side * m.wind * nowMs) / 6e6;
  for (let i = 0; i < 9; i++) {
    const x = L.ox + L.w * (wrap(i / 8 + 0.04 * hh(i, 90) + drift) * 1.3 - 0.15);
    puff(ctx, x, L.Y(edge) + 0.005 * L.h * Math.sin(nowMs / 1800 + i), L.w * (0.1 + 0.04 * hh(i, 91)), col, 0.85);
  }
}
