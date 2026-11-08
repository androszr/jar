// Nazare in a jar: the Sitio headland with the Sao Miguel Arcanjo fort and its
// red-roofed lighthouse, the Praia do Norte wave rolling in below it, a few
// surfers on the lit face by day, the beam sweeping the foam by night. Original
// stylised silhouettes. Every mover is a function of `nowMs` or `phase`
// (sampled, never accumulated), so the same moment draws the same pixels.
// Shapes are shares of the jar body: x of its width, y of its height from the top.
import { LAMP_THRESHOLD, moonPos, osc, clamp, wrap, lerp, smoothstep } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { moonPhase } from '../../moon.js';
import { hash2 } from '../../skyweather.js';
import { cloudAmount, windPush } from '../../weather.js';
import { NAZARE } from './palette.js';
import { waveHeightOf, waveBand, waveSize, rollMs, wavePhase, surferPlan, surferProgress, surferAlpha } from './sea.js';

export const HORIZON = 0.5;
export const CLIFF = { foot: { x: 0.52, y: 0.7 }, top: { x0: 0.62, x1: 1.08, y: 0.3 }, bottom: 0.74 };
export const FORT = { x0: 0.64, x1: 0.9, y0: 0.26, y1: 0.3 };
export const TOWER = { x0: 0.765, x1: 0.795, y0: 0.17, y1: 0.26 };
export const LANTERN = { x: 0.78, y: 0.165, roof: { y0: 0.14, y1: 0.17 } };
// The wave, seen from the beach as it comes at you. Its base line leaves the
// horizon (formY) and runs down to the sand (breakY) over one roll, growing as
// it comes. It spans the bay from past the jar's left edge (x0) to behind the
// rock (x1), so neither end ever stands in open water, and it is tallest at the
// rock and lowest at the left (lowShare). It breaks first at the rock, and the
// break runs left, away from the lighthouse, between peelFrom and peelTo of the
// roll. A second wave follows half a roll behind, so the sea is never empty.
export const WAVE = {
  x0: -0.04, rock: 0.56, x1: 0.68, lowShare: 0.12,
  formY: 0.515, breakY: 0.695, peelFrom: 0.4, peelTo: 0.9, lag: 0.5,
};
export const BEACH = { y0: 0.7, y1: 0.737, x1: 0.52 };
// The x bands the glass streaks occupy (shares of the width); the look's STREAKS.
export const STREAK_CLEAR = [[0.02, 0.065], [0.945, 0.975]];

export const nightAmount = (light) => clamp((LAMP_THRESHOLD + 0.1 - light) / 0.3);
export const sunSide = (phase) => (wrap(phase) < 0.4 ? -1 : 1);
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
  for (let i = 0; i < 9; i++) {
    const y = 0.35 + 0.042 * i + 0.016 * hash2(i, 7);
    const x0 = 0.62 + 0.03 * i * 0.2 + 0.14 * hash2(i, 8);
    ledges.push({ y, x0, len: 0.06 + 0.12 * hash2(i, 9), slope: 0.12 + 0.12 * hash2(i, 10) });
  }
  const boulders = [0, 1, 2, 3].map((i) => ({ x: CLIFF.foot.x - 0.035 + 0.025 * i + 0.01 * hash2(i, 15), r: 0.008 + 0.008 * hash2(i, 16) }));
  const umbrellas = [0, 1, 2, 3].map((i) => ({ x: 0.1 + 0.09 * i + 0.03 * hash2(i, 17), tone: i % 3 }));
  const people = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 0.08 + 0.065 * i + 0.03 * hash2(i, 18), dy: hash2(i, 19) }));
  const windows = [0.88, 0.905, 0.925].map((x, i) => ({ x: x + 0.004 * hash2(i, 11), y: 0.275 + 0.015 * hash2(i, 12) }));
  return { w, h, face, top, ledges, boulders, umbrellas, people, windows };
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
  return Math.max(kind === 'storm' ? 1 : 0, clamp((wind - 25) / 30));
}

// the water's tone at a depth: darker under cloud and in a storm, greyed in rain
function water(c, m, tint) {
  let out = mix(c, NAZARE.seaDeep, 0.35 * m.cloud);
  if (m.wet) out = mix(out, NAZARE.dull, 0.35 * clamp(tint.light + 0.2));
  if (m.storm) out = mix(out, NAZARE.seaDeep, 0.3);
  return out;
}

export function drawFarSea(ctx, rect, phase, tint, weather, nowMs) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const top = L.Y(HORIZON);
  const col = water(tone(NAZARE.seaDay, NAZARE.seaDusk, NAZARE.seaNight, m.night), m, tint);
  const g = ctx.createLinearGradient(0, top, 0, L.oy + L.h);
  g.addColorStop(0, css(col));
  g.addColorStop(0.5, css(mix(col, NAZARE.seaDeep, 0.5)));
  g.addColorStop(1, css(NAZARE.seaDeep));
  ctx.fillStyle = g;
  ctx.fillRect(L.ox, top, L.w, L.oy + L.h - top);
  // the haze where sea meets sky; in fog it takes the horizon away
  const haze = mix(NAZARE.horizonHaze, tint.skyLow, 0.5 + 0.5 * m.night);
  const hz = ctx.createLinearGradient(0, top, 0, top + 0.03 * L.h);
  hz.addColorStop(0, css(haze, m.fog ? 0.8 : 0.45));
  hz.addColorStop(1, css(haze, 0));
  ctx.fillStyle = hz;
  ctx.fillRect(L.ox, top, L.w, 0.03 * L.h);
  if (m.fog) {
    const fg = ctx.createLinearGradient(0, top - 0.05 * L.h, 0, top + 0.08 * L.h);
    fg.addColorStop(0, css(haze, 0));
    fg.addColorStop(0.5, css(haze, 0.8));
    fg.addColorStop(1, css(haze, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(L.ox, top - 0.05 * L.h, L.w, 0.13 * L.h);
  }
  // whitecaps on a rough sea: short dashes that flare and die, longer nearer us
  const rough = roughness(weather);
  if (rough > 0) {
    const cap = mix(NAZARE.foam, NAZARE.foamNight, m.night);
    for (let k = 0; k < 36; k++) {
      const life = wrap(nowMs / (1800 + 1600 * hash2(k, 61)) + hash2(k, 62));
      const near = hash2(k, 63);
      const a = rough * Math.sin(Math.PI * life) * (0.35 + 0.5 * near);
      ctx.fillStyle = css(cap, 0.75 * a);
      ctx.fillRect(L.X(hash2(k, 64)), top + (0.01 + 0.17 * near) * L.h, (0.012 + 0.03 * near) * L.w, 1 + near);
    }
  }
  // a clear night: the moon's shimmering track on the water, in dashes
  const mp = moonPos(phase);
  const ill = moonPhase(nowMs).illumination;
  if (m.night > 0 && !m.wet && m.cloud < 0.35 && mp.alt > 0 && ill >= 0.02) {
    const mx = L.ox + L.w * Math.max(0.15, Math.min(0.85, (mp.x - 400) / 1000));
    for (let k = 0; k < 10; k++) {
      const a = 0.25 * m.night * clamp(0.5 + 0.5 * osc(nowMs / 4000, 1, hash2(k, 3))) * (1 - k / 14) * ill;
      ctx.fillStyle = css(NAZARE.moonStreak, a);
      const dash = 8 + 10 * hash2(k, 5);
      ctx.fillRect(mx - dash / 2 + (hash2(k, 6) - 0.5) * 10, top + 3 + k * 0.022 * L.h, dash, 2);
    }
  }
}

export function drawHeadland(ctx, rect, phase, tint, weather, plates) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const body = tone(NAZARE.cliffDay, NAZARE.cliffDusk, NAZARE.cliffNight, m.night);
  const deep = mix(body, NAZARE.cliffNight, 0.45);
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
  // in shade on the sea's side, lit across the middle, falling off at the far edge
  const g = ctx.createLinearGradient(L.X(CLIFF.foot.x), 0, L.X(right.x), 0);
  g.addColorStop(0, css(deep));
  g.addColorStop(0.3, css(body));
  g.addColorStop(0.8, css(body));
  g.addColorStop(1, css(mix(body, NAZARE.cliffNight, 0.25)));
  ctx.fillStyle = g;
  outline();
  ctx.fill();
  // the bedded rock: ledges of different lengths, a dark crack with a lit lip above it
  ctx.save();
  outline();
  ctx.clip();
  for (const s of plates.ledges) {
    const x0 = L.X(s.x0);
    const y0 = L.Y(s.y);
    const x1 = L.X(s.x0 + s.len);
    const y1 = y0 + s.slope * (x1 - x0);
    ctx.strokeStyle = css(NAZARE.rockStripe, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (m.night < 1) {
      ctx.strokeStyle = css(NAZARE.cliffRim, 0.18 * (1 - m.night));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0 - 1.5);
      ctx.lineTo(x1, y1 - 1.5);
      ctx.stroke();
    }
  }
  ctx.restore();
  // the sun's rim along the top and, on the left, down the face
  const rim = css(NAZARE.cliffRim, 0.9 * (1 - m.night));
  if (m.night < 1) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.5;
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
  const side = sunSide(phase);
  const block = tone(NAZARE.fortDay, NAZARE.fortDay, NAZARE.fortNight, m.night);
  const fx0 = L.X(FORT.x0);
  const fx1 = L.X(FORT.x1);
  const merlonTop = L.Y(FORT.y0) - 0.012 * L.h;
  ctx.fillStyle = css(block);
  ctx.fillRect(fx0, L.Y(FORT.y0), fx1 - fx0, L.Y(FORT.y1) - L.Y(FORT.y0));
  for (let x = fx0; x + 0.012 * L.w <= fx1; x += 0.03 * L.w) ctx.fillRect(x, merlonTop, 0.012 * L.w, 0.012 * L.h + 0.5);
  if (m.snow) {
    ctx.fillStyle = css(NAZARE.snowCap);
    for (let x = fx0; x + 0.012 * L.w <= fx1; x += 0.03 * L.w) ctx.fillRect(x, merlonTop - 1.5, 0.012 * L.w, 2.5);
  }
  // the tower: white by day, shading into the night, rimmed on the sun's side
  const tw = tone(NAZARE.towerWhite, mix(NAZARE.towerWhite, NAZARE.towerShade, 0.5), NAZARE.towerShade, m.night);
  const tx0 = L.X(TOWER.x0);
  const tx1 = L.X(TOWER.x1);
  ctx.fillStyle = css(tw);
  ctx.fillRect(tx0, L.Y(TOWER.y0), tx1 - tx0, L.Y(TOWER.y1) - L.Y(TOWER.y0));
  if (m.night < 1) {
    ctx.fillStyle = css(NAZARE.cliffRim, 0.9 * (1 - m.night));
    ctx.fillRect(side < 0 ? tx0 : tx1 - 1.5, L.Y(TOWER.y0), 1.5, L.Y(TOWER.y1) - L.Y(TOWER.y0));
  }
  // the lantern room (dark glass by day), its red conical roof
  const lx = L.X(LANTERN.x);
  const ly = L.Y(LANTERN.y);
  ctx.fillStyle = css(mix(NAZARE.towerShade, NAZARE.lanternLight, 0.9 * lampOn(m)));
  ctx.fillRect(lx - 0.012 * L.w, L.Y(0.155), 0.024 * L.w, L.Y(0.17) - L.Y(0.155));
  ctx.fillStyle = css(NAZARE.lanternRoof);
  ctx.beginPath();
  ctx.moveTo(lx - 0.022 * L.w, L.Y(LANTERN.roof.y1) - 0.015 * L.h);
  ctx.lineTo(lx, L.Y(LANTERN.roof.y0));
  ctx.lineTo(lx + 0.022 * L.w, L.Y(LANTERN.roof.y1) - 0.015 * L.h);
  ctx.closePath();
  ctx.fill();
  if (m.snow) {
    ctx.fillStyle = css(NAZARE.snowCap);
    ctx.fillRect(tx0, L.Y(TOWER.y0) - 1.5, tx1 - tx0, 2.5);
  }
  const lamp = lampOn(m);
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
// how much of it stands up: it rises from the swell and spends itself on the sand
export const standAt = (p) => bump(p / 0.5) * (1 - bump((p - 0.82) / 0.14)) * (0.4 + 0.6 * bump(p / 0.6));
// its height along the bay, 0..1: tallest at the rock, where the canyon focuses it
export const reachAt = (xs) => WAVE.lowShare + (1 - WAVE.lowShare) * bump((xs - WAVE.x0) / (WAVE.rock - WAVE.x0));
// where the break has got to: nowhere before peelFrom, then from the rock leftward
export const breakAt = (p) => (p < WAVE.peelFrom ? WAVE.x1 : lerp(WAVE.rock, WAVE.x0, bump((p - WAVE.peelFrom) / (WAVE.peelTo - WAVE.peelFrom))));

// where the foam is, 0..1, through one roll
const foamAmount = (p) => (p < WAVE.peelFrom ? 0 : p < 0.5 ? bump((p - WAVE.peelFrom) / 0.1) : 1 - bump((p - 0.85) / 0.15));

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
  const at = clamp(brk, WAVE.x0, WAVE.rock);
  const foam = { x: L.X(at), y: crest(at) + 0.3 * height(at), r: 0.5 * size * L.h * (0.4 + 0.6 * stand), a: foamAmount(p) };
  return { metres, size, roll, p, baseTop, stand, brk, height, crest, foam };
}

// Both waves on the water, the farther (earlier in its roll) first.
export function waveStates(L, weather, nowMs, reduced) {
  return [waveState(L, weather, nowMs, reduced, 0), waveState(L, weather, nowMs, reduced, WAVE.lag)].sort((a, b) => a.p - b.p);
}

// the sea's colour at a height, as drawFarSea paints it, so a wave's foot melts into it
function seaAt(m, tint, ys) {
  const col = water(tone(NAZARE.seaDay, NAZARE.seaDusk, NAZARE.seaNight, m.night), m, tint);
  const t = clamp((ys - HORIZON) / (1 - HORIZON));
  return t < 0.5 ? mix(col, mix(col, NAZARE.seaDeep, 0.5), t * 2) : mix(mix(col, NAZARE.seaDeep, 0.5), NAZARE.seaDeep, t * 2 - 1);
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
function oneWave(ctx, L, s, m, tint, foamCol, push, nowMs) {
  const base = L.Y(s.baseTop);
  if (s.stand <= 0.001) return;
  const lit = water(mix(NAZARE.faceLit, NAZARE.seaNight, 0.8 * m.night), m, tint);
  const shade = water(mix(NAZARE.faceShadow, NAZARE.seaDeep, 0.25 + 0.6 * m.night), m, tint);
  const peak = s.height(WAVE.rock);
  // the face: a dark wall low down, its foot the colour of the sea around it
  const facePath = () => {
    ctx.beginPath();
    ctx.moveTo(L.X(WAVE.x0), base + 2);
    for (let xs = WAVE.x0; xs <= WAVE.x1 + 1e-9; xs += STEP) ctx.lineTo(L.X(xs), s.crest(xs));
    ctx.lineTo(L.X(WAVE.x1), base + 2);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(0, base - peak, 0, base + 2);
  g.addColorStop(0, css(lit));
  g.addColorStop(0.35, css(shade));
  g.addColorStop(0.8, css(mix(shade, seaAt(m, tint, s.baseTop), 0.4)));
  g.addColorStop(1, css(seaAt(m, tint, s.baseTop)));
  ctx.fillStyle = g;
  facePath();
  ctx.fill();
  // light through the thin water near the top of the face
  const glass = ctx.createLinearGradient(0, base - peak, 0, base - 0.45 * peak);
  glass.addColorStop(0, css(NAZARE.faceGlass, 0.45 * s.stand * (1 - m.night)));
  glass.addColorStop(1, css(NAZARE.faceGlass, 0));
  ctx.fillStyle = glass;
  facePath();
  ctx.fill();
  // the lip ahead of the break: thin far off, thickening toward where it pitches
  const end = Math.min(s.brk, WAVE.x1);
  const span = Math.max(1e-6, end - WAVE.x0);
  ctx.strokeStyle = css(foamCol, 0.5 + 0.4 * s.stand);
  ctx.lineCap = 'round';
  for (let xs = WAVE.x0; xs + STEP <= end + 1e-9; xs += STEP) {
    ctx.lineWidth = 1 + s.stand * (0.5 + 2.5 * bump((xs - WAVE.x0) / span) * reachAt(xs));
    ctx.beginPath();
    ctx.moveTo(L.X(xs), s.crest(xs));
    ctx.lineTo(L.X(xs + STEP), s.crest(xs + STEP));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  if (s.brk >= WAVE.x1) return;
  const fa = clamp(s.foam.a + (m.storm ? 0.2 : 0));
  // the hollow under the pitching lip, just ahead of the break
  if (s.brk > WAVE.x0 + 0.04) {
    const hx = s.brk - 0.025;
    const hh = s.height(hx);
    puff(ctx, L.X(hx), s.crest(hx) + 0.45 * hh, 0.5 * hh, NAZARE.seaDeep, 0.45 * s.stand);
  }
  // whitewater behind the break: a soft mass, densest low and fresh, thinning
  // as it ages and toward its top. It runs on behind the rock, so it never
  // stops short of the cliff.
  const from = Math.max(s.brk, WAVE.x0);
  const underside = mix(foamCol, shade, 0.35);
  for (let xs = from, k = 0; xs <= WAVE.x1 + 1e-9; xs += 0.009, k++) {
    const tall = whiteTall(s, xs);
    if (tall < 1) continue;
    const x = L.X(xs) + (hash2(k, 55) - 0.5) * 4;
    const a = fa * (0.9 - 0.4 * clamp((xs - s.brk) / 0.25));
    // a shaded body low down, lumps of lit foam tumbling over it
    puff(ctx, x, base - 0.2 * tall, 0.55 * tall + 2, underside, a);
    puff(ctx, x + 0.004 * L.w, base - (0.55 + 0.25 * hash2(k, 56)) * tall, (0.3 + 0.1 * hash2(k, 57)) * tall + 1.5, foamCol, a);
  }
  // the curtain the lip throws at the break point
  if (s.brk > WAVE.x0) {
    const cy = s.crest(s.brk);
    const hh = s.height(s.brk);
    for (let k = 0; k < 4; k++) {
      const t = k / 3;
      puff(ctx, L.X(s.brk + 0.004 + 0.004 * t), cy + hh * (0.15 + 0.7 * t), 0.2 * hh + 2, foamCol, 0.8 * fa);
    }
  }
}

export function drawWave(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const foamCol = mix(m.wet ? mix(NAZARE.foam, NAZARE.dull, 0.35) : NAZARE.foam, NAZARE.foamNight, m.night);
  const push = windPush(weather && weather.windSpeed, weather && weather.windDir);
  const states = waveStates(L, weather, nowMs, reduced);
  for (const s of states) oneWave(ctx, L, s, m, tint, foamCol, push, nowMs);
  return states[states.length - 1];
}

// How hard wave `s` is hitting the rock, 0..1: from its break until it spends itself.
export const hitAt = (p) => bump((p - WAVE.peelFrom) / 0.1) * (1 - bump((p - 0.8) / 0.15));

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
      const rise = (0.6 + 1.2 * s.size / 0.26) * s.height(WAVE.rock) * hit;
      const faceX = (y) => L.X(cliffFaceX((y - L.oy) / L.h, plates));
      for (let k = 0; k < 14; k++) {
        const up = k / 13;
        const y = top + 0.3 * s.height(WAVE.rock) - up * rise;
        const x = faceX(y) - 0.01 * L.w + push * up * up * 0.06 * L.w + (hash2(k, 57) - 0.5) * 0.012 * L.w;
        puff(ctx, x, y, (0.025 + 0.05 * up) * L.w * (0.5 + s.size / 0.26), foamCol, 0.55 * hit * (1 - 0.85 * up) * (0.35 + 0.65 * clamp(s.size / 0.18)));
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

// how far the spent wave runs up the sand, 0..1, at roll phase p
export const swashAt = (p) => bump((p - 0.82) / 0.08) * (1 - bump((p - 0.94) / 0.06));

export function drawBeach(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const sand = water(tone(NAZARE.sandDay, NAZARE.sandDay, NAZARE.sandNight, m.night), { ...m, storm: false, cloud: m.cloud * 0.5 }, tint);
  const wet = mix(water(tone(NAZARE.sandWet, NAZARE.sandWet, NAZARE.sandNight, m.night), m, tint), sand, 0.2);
  const y0 = L.Y(BEACH.y0);
  const y1 = L.Y(BEACH.y1);
  const x1 = L.X(BEACH.x1);
  // dry sand above a darker wet band at the waterline
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, css(wet));
  g.addColorStop(0.35, css(sand));
  g.addColorStop(1, css(mix(sand, wet, 0.25)));
  ctx.fillStyle = g;
  ctx.fillRect(L.ox, y0, x1 - L.ox, y1 - y0);
  // the wet band's shine, breathing with the sea
  ctx.fillStyle = css(NAZARE.foam, (0.35 + 0.2 * Math.sin(nowMs / 1600)) * (1 - 0.6 * m.night));
  ctx.fillRect(L.ox, y0 + 0.22 * (y1 - y0), x1 - L.ox, 1);
  if (m.snow) {
    ctx.fillStyle = css(NAZARE.snowCap, 0.5);
    ctx.fillRect(L.ox, y0, x1 - L.ox, y1 - y0);
  }
  // the cliff's shadow over the sand, so the beach runs into the rock, not into a wall
  const sh = ctx.createLinearGradient(L.X(BEACH.x1 - 0.12), 0, x1, 0);
  sh.addColorStop(0, css(NAZARE.cliffNight, 0));
  sh.addColorStop(1, css(NAZARE.cliffNight, 0.45));
  ctx.fillStyle = sh;
  ctx.fillRect(L.X(BEACH.x1 - 0.12), y0, 0.12 * L.w, y1 - y0);
  // fallen rock at the cliff foot
  const rock = mix(tone(NAZARE.cliffDay, NAZARE.cliffDusk, NAZARE.cliffNight, m.night), NAZARE.cliffNight, 0.3);
  ctx.fillStyle = css(rock);
  for (const b of plates.boulders) {
    ctx.beginPath();
    ctx.ellipse(L.X(b.x), y1 - 0.5 * b.r * L.w, b.r * L.w * 1.4, b.r * L.w, 0, Math.PI, 0);
    ctx.lineTo(L.X(b.x) + b.r * L.w * 1.4, y1);
    ctx.lineTo(L.X(b.x) - b.r * L.w * 1.4, y1);
    ctx.fill();
  }
  // a fine dry day brings people down: umbrellas and a few bathers
  const busy = (1 - m.night) * (m.wet || m.snow ? 0 : 1) * clamp((tint.light - 0.55) / 0.2) * (1 - 0.6 * m.cloud);
  if (busy > 0.02) {
    const h = y1 - y0;
    for (const u of plates.umbrellas) {
      const x = L.X(u.x);
      ctx.strokeStyle = css(NAZARE.umbrellaPole, busy);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y1 - 0.15 * h);
      ctx.lineTo(x, y0 + 0.2 * h);
      ctx.stroke();
      ctx.fillStyle = css(NAZARE.umbrellas[u.tone], busy);
      ctx.beginPath();
      ctx.moveTo(x - 0.016 * L.w, y0 + 0.35 * h);
      ctx.quadraticCurveTo(x, y0 - 0.25 * h, x + 0.016 * L.w, y0 + 0.35 * h);
      ctx.closePath();
      ctx.fill();
    }
    for (const p of plates.people) {
      const x = L.X(p.x);
      const feet = y0 + (0.65 + 0.3 * p.dy) * h;
      ctx.fillStyle = css(NAZARE.bather, busy);
      ctx.fillRect(x, feet - 0.35 * h, 1.5, 0.35 * h);
      ctx.fillRect(x - 0.25, feet - 0.5 * h, 2, 2);
    }
  }
  // each spent wave runs up the sand as a foam line and leaves it wet
  const foam = mix(NAZARE.foam, NAZARE.foamNight, m.night);
  for (const s of waveStates(L, weather, nowMs, reduced)) {
    const a = swashAt(s.p);
    if (a <= 0) continue;
    const run = L.Y(BEACH.y0) + (L.Y(BEACH.y1) - L.Y(BEACH.y0)) * 0.7 * bump((s.p - 0.82) / 0.12);
    ctx.fillStyle = css(mix(sand, NAZARE.seaDeep, 0.15), 0.6 * a);
    ctx.fillRect(L.ox, L.Y(BEACH.y0), L.X(BEACH.x1) - L.ox, run - L.Y(BEACH.y0) + 1);
    ctx.fillStyle = css(foam, 0.85 * a);
    for (let k = 0; k < 24; k++) {
      const x = L.X(0.01 + k * 0.021);
      ctx.fillRect(x, run - 1 + (hash2(k, 41) - 0.5) * 2, 0.022 * L.w, 1.5 + 1.5 * hash2(k, 42));
    }
  }
}

// Where surfer `i` of the plan is, in px, on wave `state`. Riders sit on the
// face just ahead of the break and run left with it, away from the lighthouse;
// they fade in as the wave stands up and out before it reaches the sand. The
// jet-ski tows ahead of its rider. The paddler waits outside the break and
// ducks under each wave as its face passes over them.
export const PADDLER = { x: 0.17, y: 0.545 };
export function surferSpots(L, weather, state, plan, nowMs, states = [state]) {
  const spots = [];
  const on = bump((state.p - 0.3) / 0.08) * (1 - bump((state.p - 0.84) / 0.06));
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
  const plan = surferPlan(waveBand(state.metres), tint.light);
  const alpha = surferAlpha(tint.light);
  if (plan.length === 0 || alpha <= 0) return plan.length;
  const spots = surferSpots(L, weather, state, plan, nowMs, states);
  // sized to the jar, so they read at the table and in the close-up alike
  const u = 0.011 * L.h;
  const rider = spots.find((s) => s.kind === 'rider');
  for (const s of spots) {
    const a = alpha * s.fade;
    if (a <= 0) continue;
    if (s.kind === 'ski') {
      // the tow line back to its rider, a V of wake behind, then the craft
      if (rider && rider.fade > 0) {
        ctx.strokeStyle = css(NAZARE.towLine, 0.5 * a);
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(s.x + 0.4 * u, s.y - 0.5 * u);
        ctx.lineTo(rider.x - 0.3 * u, rider.y - 1.4 * u);
        ctx.stroke();
      }
      ctx.strokeStyle = css(NAZARE.skiWake, 0.8 * a);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s.x + 4.5 * u, s.y - 0.8 * u);
      ctx.lineTo(s.x + 0.8 * u, s.y);
      ctx.lineTo(s.x + 4.5 * u, s.y + 0.8 * u);
      ctx.stroke();
      ctx.fillStyle = css(NAZARE.ski, a);
      ctx.beginPath();
      ctx.moveTo(s.x - 1.3 * u, s.y);
      ctx.lineTo(s.x + 1.1 * u, s.y - 0.45 * u);
      ctx.lineTo(s.x + 1.3 * u, s.y + 0.2 * u);
      ctx.lineTo(s.x - 1.1 * u, s.y + 0.35 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = css(NAZARE.skiTrim, a);
      ctx.fillRect(s.x - 0.45 * u, s.y - 0.7 * u, 0.9 * u, 0.35 * u);
      ctx.fillStyle = css(NAZARE.surfer, a);
      ctx.beginPath();
      ctx.arc(s.x, s.y - 1.1 * u, 0.3 * u, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (s.kind === 'paddler') {
      // lying on the board, arms in the water
      ctx.fillStyle = css(NAZARE.board, a);
      ctx.fillRect(s.x - 1.1 * u, s.y, 2.2 * u, 0.3 * u);
      ctx.fillStyle = css(NAZARE.surfer, a);
      ctx.fillRect(s.x - 0.8 * u, s.y - 0.3 * u, 1.4 * u, 0.35 * u);
      ctx.beginPath();
      ctx.arc(s.x + 0.75 * u, s.y - 0.25 * u, 0.25 * u, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // the wake they carve, trailing back up the face behind them
    ctx.strokeStyle = css(NAZARE.skiWake, 0.75 * a);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s.x + 0.9 * u, s.y + 0.2 * u);
    ctx.quadraticCurveTo(s.x + 3 * u, s.y - 0.2 * u, s.x + 5.5 * u, s.y - 1.4 * u);
    ctx.stroke();
    // the board, nose down a touch toward where they are going
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(-0.12);
    ctx.fillStyle = css(NAZARE.board, a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.1 * u, 0.22 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    // a crouched rider leaning the way they ride: legs, body, arms out, head
    ctx.strokeStyle = css(NAZARE.surfer, a);
    ctx.lineWidth = Math.max(1.2, 0.22 * u);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.35 * u, -0.1 * u);
    ctx.lineTo(-0.15 * u, -0.85 * u);
    ctx.lineTo(0.3 * u, -0.1 * u);
    ctx.moveTo(-0.15 * u, -0.85 * u);
    ctx.lineTo(-0.3 * u, -1.5 * u);
    ctx.moveTo(-0.9 * u, -1.25 * u);
    ctx.lineTo(0.4 * u, -1.35 * u);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = css(NAZARE.surfer, a);
    ctx.beginPath();
    ctx.arc(-0.35 * u, -1.8 * u, 0.24 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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
  // the foam brightens exactly while a beam lies across it
  for (const s of waveStates(L, weather, nowMs, reduced)) {
    const lit = foamLight(lobes, s.foam.x) * Math.max(0.3, s.foam.a) * s.stand;
    if (lit > 0.01) glow(ctx, s.foam.x, s.foam.y, 1.6 * s.foam.r + 0.04 * L.w, NAZARE.beam, 0.5 * lit * m.night);
  }
  ctx.restore();
}
