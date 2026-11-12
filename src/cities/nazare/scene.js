// Nazare in a jar: the Sitio headland with the Sao Miguel Arcanjo fort and the
// short red lantern of its lighthouse, the Praia do Norte wave rolling in below
// it, a few surfers on the lit face by day, the sun going down into the sea,
// the beam sweeping the foam by night. Original
// stylised silhouettes. Every mover is a function of `nowMs` or `phase`
// (sampled, never accumulated), so the same moment draws the same pixels.
// Shapes are shares of the jar body: x of its width, y of its height from the top.
import { LAMP_THRESHOLD, moonPos, osc, clamp, wrap, lerp, smoothstep } from '../../clock.js';
import { PALETTE, css, mix, glow, sheen, sunDisc } from '../../look/index.js';
import { moonPhase } from '../../moon.js';
import { hash2 } from '../../skyweather.js';
import { cloudAmount, gloom, windPush, REDUCED_DRIFT } from '../../weather.js';
import { NAZARE } from './palette.js';
import { waveHeightOf, waveBand, waveSize, rollMs, wavePhase, swellLines, swellCount, windBlow, boatLights, surferPlan, surferProgress, surferAlpha } from './sea.js';
import { SEA_HORIZON, SUN, sunSpot, sunShare, sunStrength, sunLow, seaSideLight } from './sun.js';

export const HORIZON = SEA_HORIZON;
export const CLIFF = { foot: { x: 0.52, y: 0.7 }, top: { x0: 0.62, x1: 1.08, y: 0.3 }, bottom: 0.74 };
export const FORT = { x0: 0.64, x1: 0.9, y0: 0.26, y1: 0.3 };
// The Farol da Nazare is not a tower: a short red iron lantern with a gallery
// round it, on a squat white base that stands on the fort's roof. TOWER is that
// base; the whole light is about one and a half times the height of the wall
// under it (battlements included).
export const TOWER = { x0: 0.762, x1: 0.798, y0: 0.232, y1: 0.26 };
export const LAMP_ROOM = { x0: 0.768, x1: 0.792, y0: 0.2, glass: { y0: 0.206, y1: 0.222 } };
export const GALLERY = { x0: 0.755, x1: 0.805 };
export const LANTERN = { x: 0.78, y: 0.214, roof: { y0: 0.182, y1: 0.2 } };
// The wave, seen from the beach as it comes at you. Its base line leaves the
// horizon (formY) and runs down to the sand (breakY) over one roll, growing as
// it comes. It spans the bay from past the jar's left edge (x0) to behind the
// rock (x1), so neither end ever stands in open water, and it is tallest at the
// rock and lowest at the left (lowShare). It breaks first at the rock, and the
// break runs left, away from the lighthouse, between peelFrom and peelTo of the
// roll. A second wave follows half a roll behind, so the sea is never empty:
// it stays small while the one ahead breaks, and only builds to full height
// as it reaches its own break (fullAt), once the one ahead is spent (spendFrom).
export const WAVE = {
  x0: -0.04, rock: 0.56, x1: 0.68, lowShare: 0.12,
  formY: 0.515, breakY: 0.695, peelFrom: 0.4, peelTo: 0.85, lag: 0.5,
  fullAt: 0.45, spendFrom: 0.74,
};
// The beach: the water's edge is at y0, the strand where people sit runs to
// `strand` (the top of the label plate) and the sand slopes on toward the
// viewer to the bottom of the jar (y1). x1 is the cliff's foot.
export const BEACH = { y0: 0.7, strand: 0.737, y1: 1, x1: 0.52 };
// The x bands the glass streaks occupy (shares of the width); the look's STREAKS.
export const STREAK_CLEAR = [[0.02, 0.065], [0.945, 0.975]];

export const nightAmount = (light) => clamp((LAMP_THRESHOLD + 0.1 - light) / 0.3);
// Which side the sun stands on: 1 the land (the right, all morning), -1 the sea
// (the left, from early afternoon), where it will set.
export const sunSide = (phase) => (wrap(phase) < 0.4 ? 1 : -1);
// where the strata are sampled across the rock (shares of the width)
const STRATA_X0 = 0.48;
const STRATA_STEP = 0.0825;
const tone = (day, dusk, night, n) => mix(mix(day, dusk, Math.min(1, n * 2)), night, Math.max(0, n * 2 - 1));

export function layout(w, h, ox = 0, oy = 0) {
  return { w, h, ox, oy, X: (s) => ox + s * w, Y: (s) => oy + s * h };
}

// The cliff face's smooth line: a quadratic from the foot up to the top's left
// corner. `faceCurve(t)` is a point on it, t 0 at the foot, 1 at the top.
const FACE_CTRL = { x: 0.6, y: 0.56 };
const faceCurve = (t) => {
  const u = 1 - t;
  return {
    x: u * u * CLIFF.foot.x + 2 * u * t * FACE_CTRL.x + t * t * CLIFF.top.x0,
    y: u * u * CLIFF.foot.y + 2 * u * t * FACE_CTRL.y + t * t * CLIFF.top.y,
  };
};
// How far the broken rock may stray from that line, either way, as a share of the width.
export const ROUGH = 0.008;

export function buildPlates(w, h) {
  // the rough face: fixed points off the smooth curve, the two ends left exact
  const face = [];
  for (let i = 0; i <= 16; i++) {
    const p = faceCurve(i / 16);
    const j = i === 0 || i === 16 ? 0 : (hash2(i, 13) - 0.5) * 2 * ROUGH;
    face.push({ x: p.x + j, y: p.y });
  }
  // the top: uneven, and running on inland past the jar's right edge, rising a
  // little behind the fort so the land never stops short of the glass
  const top = [];
  for (let i = 1; i <= 14; i++) {
    const x = CLIFF.top.x0 + (i / 14) * (CLIFF.top.x1 - CLIFF.top.x0);
    const rise = 0.012 * bump((x - FORT.x1) / (CLIFF.top.x1 - FORT.x1));
    top.push({ x, y: CLIFF.top.y + (hash2(i, 14) - 0.5) * 0.008 - rise });
  }
  // ledges of the bedded rock, of different lengths, falling a little to the right
  const ledges = [];
  for (let i = 0; i < 6; i++) {
    const y = 0.36 + 0.058 * i + 0.02 * hash2(i, 7);
    const x0 = 0.67 + 0.24 * hash2(i, 8);
    ledges.push({ y, x0, len: 0.05 + 0.07 * hash2(i, 9), slope: 0.02 + 0.06 * hash2(i, 10), kink: (hash2(i, 20) - 0.5) * 2 });
  }
  // the strata: bands of different thickness from above the top to below the
  // foot, no two neighbours the same colour, each with its own dip and uneven edge
  const strata = [];
  for (let i = 0, y = CLIFF.top.y - 0.03, t = 0; y < 0.8; i++) {
    t = (t + 1 + Math.floor(hash2(i, 21) * 3)) % 5;
    strata.push({ y, tone: t, dip: 0.03 + 0.06 * hash2(i, 22), jit: Array.from({ length: 9 }, (_, j) => (hash2(i * 9 + j, 23) - 0.5) * 0.014) });
    y += 0.028 + 0.05 * hash2(i, 24);
  }
  // the ridge where the face that looks out to sea turns into the one that looks at us
  const ridge = [{ x: CLIFF.foot.x + 0.075, y: CLIFF.bottom }, ...face.map((p, i) => ({ x: p.x + 0.075 + 0.022 * hash2(i, 25) - 0.02 * (i / 16), y: p.y }))];
  // cracks running down the rock
  const crevices = [0.705, 0.79, 0.87, 0.955].map((x, i) => {
    const y0 = 0.325 + 0.1 * hash2(i, 26);
    const n = 5 + Math.floor(3 * hash2(i, 27));
    return Array.from({ length: n }, (_, j) => ({ x: x + (hash2(i * 8 + j, 28) - 0.5) * 0.012 - 0.005 * j, y: y0 + 0.036 * j }));
  });
  // scrub: a tuft on every ledge and two on the sea face
  const tufts = [
    ...ledges.map((l, i) => ({ x: l.x0 + l.len * (0.2 + 0.6 * hash2(i, 29)), y: l.y - 0.004, r: 0.007 + 0.005 * hash2(i, 30) })),
    { x: 0.615, y: 0.47, r: 0.008 }, { x: 0.648, y: 0.345, r: 0.007 },
  ];
  // fallen rock: at the cliff foot, and along its base where it meets the sand
  const boulders = [
    ...[0, 1, 2, 3].map((i) => ({ x: CLIFF.foot.x - 0.035 + 0.025 * i + 0.01 * hash2(i, 15), y: CLIFF.foot.y + 0.037, r: 0.008 + 0.008 * hash2(i, 16) })),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: 0.6 + 0.066 * i + 0.03 * hash2(i, 31), y: CLIFF.bottom + 0.004 + 0.012 * hash2(i, 32), r: 0.007 + 0.009 * hash2(i, 33) })),
  ];
  const umbrellas = [0, 1, 2, 3].map((i) => ({ x: 0.1 + 0.09 * i + 0.03 * hash2(i, 17), tone: i % 3 }));
  const people = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 0.08 + 0.065 * i + 0.03 * hash2(i, 18), dy: hash2(i, 19) }));
  const windows = [0.88, 0.905, 0.925].map((x, i) => ({ x: x + 0.004 * hash2(i, 11), y: 0.275 + 0.015 * hash2(i, 12) }));
  return { w, h, face, top, ledges, strata, ridge, crevices, tufts, boulders, umbrellas, people, windows };
}

// Where the cliff face is at height ys (a share of the height), as a share of
// the width: the rough face from `plates`, or the smooth curve without them.
export function cliffFaceX(ys, plates = null) {
  const pts = plates ? plates.face : Array.from({ length: 17 }, (_, i) => faceCurve(i / 16));
  if (ys >= pts[0].y) return pts[0].x;
  for (let i = 1; i < pts.length; i++) {
    if (ys >= pts[i].y) {
      const a = pts[i - 1];
      const b = pts[i];
      return lerp(a.x, b.x, (a.y - ys) / (a.y - b.y));
    }
  }
  return pts[pts.length - 1].x;
}

// A soft round puff of colour, painted over what is there (never added as light).
function puff(ctx, x, y, r, colour, alpha) {
  if (alpha <= 0.002 || r <= 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(colour, Math.min(1, alpha)));
  g.addColorStop(0.5, css(colour, Math.min(1, alpha) * 0.8));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

// What the weather does to this city's water and light.
function mood(tint, weather) {
  const kind = weather && weather.kind ? weather.kind : 'cloud';
  return {
    night: nightAmount(tint.light),
    kind,
    cloud: cloudAmount(weather ? weather.cloudCover : null, kind),
    wet: kind === 'rain' || kind === 'drizzle' || kind === 'storm' || kind === 'fog',
    storm: kind === 'storm',
    fog: kind === 'fog',
    snow: kind === 'snow',
  };
}

// The lamp burns at night, and in fog by day too, as a working light does.
export const lampOn = (m) => Math.max(m.night, m.fog ? 0.8 : 0);

// How rough the sea is, 0..1: a storm, or a strong wind, raises whitecaps.
export function roughness(weather) {
  const kind = weather && weather.kind;
  const wind = weather && typeof weather.windSpeed === 'number' && Number.isFinite(weather.windSpeed) ? weather.windSpeed : 0;
  return Math.max(kind === 'storm' ? 1 : 0, clamp((wind - 20) / 30));
}

// the water's tone at a depth: darker under cloud and in a storm, greyed in rain
function water(c, m, tint) {
  let out = mix(c, NAZARE.seaDeep, 0.35 * m.cloud);
  if (m.wet) out = mix(out, NAZARE.dull, 0.35 * clamp(tint.light + 0.2));
  if (m.storm) out = mix(out, NAZARE.seaDeep, 0.3);
  return out;
}

// What the light is doing to the water: how grey the sky makes it, how low the
// evening sun stands over it and how much of that sun there is.
export function seaLight(phase, weather) {
  return { phase, grey: gloom(weather), low: sunLow(phase) * sunShare(weather), sun: sunStrength(phase, weather) };
}

// The sea's colours from the horizon to the sand: hazy and pale far off (warm
// under a low sun), deep in the middle, greener in the shallows; grey-green
// under a heavy sky. `at(ys)` is the colour at a height, so a wave's foot melts
// into the water around it.
export function seaTones(m, tint, lt) {
  const day = 1 - m.night;
  let col = water(tone(NAZARE.seaDay, NAZARE.seaDusk, NAZARE.seaNight, m.night), m, tint);
  col = mix(col, NAZARE.seaGrey, 0.55 * lt.grey * day);
  const haze = mix(NAZARE.horizonHaze, tint.skyLow, 0.5 + 0.5 * m.night);
  const warm = mix(col, NAZARE.seaGold, 0.34 * lt.low);
  const stops = [
    [0, mix(mix(col, haze, 0.1 + 0.25 * day), tint.skyLow, 0.45 * lt.low)],
    [0.16, warm],
    [0.62, mix(warm, NAZARE.seaDeep, 0.4)],
    [1, mix(mix(col, NAZARE.seaDeep, 0.2), NAZARE.seaShallow, 0.32 * day * (1 - 0.6 * lt.grey))],
  ];
  const at = (ys) => {
    const t = clamp((ys - HORIZON) / (BEACH.y0 - HORIZON));
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    }
    return stops[stops.length - 1][1];
  };
  return { col, haze, stops, at };
}

// The sun, painted first so the sea and the headland stand in front of it: it
// comes up behind the land, crosses to the left and sinks into the water.
// Returns its strength, 0 when there is none to see.
export function drawSun(ctx, rect, phase, tint, weather) {
  const strength = sunStrength(phase, weather);
  if (!(strength > 0)) return 0;
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const sp = sunSpot(phase);
  const low = sunLow(phase);
  const x = L.X(sp.x);
  const y = L.Y(sp.y);
  const r = SUN.r * L.w * (1 + 0.22 * low);
  glow(ctx, x, y, L.w * 0.55, mix(PALETTE.sun, NAZARE.sunLow, 0.35 * low), 0.22 * strength);
  glow(ctx, x, y, L.w * 0.26, mix(PALETTE.sun, NAZARE.sunLow, 0.6 * low), 0.5 * strength);
  sunDisc(ctx, x, y, r, strength);
  if (low > 0) {
    // it reddens as it nears the water
    ctx.fillStyle = css(NAZARE.sunLow, 0.5 * low * strength);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
    ctx.fill();
  }
  return strength;
}

export function drawFarSea(ctx, rect, phase, tint, weather, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const lt = seaLight(phase, weather);
  const sea = seaTones(m, tint, lt);
  const u = L.h / 396;
  const top = L.Y(HORIZON);
  const shore = L.Y(BEACH.y0 + 0.03);
  const g = ctx.createLinearGradient(0, top, 0, L.Y(BEACH.y0));
  for (const [t, c] of sea.stops) g.addColorStop(t, css(c));
  ctx.fillStyle = g;
  ctx.fillRect(L.ox - 0.1 * L.w, top, 1.2 * L.w, shore - top);
  // the haze where sea meets sky, on both sides of the line; in fog it takes the horizon away
  const haze = sea.haze;
  const hz = ctx.createLinearGradient(0, top - 0.014 * L.h, 0, top + 0.04 * L.h);
  hz.addColorStop(0, css(haze, 0));
  hz.addColorStop(0.26, css(haze, m.fog ? 0.8 : 0.5 - 0.2 * m.night));
  hz.addColorStop(1, css(haze, 0));
  ctx.fillStyle = hz;
  ctx.fillRect(L.ox, top - 0.014 * L.h, L.w, 0.054 * L.h);
  if (m.fog) {
    const fg = ctx.createLinearGradient(0, top - 0.05 * L.h, 0, top + 0.08 * L.h);
    fg.addColorStop(0, css(haze, 0));
    fg.addColorStop(0.5, css(haze, 0.8));
    fg.addColorStop(1, css(haze, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(L.ox, top - 0.05 * L.h, L.w, 0.13 * L.h);
  }
  // swell: lines marching in toward the shore, closer together far off, a lit
  // crest over a dark trough, as many as the period packs in and sized by the
  // same wave the scene breaks. They stop short of the headland.
  {
    const size = waveSize(waveHeightOf(weather));
    const lit = mix(mix(mix(NAZARE.faceLit, NAZARE.foam, 0.5), NAZARE.sunPath, 0.5 * lt.low), NAZARE.foamNight, m.night);
    const x0 = L.X(-0.02);
    const x1 = L.X(0.66);
    const yFar = top + 0.02 * L.h;
    const yNear = L.Y(0.69);
    const fade = (m.fog ? 0.4 : 1) * (1 - 0.72 * m.night) * (1 - 0.3 * m.wet);
    ctx.lineCap = 'round';
    for (const ln of swellLines(size, rollMs(weather, reduced), nowMs, swellCount(weather))) {
      const a = 0.34 * ln.a * fade;
      if (a < 0.004) continue;
      const y = lerp(yFar, yNear, ln.t);
      const amp = (0.6 + 2.2 * ln.t) * (0.5 + size / 0.2) * u;
      const lw = (0.6 + 1.7 * ln.t * (0.4 + size / 0.29)) * u;
      for (const [dy, colour, alpha] of [[1.1 * lw + 0.4 * u, NAZARE.seaDeep, 0.75 * a], [0, lit, a]]) {
        const lg = ctx.createLinearGradient(x0, 0, x1, 0);
        lg.addColorStop(0, css(colour, 0));
        lg.addColorStop(0.2, css(colour, alpha));
        lg.addColorStop(0.75, css(colour, alpha));
        lg.addColorStop(1, css(colour, 0));
        ctx.strokeStyle = lg;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const f = i / 16;
          const yy = y + dy + amp * Math.sin(f * 7 + ln.k * 1.9 + (reduced ? 0 : nowMs / 5000)) * 0.5;
          if (i === 0) ctx.moveTo(x0, yy); else ctx.lineTo(x0 + (x1 - x0) * f, yy);
        }
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }
  // whitecaps when the wind is strong: short crests that flare and die, longer nearer us
  const rough = roughness(weather);
  if (rough > 0) {
    const cap = mix(NAZARE.foam, NAZARE.foamNight, m.night);
    for (let k = 0; k < 36; k++) {
      const life = wrap(nowMs / (1800 + 1600 * hash2(k, 61)) + hash2(k, 62));
      const near = hash2(k, 63);
      const a = rough * Math.sin(Math.PI * life) * (0.35 + 0.5 * near);
      const w = (0.012 + 0.03 * near) * L.w;
      const x = L.X(hash2(k, 64) * 0.62 - 0.02);
      const y = top + (0.012 + 0.17 * near) * L.h;
      ctx.fillStyle = css(cap, 0.8 * a);
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, (0.6 + 0.7 * near) * u, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the low sun's path on the water: warm dashes from the horizon toward us,
  // widening as they come, under the disc
  if (lt.low > 0 && lt.sun > 0) {
    const sx = L.X(sunSpot(phase).x);
    const span = L.Y(0.69) - top;
    const a0 = lt.low * Math.min(1, lt.sun * 2.2);
    const gold = mix(NAZARE.sunPath, NAZARE.sunLow, 0.35 * lt.low);
    sheen(ctx, sx, top + 1.5 * u, 0.2 * L.w, 0.02 * L.h, gold, 0.5 * a0);
    for (let k = 0; k < 20; k++) {
      const f = k / 19;
      const flick = reduced ? 0.8 : clamp(0.55 + 0.45 * osc(nowMs / 2600, 1, hash2(k, 33)));
      const w = (0.018 + 0.13 * f) * L.w * (0.7 + 0.5 * hash2(k, 34));
      const x = sx + (hash2(k, 35) - 0.5) * 0.5 * w;
      ctx.fillStyle = css(gold, 0.7 * a0 * flick * (1 - 0.3 * f));
      ctx.beginPath();
      ctx.ellipse(x, top + 2 * u + f ** 1.25 * span, w / 2, (0.7 + 1.1 * f) * u, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // a clear night: the moon's shimmering track on the water, widening toward us
  const mp = moonPos(phase);
  const ill = moonPhase(nowMs).illumination;
  if (m.night > 0 && !m.wet && m.cloud < 0.35 && mp.alt > 0 && ill >= 0.02) {
    const mx = L.ox + L.w * Math.max(0.15, Math.min(0.85, (mp.x - 400) / 1000));
    const span = L.Y(0.69) - top;
    for (let k = 0; k < 12; k++) {
      const f = k / 11;
      const a = 0.3 * m.night * clamp(0.5 + 0.5 * osc(nowMs / 4000, 1, hash2(k, 3))) * (1 - 0.6 * f) * ill;
      ctx.fillStyle = css(NAZARE.moonStreak, a);
      const dash = (0.02 + 0.07 * f) * L.w * (0.7 + 0.6 * hash2(k, 5));
      ctx.fillRect(mx - dash / 2 + (hash2(k, 6) - 0.5) * 0.4 * dash, top + 3 * u + f ** 1.2 * span, dash, (1.2 + 0.8 * f) * u);
    }
  }
  // the fishing boats' lights along the horizon, each with a short reflection
  const boats = boatLights(waveBand(waveHeightOf(weather)), m.kind, m.night, nowMs, HORIZON);
  for (const [k, b] of boats.entries()) {
    const x = L.X(b.xs);
    const y = L.Y(b.ys);
    ctx.fillStyle = css(NAZARE.boatHull, 0.9 * b.a);
    ctx.fillRect(x - 2.2 * u, y - 0.2 * u, 4.4 * u, 1.2 * u);
    ctx.fillStyle = css(NAZARE.boatLight, b.a);
    ctx.fillRect(x - 0.7 * u, y - 2.2 * u, 1.4 * u, 1.4 * u);
    glow(ctx, x, y - 1.5 * u, 5 * u, NAZARE.boatLight, 0.5 * b.a);
    for (let j = 0; j < 3; j++) {
      const flick = reduced ? 0.7 : clamp(0.5 + 0.5 * osc(nowMs / 3000, 1, hash2(k * 3 + j, 36)));
      ctx.fillStyle = css(NAZARE.boatLight, 0.45 * b.a * flick * (1 - 0.25 * j));
      ctx.fillRect(x - (1.4 - 0.3 * j) * u, y + (1.8 + 1.6 * j) * u, (2.8 - 0.6 * j) * u, 0.7 * u);
    }
  }
  return boats.length;
}

export function drawHeadland(ctx, rect, phase, tint, weather, plates) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const u = L.h / 396;
  const day = 1 - m.night;
  // how much direct sun there is to model the rock with, and which side it is on
  const sunny = day * (1 - 0.75 * gloom(weather));
  const sea = seaSideLight(phase);
  const low = sunLow(phase) * sunShare(weather);
  const rock = (c) => tone(c, mix(c, NAZARE.cliffDusk, 0.7), NAZARE.cliffNight, m.night);
  const face = () => {
    plates.face.forEach((p, i) => (i ? ctx.lineTo(L.X(p.x), L.Y(p.y)) : ctx.moveTo(L.X(p.x), L.Y(p.y))));
  };
  const right = plates.top[plates.top.length - 1];
  const outline = () => {
    ctx.beginPath();
    face();
    for (const p of plates.top) ctx.lineTo(L.X(p.x), L.Y(p.y));
    ctx.lineTo(L.X(right.x), L.Y(CLIFF.bottom));
    ctx.lineTo(L.X(CLIFF.foot.x), L.Y(CLIFF.bottom));
    ctx.closePath();
  };
  ctx.fillStyle = css(rock(NAZARE.cliffDay));
  outline();
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  // the bedded rock: bands of ochre and red, dipping inland, each with an uneven top
  const edge = (s) => {
    s.jit.forEach((j, k) => {
      const xs = STRATA_X0 + STRATA_STEP * k;
      const y = L.Y(s.y + s.dip * (xs - STRATA_X0) + j);
      if (k) ctx.lineTo(L.X(xs), y); else ctx.moveTo(L.X(xs), y);
    });
  };
  for (const s of plates.strata) {
    ctx.fillStyle = css(rock(m.snow ? mix(NAZARE.strata[s.tone], NAZARE.snowCap, 0.25) : NAZARE.strata[s.tone]));
    ctx.beginPath();
    edge(s);
    ctx.lineTo(L.X(1.14), L.Y(0.84));
    ctx.lineTo(L.X(STRATA_X0), L.Y(0.84));
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = css(NAZARE.crevice, 0.3 * day);
  ctx.lineWidth = Math.max(0.6, 0.8 * u);
  ctx.beginPath();
  for (const s of plates.strata) edge(s);
  ctx.stroke();
  // two faces: the one that looks out to sea (left of the ridge) and the one
  // that looks at us. The morning sun, from the land, lights ours and leaves
  // the sea face in shade; the evening sun, from the sea, turns that round.
  const ridge = plates.ridge;
  const side = (seaward) => {
    const far = L.X(seaward ? 0.4 : 1.14);
    ctx.beginPath();
    ctx.moveTo(far, L.Y(0.84));
    ctx.lineTo(far, L.Y(0.26));
    ctx.lineTo(L.X(ridge[ridge.length - 1].x), L.Y(0.26));
    for (let i = ridge.length - 1; i >= 0; i--) ctx.lineTo(L.X(ridge[i].x), L.Y(ridge[i].y));
    ctx.lineTo(L.X(ridge[0].x), L.Y(0.84));
    ctx.closePath();
  };
  const wash = (seaward, colour, alpha) => {
    if (alpha <= 0.004) return;
    ctx.fillStyle = css(colour, alpha);
    side(seaward);
    ctx.fill();
  };
  wash(true, NAZARE.cliffNight, 0.1 + 0.4 * (1 - sea) * sunny);
  wash(true, mix(NAZARE.cliffLit, NAZARE.sunLow, 0.5 * low), (0.3 + 0.12 * low) * sea * sunny);
  wash(false, NAZARE.cliffNight, 0.04 + 0.4 * sea * sunny);
  wash(false, NAZARE.cliffLit, 0.16 * (1 - sea) * sunny);
  // the foot stands in its own shade
  const fg = ctx.createLinearGradient(0, L.Y(0.52), 0, L.Y(CLIFF.bottom));
  fg.addColorStop(0, css(NAZARE.cliffNight, 0));
  fg.addColorStop(1, css(NAZARE.cliffNight, 0.3));
  ctx.fillStyle = fg;
  ctx.fillRect(L.X(0.4), L.Y(0.52), 0.8 * L.w, L.Y(CLIFF.bottom) - L.Y(0.52));
  // ledges: a short shelf with a dark underside and, by day, a lit lip
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    if (pass && sunny <= 0.02) break;
    ctx.strokeStyle = pass ? css(NAZARE.cliffLit, 0.22 * sunny) : css(mix(NAZARE.crevice, NAZARE.seaDeep, m.night), 0.5 - 0.2 * m.night);
    ctx.lineWidth = pass ? Math.max(0.6, 0.8 * u) : Math.max(1, 1.5 * u);
    ctx.beginPath();
    for (const s of plates.ledges) {
      const x0 = L.X(s.x0);
      const x1 = L.X(s.x0 + s.len);
      const y0 = L.Y(s.y) - (pass ? 1.3 * u : 0);
      ctx.moveTo(x0, y0);
      ctx.lineTo(lerp(x0, x1, 0.45), y0 + s.slope * 0.3 * (x1 - x0) + s.kink * u);
      ctx.lineTo(x1, y0 + s.slope * (x1 - x0));
    }
    ctx.stroke();
  }
  // crevices: dark cracks running down the rock, a lit edge beside each by day
  for (const pass of [0, 1]) {
    if (pass && sunny <= 0.02) break;
    ctx.strokeStyle = pass ? css(NAZARE.cliffLit, 0.12 * sunny) : css(mix(NAZARE.crevice, NAZARE.seaDeep, m.night), 0.5 - 0.2 * m.night);
    ctx.lineWidth = pass ? Math.max(0.5, 0.7 * u) : Math.max(0.8, 1 * u);
    ctx.beginPath();
    for (const c of plates.crevices) {
      c.forEach((p, i) => {
        const x = L.X(p.x) + (pass ? (sea > 0.5 ? -1.2 : 1.2) * u : 0);
        if (i) ctx.lineTo(x, L.Y(p.y)); else ctx.moveTo(x, L.Y(p.y));
      });
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // scrub holding on to the ledges
  ctx.fillStyle = css(m.snow ? mix(NAZARE.snowCap, NAZARE.cliffNight, 0.5 * m.night) : tone(NAZARE.cliffScrub, NAZARE.scrubDusk, NAZARE.scrubNight, m.night));
  ctx.beginPath();
  for (const t of plates.tufts) {
    const r = t.r * L.w;
    for (const [dx, dy, k] of [[-0.8, 0.1, 0.75], [0, -0.35, 1], [0.85, 0.15, 0.7]]) {
      ctx.moveTo(L.X(t.x) + dx * r + k * r, L.Y(t.y) + dy * r);
      ctx.arc(L.X(t.x) + dx * r, L.Y(t.y) + dy * r, k * r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
  // the sun's rim along the top and, when it stands over the sea, down the face
  if (m.night < 1) {
    ctx.strokeStyle = css(NAZARE.cliffRim, 0.9 * (1 - m.night) * (0.35 + 0.65 * sunny));
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.beginPath();
    if (sunSide(phase) < 0) face();
    else ctx.moveTo(L.X(CLIFF.top.x0), L.Y(CLIFF.top.y));
    for (const p of plates.top) ctx.lineTo(L.X(p.x), L.Y(p.y));
    ctx.stroke();
  }
}

export function drawFort(ctx, rect, phase, tint, weather, plates) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const u = L.h / 396;
  const side = sunSide(phase);
  const day = 1 - m.night;
  const sunny = day * (1 - 0.75 * gloom(weather));
  const sea = seaSideLight(phase);
  const block = tone(NAZARE.fortDay, NAZARE.fortDay, NAZARE.fortNight, m.night);
  const fx0 = L.X(FORT.x0);
  const fx1 = L.X(FORT.x1);
  const fy0 = L.Y(FORT.y0);
  const fy1 = L.Y(FORT.y1);
  const merlonTop = fy0 - 0.012 * L.h;
  ctx.fillStyle = css(block);
  ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  for (let x = fx0; x + 0.012 * L.w <= fx1; x += 0.03 * L.w) ctx.fillRect(x, merlonTop, 0.012 * L.w, 0.012 * L.h + 0.5);
  // the wall faces us: lit in the morning, in shade once the sun is over the sea
  ctx.fillStyle = css(NAZARE.cliffNight, 0.3 * sea * sunny);
  ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  ctx.fillStyle = css(NAZARE.cliffLit, 0.14 * (1 - sea) * sunny);
  ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  // a string course under the battlements and the sun's rim on its side
  ctx.fillStyle = css(NAZARE.crevice, 0.3);
  ctx.fillRect(fx0, fy0 + 1.2 * u, fx1 - fx0, 0.7 * u);
  if (m.night < 1) {
    ctx.fillStyle = css(NAZARE.cliffRim, 0.8 * day * (0.3 + 0.7 * sunny));
    ctx.fillRect(side < 0 ? fx0 : fx1 - 1.2 * u, fy0, 1.2 * u, fy1 - fy0);
  }
  if (m.snow) {
    ctx.fillStyle = css(NAZARE.snowCap);
    for (let x = fx0; x + 0.012 * L.w <= fx1; x += 0.03 * L.w) ctx.fillRect(x, merlonTop - 1.5, 0.012 * L.w, 2.5);
  }
  // the lighthouse on the roof. Its squat white base: white by day, shading
  // into the night, rimmed on the sun's side and shaded on the other
  const tw = tone(NAZARE.towerWhite, mix(NAZARE.towerWhite, NAZARE.towerShade, 0.5), NAZARE.towerShade, m.night);
  const tx0 = L.X(TOWER.x0);
  const tx1 = L.X(TOWER.x1);
  const ty0 = L.Y(TOWER.y0);
  const ty1 = L.Y(TOWER.y1);
  ctx.fillStyle = css(tw);
  ctx.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
  ctx.fillStyle = css(NAZARE.towerShade, 0.28 * day);
  ctx.fillRect(side < 0 ? (tx0 + tx1) / 2 : tx0, ty0, (tx1 - tx0) / 2, ty1 - ty0);
  if (m.night < 1) {
    ctx.fillStyle = css(NAZARE.cliffRim, 0.9 * day);
    ctx.fillRect(side < 0 ? tx0 : tx1 - 1.2 * u, ty0, 1.2 * u, ty1 - ty0);
  }
  // the red iron lantern: a drum, a band of glass (dark by day), a dome and its vent
  const lamp = lampOn(m);
  const red = tone(NAZARE.lanternRed, mix(NAZARE.lanternRed, NAZARE.lanternRedShade, 0.6), mix(NAZARE.lanternRedShade, NAZARE.cliffNight, 0.6), m.night);
  const rx0 = L.X(LAMP_ROOM.x0);
  const rx1 = L.X(LAMP_ROOM.x1);
  const ry0 = L.Y(LAMP_ROOM.y0);
  const lx = L.X(LANTERN.x);
  const ly = L.Y(LANTERN.y);
  ctx.fillStyle = css(red);
  ctx.fillRect(rx0, ry0, rx1 - rx0, ty0 - ry0);
  ctx.fillStyle = css(NAZARE.lanternRedShade, 0.5 * day);
  ctx.fillRect(side < 0 ? lx : rx0, ry0, (rx1 - rx0) / 2, ty0 - ry0);
  const gy0 = L.Y(LAMP_ROOM.glass.y0);
  const gy1 = L.Y(LAMP_ROOM.glass.y1);
  ctx.fillStyle = css(mix(NAZARE.towerShade, NAZARE.lanternLight, 0.9 * lamp));
  ctx.fillRect(rx0 + 0.8 * u, gy0, rx1 - rx0 - 1.6 * u, gy1 - gy0);
  ctx.fillStyle = css(red);
  ctx.fillRect(lx - 0.35 * u, gy0, 0.7 * u, gy1 - gy0);
  ctx.beginPath();
  ctx.ellipse(lx, ry0 + 0.3 * u, (rx1 - rx0) / 2 + 0.8 * u, ry0 - L.Y(LANTERN.roof.y0 + 0.006), 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(lx - 0.6 * u, L.Y(LANTERN.roof.y0), 1.2 * u, 0.008 * L.h);
  // the gallery round the lantern: a deck that overhangs the base, and its rail
  const g0 = L.X(GALLERY.x0);
  const g1 = L.X(GALLERY.x1);
  ctx.fillStyle = css(mix(NAZARE.gallery, NAZARE.cliffNight, 0.6 * m.night));
  ctx.fillRect(g0, ty0 - 0.8 * u, g1 - g0, 1.8 * u);
  ctx.fillRect(g0, ty0 - 4.4 * u, g1 - g0, 0.7 * u);
  for (let k = 0; k <= 6; k++) ctx.fillRect(lerp(g0, g1 - 0.6 * u, k / 6), ty0 - 4.4 * u, 0.6 * u, 3.8 * u);
  if (m.snow) {
    ctx.fillStyle = css(NAZARE.snowCap);
    ctx.fillRect(g0, ty0 - 5.4 * u, g1 - g0, 1.4 * u);
  }
  if (lamp > 0) {
    glow(ctx, lx, ly, 0.06 * L.w, NAZARE.lanternLight, 0.9 * lamp);
    ctx.fillStyle = css(NAZARE.lanternLight, lamp);
    ctx.fillRect(lx - 1, ly - 1, 2, 2);
  }
  if (m.night > 0) {
    // the Sitio's windows come on behind the fort
    for (const w of plates.windows) {
      ctx.fillStyle = css(NAZARE.villageWindow, m.night);
      ctx.fillRect(L.X(w.x), L.Y(w.y), 1.5, 1.5);
      glow(ctx, L.X(w.x), L.Y(w.y), 6, NAZARE.villageWindow, 0.5 * m.night);
    }
  }
}

// ---- the wave ----------------------------------------------------------------
const bump = (t) => smoothstep(clamp(t));
// where the wave's foot is at roll phase p (a share of the height): it comes at you
export const baseAt = (p) => lerp(WAVE.formY, WAVE.breakY, bump(p * 1.04));
// how much of it stands up: it builds slowly out of the swell, low for most of
// its approach and steepening into the break, so the wave behind is always
// clearly smaller than the one breaking; it shrinks with distance too. Then it
// spends itself on the sand.
const growAt = (p) => bump(p / WAVE.fullAt) ** 3 * (0.6 + 0.4 * bump(p / WAVE.fullAt));
export const standAt = (p) => growAt(p) * (1 - bump((p - WAVE.spendFrom) / 0.16));
// its height along the bay, 0..1: tallest at the rock, where the canyon focuses it
export const reachAt = (xs) => WAVE.lowShare + (1 - WAVE.lowShare) * bump((xs - WAVE.x0) / (WAVE.rock - WAVE.x0));
// where the break has got to: nowhere before peelFrom, then from the rock leftward
export const breakAt = (p) => (p < WAVE.peelFrom ? WAVE.x1 : lerp(WAVE.rock, WAVE.x0, bump((p - WAVE.peelFrom) / (WAVE.peelTo - WAVE.peelFrom))));

// where the foam is, 0..1, through one roll
const foamAmount = (p) => (p < WAVE.peelFrom ? 0 : p < 0.5 ? bump((p - WAVE.peelFrom) / 0.1) : 1 - bump((p - 0.85) / 0.15));

// How much of its height the wall loses behind the break.
export const COLLAPSE = 0.55;
// One wave at roll offset `lag` (0 the leading wave, WAVE.lag the one behind).
export function waveState(L, weather, nowMs, reduced, lag = 0) {
  const metres = waveHeightOf(weather);
  const size = waveSize(metres);
  const roll = rollMs(weather, reduced);
  const p = wrap(wavePhase(nowMs, roll) + lag);
  const baseTop = baseAt(p);
  const stand = standAt(p);
  const brk = breakAt(p);
  const height = (xs) => stand * size * L.h * reachAt(xs);
  const crest = (xs) => L.Y(baseTop) - height(xs);
  // what is left standing once the break has passed: the wall falls into its own foam
  const body = (xs) => height(xs) * (xs <= brk ? 1 : 1 - COLLAPSE * bump((xs - brk) / 0.1));
  const at = clamp(brk, WAVE.x0, WAVE.rock);
  const foam = { x: L.X(at), y: crest(at) + 0.3 * height(at), r: 0.5 * size * L.h * (0.4 + 0.6 * stand), a: foamAmount(p) };
  return { metres, size, roll, p, baseTop, stand, brk, height, crest, body, foam };
}

// Both waves on the water, the farther (earlier in its roll) first.
// One paint asks for them from several layers with the same arguments, so the
// last answer is kept and handed back while those arguments are unchanged.
let lastStates = null;
export function waveStates(L, weather, nowMs, reduced) {
  const k = lastStates;
  if (k && k.L.w === L.w && k.L.h === L.h && k.L.ox === L.ox && k.L.oy === L.oy && k.weather === weather && k.nowMs === nowMs && k.reduced === reduced) return k.states;
  const states = [waveState(L, weather, nowMs, reduced, 0), waveState(L, weather, nowMs, reduced, WAVE.lag)].sort((a, b) => a.p - b.p);
  lastStates = { L, weather, nowMs, reduced, states };
  return states;
}


const STEP = 0.01;
// How tall the whitewater stands at xs behind the break, in px: settling as it ages.
const whiteTall = (s, xs) => (xs < s.brk ? 0 : s.height(xs) * (0.8 - 0.45 * clamp((xs - s.brk) / 0.25)));
// The highest pixel any of wave `s` reaches at xs: its crest, or the top of its foam.
export function waveTopAt(L, s, xs) {
  const tall = s.stand > 0.001 && s.brk < WAVE.x1 ? whiteTall(s, xs) : 0;
  const foam = tall >= 1 ? L.Y(s.baseTop) - 1.2 * tall - 2 : Infinity;
  return Math.min(s.crest(xs), foam);
}
// The shares of the width the wave is drawn at, left to right.
const XS = (() => {
  const out = [];
  for (let xs = WAVE.x0; xs <= WAVE.x1 + 1e-9; xs += STEP) out.push(xs);
  return out;
})();
// How far the lip pitches, 0..1: a hairline on a calm or moderate day, a curling lip on a big or giant one.
export const curlAmount = (size) => clamp((size - 0.06) / 0.09);

function oneWave(ctx, L, s, m, tint, foamCol, push, nowMs, reduced, sea, lt) {
  const base = L.Y(s.baseTop);
  if (s.stand <= 0.001) return;
  const u = L.h / 396;
  const tm = reduced ? nowMs * REDUCED_DRIFT : nowMs;
  const peak = s.height(WAVE.rock);
  const hs = XS.map((xs) => s.body(xs));
  const end = Math.min(s.brk, WAVE.x1);
  const broken = s.brk < WAVE.x1;
  // the face: dark at its base, a lighter translucent green toward the lip,
  // green-gold where a low sun shines through it from behind
  const dull = (c, k) => mix(water(mix(c, NAZARE.seaNight, k * m.night), m, tint), NAZARE.seaGrey, 0.4 * lt.grey * (1 - m.night));
  const foot = sea.at(s.baseTop);
  const shade = mix(dull(NAZARE.faceShadow, 0.85), NAZARE.seaDeep, 0.15 + 0.35 * m.night);
  const mid = mix(dull(NAZARE.faceGreen, 0.85), NAZARE.faceBacklit, 0.32 * lt.low);
  const glass = mix(dull(NAZARE.faceGlass, 0.8), NAZARE.faceBacklit, 0.75 * lt.low);
  const faceAt = (f) => (f < 0.16 ? mix(foot, shade, f / 0.16) : f < 0.6 ? mix(shade, mid, (f - 0.16) / 0.44) : mix(mid, glass, (f - 0.6) / 0.4));
  // the foam trail the wave leaves behind it: flecks and streaks on the water
  // toward the horizon, drifting with the wind and fading with age; the face
  // is painted over what it hides
  {
    const strength = bump((s.p - 0.3) / 0.2) * (1 - bump((s.p - 0.8) / 0.2)) * Math.min(1, s.size / 0.1 + 0.25);
    if (strength > 0.02) {
      const reach = 0.1 * L.h * (0.6 + s.size / 0.29);
      const hz = L.Y(HORIZON) + 3;
      for (let k = 0; k < 18; k++) {
        const age = hash2(k, 71);
        const y = base - 2 - age * reach;
        if (y < hz) continue;
        const xs = WAVE.x0 + (WAVE.x1 + 0.04 - WAVE.x0) * wrap(hash2(k, 72) + push * tm / 40000 + 0.02 * Math.sin(tm / 2600 + k));
        const w = (0.02 + 0.04 * hash2(k, 73)) * L.w;
        ctx.fillStyle = css(foamCol, 0.34 * strength * (1 - age) ** 1.3 * (1 - 0.5 * m.night));
        ctx.fillRect(L.X(xs), y, w, 1 + (hash2(k, 74) > 0.6 ? 1 : 0));
      }
    }
  }
  // bands from the lip down, each painted over the foot of the one above it
  const bands = peak < 6 * u ? 3 : 8;
  for (let i = bands - 1; i >= 0; i--) {
    const f1 = (i + 1) / bands;
    ctx.fillStyle = css(faceAt((i + 0.5) / bands));
    ctx.beginPath();
    ctx.moveTo(L.X(WAVE.x0), base + 2);
    XS.forEach((xs, j) => ctx.lineTo(L.X(xs), base - f1 * hs[j]));
    ctx.lineTo(L.X(WAVE.x1), base + 2);
    ctx.closePath();
    ctx.fill();
  }
  // a low sun behind the wave shines through its face where it stands in front of the disc
  if (lt.low > 0 && lt.sun > 0) {
    const sxs = sunSpot(lt.phase).x;
    const h = s.height(sxs);
    if (h > 5 * u) sheen(ctx, L.X(sxs), base - 0.62 * h, 0.1 * L.w, 0.4 * h, NAZARE.faceBacklit, 0.3 * lt.low * Math.min(1, 2 * lt.sun) * s.stand);
  }
  // streaks the water draws as it is pulled up the face, raking toward the
  // break, and a brighter dash climbing each one
  ctx.lineCap = 'round';
  if (peak > 9 * u) {
    const lean = 0.014 * L.w;
    const streak = mix(glass, foamCol, 0.5);
    for (const pass of [0, 1]) {
      ctx.strokeStyle = css(streak, (pass ? 0.4 : 0.2) * s.stand * (1 - 0.55 * m.night));
      ctx.lineWidth = Math.max(0.6, (pass ? 1 : 0.8) * u);
      ctx.beginPath();
      for (let k = 0; k < 20; k++) {
        const xs = WAVE.x0 + 0.05 + ((k + hash2(k, 75)) / 20) * (WAVE.rock - WAVE.x0 - 0.02);
        if (xs > end - 0.012) continue;
        const h = s.height(xs);
        if (h < 7 * u) continue;
        const x = L.X(xs);
        const at = (f) => [x + lean * ((f - 0.12) / 0.78) ** 1.6, base - f * h];
        const f0 = pass ? 0.12 + 0.6 * wrap(tm / 1700 + hash2(k, 76)) : 0.12;
        const f1 = pass ? f0 + 0.16 : 0.62 + 0.28 * hash2(k, 77);
        ctx.moveTo(...at(f0));
        ctx.lineTo(...at((f0 + f1) / 2));
        ctx.lineTo(...at(f1));
      }
      ctx.stroke();
    }
  }
  // the lip: a feathered line on a small wave; on a big one it pitches, thick
  // and bright, and hangs furthest over the face just ahead of the break
  const curl = curlAmount(s.size);
  const pre = bump((s.p - 0.2) / 0.2);
  const near = (xs) => (broken ? clamp(1 - (end - xs) / 0.22) ** 2 : 0.3 * clamp(1 - (WAVE.rock - xs) / 0.3) * pre);
  const thick = (xs, h) => 0.7 * u + h * pre * (0.03 + curl * (0.07 + 0.3 * near(xs)));
  const lipTo = XS.filter((xs) => xs <= end + 1e-9);
  if (lipTo.length > 1) {
    const lip = (share, colour, alpha) => {
      ctx.fillStyle = css(colour, alpha);
      ctx.beginPath();
      lipTo.forEach((xs, j) => (j ? ctx.lineTo(L.X(xs), base - hs[j]) : ctx.moveTo(L.X(xs), base - hs[j])));
      for (let j = lipTo.length - 1; j >= 0; j--) {
        const drip = 1 + 0.16 * curl * Math.sin(j * 0.9 + tm / 420);
        ctx.lineTo(L.X(lipTo[j]), base - hs[j] + share * thick(lipTo[j], hs[j]) * drip);
      }
      ctx.closePath();
      ctx.fill();
    };
    // its shadow on the face under it, where it hangs out furthest
    if (curl > 0.1 && broken) {
      const from = lipTo.findIndex((xs) => xs >= end - 0.16);
      if (from >= 0 && from < lipTo.length - 1) {
        ctx.fillStyle = css(NAZARE.seaDeep, 0.36 * curl * (1 - 0.5 * m.night));
        ctx.beginPath();
        for (let j = from; j < lipTo.length; j++) {
          const y = base - hs[j] + thick(lipTo[j], hs[j]) * 0.9;
          if (j === from) ctx.moveTo(L.X(lipTo[j]), y); else ctx.lineTo(L.X(lipTo[j]), y);
        }
        for (let j = lipTo.length - 1; j >= from; j--) ctx.lineTo(L.X(lipTo[j]), base - hs[j] + thick(lipTo[j], hs[j]) * (1 + 0.75 * near(lipTo[j])) + u);
        ctx.closePath();
        ctx.fill();
      }
    }
    const thrown = mix(mix(foamCol, mid, 0.5), NAZARE.sunPath, 0.45 * lt.low);
    const seen = 1 - 0.35 * m.night;
    lip(1, thrown, (0.55 + 0.35 * s.stand) * seen);
    lip(0.55, mix(foamCol, NAZARE.sunPath, 0.3 * lt.low), (0.6 + 0.4 * s.stand) * seen);
  }
  ctx.lineCap = 'butt';
  if (!broken) return;
  const fa = clamp(s.foam.a + (m.storm ? 0.2 : 0));
  // whitewater behind the break: a firm tumbling mass, a shaded body with a
  // bright core in every lump, settling as it ages. It runs on behind the
  // rock, so it never stops short of the cliff.
  const from = Math.max(s.brk, WAVE.x0);
  const underside = mix(foamCol, shade, 0.42 + 0.2 * m.night);
  const bright = mix(foamCol, shade, 0.15 * m.night);
  // one lump every step along its top; a lump is never bigger than a few px,
  // so a tall mass is many of them stacked, not a few balloons
  const lumps = [];
  for (let xs = from, k = 0; xs <= WAVE.x1 + 1e-9; xs += 0.011, k++) {
    const tall = whiteTall(s, xs);
    if (tall < 1) continue;
    const wob = 1 + 0.08 * Math.sin(tm / 380 + k * 1.7);
    const r = Math.max(2.6 * u, Math.min((0.3 + 0.14 * hash2(k, 57)) * tall + 1.5 * u, (5.5 + 3 * hash2(k, 57)) * u)) * wob;
    lumps.push({ k, x: L.X(xs) + (hash2(k, 55) - 0.5) * 3 * u, y: base - (0.72 + 0.2 * hash2(k, 56)) * tall, r });
  }
  if (lumps.length > 0 && fa > 0.01) {
    const first = lumps[0];
    const last = lumps[lumps.length - 1];
    ctx.save();
    // it is there as soon as the lip lands, not faded in
    ctx.globalAlpha = clamp(3 * fa);
    // the shaded body under the lumps
    ctx.fillStyle = css(underside);
    ctx.beginPath();
    ctx.moveTo(first.x - 1.6 * first.r, base + 2);
    ctx.quadraticCurveTo(first.x - 1.3 * first.r, first.y, first.x, first.y);
    for (const l of lumps) ctx.lineTo(l.x, l.y);
    ctx.lineTo(last.x + last.r, base + 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (const l of lumps) {
      ctx.moveTo(l.x + l.r, l.y);
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    }
    ctx.fill();
    // the bright core of each lump along the top, and more of them tumbling
    // down the front, with the shaded body showing between
    ctx.fillStyle = css(bright);
    ctx.beginPath();
    for (const l of lumps) {
      // (a small lump is all core, so a low wave's foam is a band, not a string of beads)
      const core = lerp(0.96, 0.72, clamp((l.r - 3 * u) / (3 * u)));
      const cx = l.x - 0.18 * l.r * (1 - core) / 0.28;
      const cy = l.y - 0.24 * l.r * (1 - core) / 0.28;
      ctx.moveTo(cx + core * l.r, cy);
      ctx.arc(cx, cy, core * l.r, 0, Math.PI * 2);
      // tiers of it lower down: each a scalloped band, the shaded body between them
      const tiers = Math.min(4, Math.floor((base - l.y - l.r) / (2.7 * l.r)));
      for (let j = 1; j <= tiers; j++) {
        if (hash2(l.k * 7 + j, 60) > 0.72) continue;
        const rr = l.r * (0.62 + 0.25 * hash2(l.k * 7 + j, 58));
        const fx = l.x + (hash2(l.k * 7 + j, 59) - 0.5) * l.r;
        const fy = l.y + j * 2.7 * l.r + 0.35 * l.r * Math.sin(tm / 450 + 0.6 * l.k + j);
        ctx.moveTo(fx + rr, fy);
        ctx.arc(fx, fy, rr, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    // the froth line it pushes ahead of it over the water
    ctx.strokeStyle = css(bright, 0.85);
    ctx.lineWidth = Math.max(1, 1.4 * u);
    ctx.lineCap = 'round';
    ctx.beginPath();
    lumps.forEach((l, k) => {
      const y = base + 1.5 + 0.8 * u * Math.sin(k * 1.9 + tm / 500);
      if (k) ctx.lineTo(l.x, y); else ctx.moveTo(l.x - 1.6 * l.r, y);
    });
    ctx.lineTo(last.x + last.r, base + 1.5);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.restore();
    // mist over the freshest of it
    for (const l of lumps.slice(0, 3)) puff(ctx, l.x, l.y - 0.8 * l.r, 2.2 * l.r, foamCol, 0.2 * fa * (1 - 0.5 * m.night));
  }
}

export function drawWave(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const lt = seaLight(phase, weather);
  const sea = seaTones(m, tint, lt);
  const foamCol = mix(m.wet ? mix(NAZARE.foam, NAZARE.dull, 0.35) : NAZARE.foam, NAZARE.foamNight, m.night);
  const push = windPush(weather && weather.windSpeed, weather && weather.windDir);
  const states = waveStates(L, weather, nowMs, reduced);
  for (const s of states) oneWave(ctx, L, s, m, tint, foamCol, push, nowMs, reduced, sea, lt);
  return states[states.length - 1];
}

// How hard wave `s` is hitting the rock, 0..1: from its break until it spends itself.
export const hitAt = (p) => bump((p - WAVE.peelFrom) / 0.1) * (1 - bump((p - 0.8) / 0.15));
// How high a full hit throws its plume up the rock, in px.
// Never past the top of the light, however big the sea: a giant's crest is already at the cliff top.
export const SPRAY_TOP = 0.2;
export function sprayRise(s, L) {
  const h = s.height(WAVE.rock);
  return Math.min((0.6 + 1.2 * Math.min(1, s.size / 0.26)) * h, Math.max(0.5 * h, s.crest(WAVE.rock) + 0.3 * h - L.Y(SPRAY_TOP)));
}

// The spray, painted after the headland so it climbs in front of the rock:
// where each breaking wave meets the cliff it throws a plume up the face that
// thins to mist as it rises and leans with the wind; spray streams off the lip
// at the break; and on a rough day spume blows off the cliff top.
export function drawSpray(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const foamCol = mix(m.wet ? mix(NAZARE.foam, NAZARE.dull, 0.35) : NAZARE.foam, NAZARE.foamNight, m.night);
  const push = windPush(weather && weather.windSpeed, weather && weather.windDir);
  for (const s of waveStates(L, weather, nowMs, reduced)) {
    const hit = hitAt(s.p) * s.stand;
    if (hit > 0.01) {
      const top = s.crest(WAVE.rock);
      const rise = sprayRise(s, L) * hit;
      const faceX = (y) => L.X(cliffFaceX((y - L.oy) / L.h, plates));
      for (let k = 0; k < 14; k++) {
        const up = k / 13;
        const y = top + 0.3 * s.height(WAVE.rock) - up * rise;
        const x = faceX(y) - 0.01 * L.w + push * up * up * 0.06 * L.w + (hash2(k, 57) - 0.5) * 0.012 * L.w;
        puff(ctx, x, y, (0.022 + 0.04 * up) * L.w * (0.5 + Math.min(1, s.size / 0.26)), foamCol, 0.55 * hit * (1 - 0.85 * up) * (0.35 + 0.65 * clamp(s.size / 0.18)));
      }
    }
    // spray streaming off the lip at the break, blown by the wind
    if (s.brk > WAVE.x0 && s.brk < WAVE.x1) {
      const fa = clamp(s.foam.a + (m.storm ? 0.2 : 0));
      const cy = s.crest(s.brk);
      const len = 0.3 * s.size * L.h * (0.5 + Math.abs(push));
      for (let k = 0; k < 5; k++) {
        const t = 0.4 + 0.6 * hash2(k, 31);
        puff(ctx, L.X(s.brk) + push * len * 0.8 * t, cy - len * (1 - 0.3 * Math.abs(push)) * t, 0.012 * L.w + 0.25 * len * t, mix(NAZARE.spray, NAZARE.foamNight, m.night), 0.3 * fa * (1 - t * 0.6));
      }
    }
  }
  // spindrift: on big and giant days the wind tears flecks off the lip and
  // carries them downwind (straight up, with no wind reading); droplets also
  // lift off the plume where the wave meets the rock
  const tm = reduced ? nowMs * REDUCED_DRIFT : nowMs;
  const dark = 1 - 0.6 * m.night;
  const dropCol = mix(NAZARE.spray, NAZARE.foamNight, m.night);
  // the wind off the land blows the top of the wave back over its crest: a
  // veil of feathers standing off the lip, longer the harder it blows, leaning
  // the way the wind goes
  {
    const blow = windBlow(weather);
    const u = L.h / 396;
    ctx.lineCap = 'round';
    for (const s of waveStates(L, weather, nowMs, reduced)) {
      const curl = curlAmount(s.size);
      if (curl <= 0.05 || s.stand < 0.25) continue;
      const end = Math.min(s.brk, WAVE.rock + 0.02);
      for (const pass of [0, 1]) {
        ctx.strokeStyle = css(dropCol, (pass ? 0.16 : 0.34) * (0.35 + 0.65 * blow) * s.stand * curl * dark);
        ctx.lineWidth = Math.max(0.7, (pass ? 2.2 : 1.1) * u);
        ctx.beginPath();
        for (let k = pass; k < 26; k += 2) {
          const xs = WAVE.x0 + 0.08 + (end - WAVE.x0 - 0.08) * ((k + hash2(k, 85)) / 26);
          if (xs > end) continue;
          const h = s.height(xs);
          const len = h * (0.1 + 0.42 * blow) * (0.45 + 0.55 * hash2(k, 86)) * (0.8 + 0.2 * Math.sin(tm / 260 + k * 2.4));
          const x = L.X(xs);
          const y = s.crest(xs);
          const dx = (0.75 * push + 0.12) * len;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 0.15 * dx, y - 0.65 * len, x + dx, y - len);
        }
        ctx.stroke();
      }
      // and the mist those feathers thin into
      for (let k = 0; k < 9; k++) {
        const xs = WAVE.x0 + 0.1 + (end - WAVE.x0 - 0.1) * ((k + 0.5) / 9);
        if (xs > end) continue;
        const len = s.height(xs) * (0.1 + 0.42 * blow);
        puff(ctx, L.X(xs) + (0.4 * push + 0.06) * len, s.crest(xs) - 0.45 * len, 0.7 * len + 2 * u, dropCol, 0.2 * (0.3 + 0.7 * blow) * s.stand * curl * dark);
      }
    }
    ctx.lineCap = 'butt';
  }
  for (const s of waveStates(L, weather, nowMs, reduced)) {
    if (s.size >= 0.1 && s.stand > 0.3) {
      const fa = 0.4 + 0.6 * clamp(s.foam.a + 0.3);
      for (let k = 0; k < 10; k++) {
        const life = wrap(tm / 1500 + hash2(k, 81));
        const xs = WAVE.x0 + 0.1 + (Math.min(s.brk, WAVE.rock) - WAVE.x0 - 0.1) * hash2(k, 82);
        const x = L.X(xs) + push * life * 0.09 * L.w;
        const y = s.crest(xs) - life * 0.5 * s.height(xs) - 1;
        ctx.fillStyle = css(dropCol, 0.5 * Math.sin(Math.PI * life) * fa * dark * clamp(s.size / 0.18 + 0.3));
        ctx.fillRect(x, y, 1 + 1.5 * Math.abs(push) * life, 1);
      }
    }
    const hit = hitAt(s.p) * s.stand;
    if (hit > 0.05) {
      const faceX = (y) => L.X(cliffFaceX((y - L.oy) / L.h, plates));
      const rise = sprayRise(s, L) * hit;
      for (let k = 0; k < 8; k++) {
        const life = wrap(tm / 1300 + hash2(k, 83));
        const y0 = s.crest(WAVE.rock) + 0.3 * s.height(WAVE.rock);
        const y = y0 - life * rise * 1.1;
        const x = faceX(y) - 0.012 * L.w + push * life * 0.08 * L.w + (hash2(k, 84) - 0.5) * 0.012 * L.w;
        ctx.fillStyle = css(dropCol, 0.55 * hit * Math.sin(Math.PI * life) * dark);
        ctx.fillRect(x, y, 1.2, 1.2);
      }
    }
  }
  // spume off the cliff top on a rough day, carried the way the wind goes
  const rough = roughness(weather);
  if (rough > 0) {
    const dir = push === 0 ? -1 : Math.sign(push);
    for (let k = 0; k < 12; k++) {
      const life = wrap(nowMs / 2400 + hash2(k, 58));
      const xs = CLIFF.top.x0 + 0.25 * hash2(k, 59) + dir * life * 0.25;
      const y = L.Y(CLIFF.top.y) - life * 0.06 * L.h - 0.04 * L.h * hash2(k, 60);
      puff(ctx, L.X(xs), y, (0.015 + 0.03 * life) * L.w, mix(NAZARE.spray, NAZARE.foamNight, m.night), 0.35 * rough * (1 - life));
    }
  }
}

// Fog swallows the headland: a veil that hides the tower and the far sea, with
// only the lamp's glow coming through it.
export function drawVeil(ctx, rect, phase, tint, weather) {
  const m = mood(tint, weather);
  if (!m.fog) return;
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const veil = mix(NAZARE.fogVeil, tint.skyLow, 0.4 + 0.5 * m.night);
  const g = ctx.createLinearGradient(0, L.oy, 0, L.oy + L.h);
  g.addColorStop(0, css(veil, 0.2));
  g.addColorStop(0.12, css(veil, 0.62));
  g.addColorStop(0.5, css(veil, 0.48));
  g.addColorStop(1, css(veil, 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(L.ox, L.oy, L.w, L.h);
  const lamp = lampOn(m);
  // a warm halo laid over the pale fog (light added to a pale veil would not show), then the lamp's own glow
  puff(ctx, L.X(LANTERN.x), L.Y(LANTERN.y), 0.08 * L.w, mix(NAZARE.lanternLight, NAZARE.lanternRoof, 0.35), 0.7 * lamp * (1 - 0.6 * m.night));
  const dark = 0.15 + 0.85 * m.night;
  glow(ctx, L.X(LANTERN.x), L.Y(LANTERN.y), 0.16 * L.w, NAZARE.lanternLight, 0.55 * lamp * dark);
  glow(ctx, L.X(LANTERN.x), L.Y(LANTERN.y), 0.04 * L.w, NAZARE.lanternLight, 0.9 * lamp * dark);
}


// Where surfer `i` of the plan is, in px, on wave `state`. Riders sit on the
// face just ahead of the break and run left with it, away from the lighthouse;
// they fade in as the wave stands up and out before it reaches the sand. The
// jet-ski tows ahead of its rider. The paddler waits outside the break and
// ducks under each wave as its face passes over them.
export const PADDLER = { x: 0.17, y: 0.545 };
export function surferSpots(L, weather, state, plan, nowMs, states = [state]) {
  const spots = [];
  const on = bump((state.p - 0.3) / 0.08) * (1 - bump((state.p - WAVE.spendFrom) / 0.06));
  const lead = Math.min(state.brk, WAVE.rock - 0.04);
  const base = L.Y(state.baseTop);
  plan.forEach((who, i) => {
    const q = surferProgress(who.kind === 'ski' ? 0 : i, nowMs, state.roll);
    const sway = Math.sin(2 * Math.PI * q);
    if (who.kind === 'paddler') {
      const xs = PADDLER.x + 0.006 * sway;
      // hidden while a wave's face stands over them
      const under = Math.max(0, ...states.map((s) => {
        const top = s.baseTop - s.height(xs) / L.h;
        return clamp((s.baseTop - PADDLER.y) / 0.01) * clamp((PADDLER.y - top) / 0.01);
      }));
      spots.push({ ...who, xs, x: L.X(xs), y: L.Y(PADDLER.y) + 0.003 * L.h * sway, fade: 1 - under });
      return;
    }
    let xs = lead - 0.03 - who.lane * 0.045 - 0.006 * sway;
    let y = base - state.height(xs) * (0.5 - 0.12 * who.lane);
    if (who.kind === 'ski') {
      xs -= 0.08;
      y = base - state.height(xs) * 0.12;
    }
    spots.push({ ...who, xs, x: L.X(xs), y, fade: xs < WAVE.x0 + 0.02 ? 0 : on });
  });
  return spots;
}

export function drawSurfers(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const states = waveStates(L, weather, nowMs, reduced);
  // the riders are on whichever wave is breaking now
  const state = states.reduce((best, s) => (Math.abs(s.p - 0.6) < Math.abs(best.p - 0.6) ? s : best));
  const band = waveBand(state.metres);
  const plan = surferPlan(band, tint.light);
  const alpha = surferAlpha(tint.light);
  if (plan.length === 0 || alpha <= 0) return plan.length;
  const spots = surferSpots(L, weather, state, plan, nowMs, states);
  // sized to the jar, so they read at the table and in the close-up alike
  const u = 0.0125 * L.h;
  const heavy = band === 'big' || band === 'giant';
  const rider = spots.find((s) => s.kind === 'rider');
  // a tapering white wake from (x, y) back along (dx, dy)
  const wake = (x, y, dx, dy, w, a) => {
    ctx.fillStyle = css(NAZARE.skiWake, a);
    ctx.beginPath();
    ctx.moveTo(x, y - w);
    ctx.quadraticCurveTo(x + 0.5 * dx, y + 0.3 * dy - 0.4 * w, x + dx, y + dy);
    ctx.quadraticCurveTo(x + 0.5 * dx, y + 0.3 * dy + 0.8 * w, x, y + w);
    ctx.closePath();
    ctx.fill();
  };
  spots.forEach((s, i) => {
    const a = alpha * s.fade;
    if (a <= 0) return;
    if (s.kind === 'ski') {
      // the tow line back to its rider, the white wake it cuts, then the craft and its driver
      if (rider && rider.fade > 0) {
        ctx.strokeStyle = css(NAZARE.towLine, 0.5 * a);
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(s.x + 0.4 * u, s.y - 0.5 * u);
        ctx.lineTo(rider.x - 0.3 * u, rider.y - 1.2 * u);
        ctx.stroke();
      }
      wake(s.x + 0.9 * u, s.y + 0.15 * u, 6.5 * u, -0.5 * u, 0.55 * u, 0.85 * a);
      ctx.fillStyle = css(NAZARE.skiWake, 0.9 * a);
      ctx.beginPath();
      ctx.ellipse(s.x + 0.2 * u, s.y + 0.4 * u, 1.7 * u, 0.3 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(NAZARE.ski, a);
      ctx.beginPath();
      ctx.moveTo(s.x - 1.5 * u, s.y - 0.1 * u);
      ctx.lineTo(s.x + 1.2 * u, s.y - 0.5 * u);
      ctx.lineTo(s.x + 1.4 * u, s.y + 0.25 * u);
      ctx.lineTo(s.x - 1.1 * u, s.y + 0.4 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = css(NAZARE.skiTrim, a);
      ctx.fillRect(s.x - 0.6 * u, s.y - 0.75 * u, 1.1 * u, 0.4 * u);
      ctx.strokeStyle = css(NAZARE.surfer, a);
      ctx.lineWidth = Math.max(1.2, 0.42 * u);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x + 0.2 * u, s.y - 0.7 * u);
      ctx.lineTo(s.x, s.y - 1.35 * u);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = css(NAZARE.surfer, a);
      ctx.beginPath();
      ctx.arc(s.x - 0.1 * u, s.y - 1.75 * u, 0.3 * u, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (s.kind === 'paddler') {
      // lying on the board, head up, arms in the water
      ctx.fillStyle = css(NAZARE.board, a);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 0.1 * u, 1.3 * u, 0.2 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(NAZARE.surfer, a);
      ctx.beginPath();
      ctx.ellipse(s.x - 0.15 * u, s.y - 0.2 * u, 0.85 * u, 0.24 * u, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s.x + 0.8 * u, s.y - 0.45 * u, 0.27 * u, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // the wake they carve, trailing back up the face behind them
    wake(s.x + 0.9 * u, s.y + 0.1 * u, 5.5 * u, -1.5 * u, 0.3 * u, 0.8 * a);
    // the board, nose down a touch toward where they are going
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(-0.14);
    ctx.fillStyle = css(NAZARE.board, a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.3 * u, 0.2 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    // the rider: low and crouched on a big face, standing easier on a small
    // one; legs apart on the board, body leaning the way they ride, arms out
    const hip = heavy ? [0.05 * u, -0.7 * u] : [0.02 * u, -0.95 * u];
    const neck = heavy ? [-0.4 * u, -1.25 * u] : [-0.2 * u, -1.7 * u];
    const head = heavy ? [-0.58 * u, -1.6 * u] : [-0.3 * u, -2.08 * u];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(NAZARE.surfer, a);
    ctx.lineWidth = Math.max(1.1, 0.34 * u);
    ctx.beginPath();
    ctx.moveTo(-0.55 * u, -0.15 * u);
    ctx.lineTo(...hip);
    ctx.lineTo(0.5 * u, -0.15 * u);
    ctx.stroke();
    // a bright vest on a big day, the wetsuit otherwise
    ctx.strokeStyle = css(heavy ? NAZARE.vests[i % NAZARE.vests.length] : NAZARE.surfer, a);
    ctx.lineWidth = Math.max(1.4, 0.5 * u);
    ctx.beginPath();
    ctx.moveTo(...hip);
    ctx.lineTo(...neck);
    ctx.stroke();
    ctx.strokeStyle = css(NAZARE.surfer, a);
    ctx.lineWidth = Math.max(0.9, 0.24 * u);
    ctx.beginPath();
    ctx.moveTo(-1.05 * u, neck[1] + 0.3 * u);
    ctx.lineTo(...neck);
    ctx.lineTo(0.5 * u, neck[1] - 0.05 * u);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.fillStyle = css(NAZARE.surfer, a);
    ctx.beginPath();
    ctx.arc(head[0], head[1], 0.28 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  return plan.length;
}

// The lamp turns about the tower's upright axis, so seen side-on each beam
// stays level (a hair below, aimed at the sea) and sweeps left and right:
// long when it lies across the view, foreshortened to a stub as it swings
// toward or away from us, and a flash at the lantern as it faces us.
// The lens throws its beams in one group, so from the beach the light keeps a
// rhythm: a quick run of flashes, then a long dark. The group of three in a
// fifteen-second turn is a stylised character for the jar; it is not taken
// from the charted list of lights.
// yaw 0 points right; sin(yaw) > 0 means the beam swings toward the viewer.
export const BEAM = { periodMs: 15000, group: [0, 0.45, 0.9], reach: 0.55, dip: 0.035 };
export function beamLobes(L, nowMs, fog = false) {
  const lx = L.X(LANTERN.x);
  const ly = L.Y(LANTERN.y);
  const yaw = wrap(nowMs / BEAM.periodMs) * Math.PI * 2;
  const len = BEAM.reach * L.w;
  const spread = (fog ? 0.14 : 0.07) * len;
  return BEAM.group.map((off) => {
    const ang = yaw + off;
    const across = Math.cos(ang);
    const toward = Math.sin(ang);
    return {
      yaw: ang,
      across,
      from: { x: lx, y: ly },
      tip: { x: lx + across * len, y: ly + BEAM.dip * len * Math.abs(across) },
      // the cone's far end, half its height; it reads wider as it swings toward us
      half: spread * (1 + 0.6 * Math.max(0, toward)),
      // a beam facing away is dimmer than one facing us
      strength: 0.6 + 0.4 * toward,
      flash: Math.max(0, toward) ** 60,
    };
  });
}

// How lit the foam of a wave is by the beams, 0..1: the bay lies to the left,
// so a beam lights it while it points left and its reach covers the foam.
export function foamLight(lobes, foamX) {
  let lit = 0;
  for (const b of lobes) {
    const reach = b.tip.x - b.from.x;
    if (reach >= 0 || foamX < b.tip.x || foamX > b.from.x) continue;
    lit = Math.max(lit, bump((-b.across - 0.75) / 0.25));
  }
  return lit;
}

export function drawBeam(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  if (m.night <= 0) return;
  const alpha = 0.18 * m.night * (m.fog ? 1.6 : 1);
  const lobes = beamLobes(L, nowMs, m.fog);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of lobes) {
    const a = alpha * b.strength;
    if (Math.abs(b.tip.x - b.from.x) > 1) {
      const g = ctx.createLinearGradient(b.from.x, b.from.y, b.tip.x, b.tip.y);
      g.addColorStop(0, css(NAZARE.beam, a));
      g.addColorStop(1, css(NAZARE.beam, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(b.from.x, b.from.y);
      ctx.lineTo(b.tip.x, b.tip.y - b.half);
      ctx.lineTo(b.tip.x, b.tip.y + b.half);
      ctx.closePath();
      ctx.fill();
    }
    if (b.flash > 0.01) {
      const r = (0.04 + 0.08 * b.flash) * L.w;
      const g = ctx.createRadialGradient(b.from.x, b.from.y, 0, b.from.x, b.from.y, r);
      g.addColorStop(0, css(NAZARE.beam, Math.min(1, 4 * alpha * b.flash)));
      g.addColorStop(1, css(NAZARE.beam, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.from.x, b.from.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const s of waveStates(L, weather, nowMs, reduced)) {
    // the foam brightens exactly while a beam lies across it
    const lit = foamLight(lobes, s.foam.x) * Math.max(0.3, s.foam.a) * s.stand;
    if (lit > 0.01) glow(ctx, s.foam.x, s.foam.y, 1.6 * s.foam.r + 0.04 * L.w, NAZARE.beam, 0.5 * lit * m.night);
    // and so does the spray the wave throws up the rock, as the beam sweeps through it
    const hit = hitAt(s.p) * s.stand;
    if (hit > 0.05) {
      const sprayX = L.X(WAVE.rock);
      const rise = sprayRise(s, L) * hit;
      const through = foamLight(lobes, sprayX);
      if (through > 0.01) glow(ctx, sprayX, s.crest(WAVE.rock) - 0.35 * rise, 0.05 * L.w + 0.5 * rise, NAZARE.beam, 0.45 * through * hit * m.night * clamp(s.size / 0.1));
    }
  }
  ctx.restore();
}

// Fog and rain hang in the beam: it shows as soft light along its length.
// Painted after the fog's veil, which would otherwise swallow it.
export function drawBeamHaze(ctx, rect, phase, tint, weather, nowMs) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const thick = m.fog ? 1 : m.wet ? 0.45 : 0;
  if (m.night <= 0 || thick <= 0) return;
  for (const b of beamLobes(L, nowMs, m.fog)) {
    if (Math.abs(b.across) < 0.25) continue;
    for (const t of [0.2, 0.42, 0.66]) {
      glow(ctx, lerp(b.from.x, b.tip.x, t), lerp(b.from.y, b.tip.y, t), (0.6 + 1.5 * t) * b.half + 0.025 * L.w, NAZARE.beam, 0.2 * thick * m.night * b.strength * (1 - 0.6 * t));
    }
  }
}
