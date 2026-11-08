// Nazare in a jar: the Sitio headland with the Sao Miguel Arcanjo fort and its
// red-roofed lighthouse, the Praia do Norte wave rolling in below it, a few
// surfers on the lit face by day, the beam sweeping the foam by night. Original
// stylised silhouettes. Every mover is a function of `nowMs` or `phase`
// (sampled, never accumulated), so the same moment draws the same pixels.
// Shapes are shares of the jar body: x of its width, y of its height from the top.
import { LAMP_THRESHOLD, moonPos, osc, clamp, wrap, lerp, smoothstep } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { cloudAmount, windPush } from '../../weather.js';
import { NAZARE } from './palette.js';
import { waveHeightOf, waveBand, waveSize, rollMs, wavePhase, surferPlan, surferProgress, surferAlpha } from './sea.js';

export const HORIZON = 0.5;
export const CLIFF = { foot: { x: 0.52, y: 0.7 }, top: { x0: 0.62, x1: 0.96, y: 0.3 }, bottom: 0.74 };
export const FORT = { x0: 0.64, x1: 0.9, y0: 0.26, y1: 0.3 };
export const TOWER = { x0: 0.765, x1: 0.795, y0: 0.17, y1: 0.26 };
export const LANTERN = { x: 0.78, y: 0.165, roof: { y0: 0.14, y1: 0.17 } };
// x0: where the wave starts, shoulderX: its trailing end, peakX: where the lip peaks, x1: its right limit
export const WAVE = { x0: 0.04, peakX: 0.56, shoulderX: 0.08, x1: 0.64, formY: 0.56, breakY: 0.68, face: 0.07 };
export const BEACH = { y0: 0.7, y1: 0.737, x1: 0.52 };
// The x bands the glass streaks occupy (shares of the width); the look's STREAKS.
export const STREAK_CLEAR = [[0.02, 0.065], [0.945, 0.975]];

export const nightAmount = (light) => clamp((LAMP_THRESHOLD + 0.1 - light) / 0.3);
export const sunSide = (phase) => (wrap(phase) < 0.4 ? -1 : 1);
const tone = (day, dusk, night, n) => mix(mix(day, dusk, Math.min(1, n * 2)), night, Math.max(0, n * 2 - 1));

export function layout(w, h, ox = 0, oy = 0) {
  return { w, h, ox, oy, X: (s) => ox + s * w, Y: (s) => oy + s * h };
}

export function buildPlates(w, h) {
  const stripes = [];
  for (let i = 0; i < 7; i++) stripes.push({ y: 0.34 + 0.06 * i + 0.02 * hash2(i, 7), x0: 0.6 + 0.1 * hash2(i, 8), x1: 0.84 + 0.12 * hash2(i, 9) });
  const windows = [0.88, 0.905, 0.925].map((x, i) => ({ x: x + 0.004 * hash2(i, 11), y: 0.275 + 0.015 * hash2(i, 12) }));
  return { w, h, stripes, windows };
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
  // a clear night: the moon's shimmering track on the water, in dashes
  const mp = moonPos(phase);
  if (m.night > 0 && !m.wet && m.cloud < 0.35 && mp.alt > 0) {
    const mx = L.ox + L.w * Math.max(0.15, Math.min(0.85, (mp.x - 400) / 1000));
    for (let k = 0; k < 10; k++) {
      const a = 0.25 * m.night * clamp(0.5 + 0.5 * osc(nowMs / 4000, 1, hash2(k, 3))) * (1 - k / 14);
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
  const face = () => {
    ctx.moveTo(L.X(CLIFF.foot.x), L.Y(CLIFF.foot.y));
    ctx.quadraticCurveTo(L.X(0.6), L.Y(0.56), L.X(CLIFF.top.x0), L.Y(CLIFF.top.y));
  };
  ctx.fillStyle = css(body);
  ctx.beginPath();
  face();
  ctx.lineTo(L.X(CLIFF.top.x1), L.Y(CLIFF.top.y));
  ctx.lineTo(L.X(CLIFF.top.x1), L.Y(CLIFF.bottom));
  ctx.lineTo(L.X(CLIFF.foot.x), L.Y(CLIFF.bottom));
  ctx.closePath();
  ctx.fill();
  // the striated rock
  ctx.strokeStyle = css(NAZARE.rockStripe, 0.55);
  ctx.lineWidth = 1;
  for (const s of plates.stripes) {
    ctx.beginPath();
    ctx.moveTo(L.X(s.x0), L.Y(s.y));
    ctx.lineTo(L.X(Math.min(s.x1, CLIFF.top.x1 - 0.01)), L.Y(s.y));
    ctx.stroke();
  }
  // the sun's rim along the top and, on the left, down the face
  const rim = css(NAZARE.cliffRim, 0.9 * (1 - m.night));
  if (m.night < 1) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (sunSide(phase) < 0) face();
    else ctx.moveTo(L.X(CLIFF.top.x0), L.Y(CLIFF.top.y));
    ctx.lineTo(L.X(CLIFF.top.x1), L.Y(CLIFF.top.y));
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
  ctx.fillStyle = css(mix(NAZARE.towerShade, NAZARE.lanternLight, 0.9 * m.night));
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
  if (m.night > 0) {
    glow(ctx, lx, ly, 0.06 * L.w, NAZARE.lanternLight, 0.9 * m.night);
    ctx.fillStyle = css(NAZARE.lanternLight, m.night);
    ctx.fillRect(lx - 1, ly - 1, 2, 2);
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
// 0 at the shoulder, 1 at the peak, 0 again at the right limit
export function profile(xs) {
  if (xs <= WAVE.shoulderX || xs >= WAVE.x1) return 0;
  if (xs <= WAVE.peakX) return bump((xs - WAVE.shoulderX) / (WAVE.peakX - WAVE.shoulderX));
  return bump((WAVE.x1 - xs) / (WAVE.x1 - WAVE.peakX));
}

// where the foam is, 0..1, through one roll
const foamAmount = (p) => (p < 0.35 ? 0 : p < 0.65 ? 0.3 * bump((p - 0.35) / 0.3) : p < 0.85 ? lerp(0.3, 1, bump((p - 0.65) / 0.2)) : 1 - bump((p - 0.85) / 0.15));

export function waveState(L, weather, nowMs, reduced) {
  const metres = waveHeightOf(weather);
  const size = waveSize(metres);
  const roll = rollMs(weather, reduced);
  const p = wavePhase(nowMs, roll);
  const baseTop = lerp(WAVE.formY, WAVE.breakY, p);
  const crest = (xs) => L.Y(baseTop) - size * L.h * profile(xs);
  const foam = { x: L.X(WAVE.peakX), y: crest(WAVE.peakX) + 0.1 * size * L.h, r: 0.6 * size * L.h * (0.3 + 0.7 * bump((p - 0.5) / 0.3)), a: foamAmount(p) };
  return { metres, size, roll, p, baseTop, crest, foam };
}

function foamCloud(ctx, f, colour, alpha) {
  if (alpha <= 0 || f.r <= 0) return;
  for (let k = 0; k < 8; k++) {
    const ang = hash2(k, 21) * Math.PI * 2;
    const d = hash2(k, 22) * f.r * 0.6;
    ctx.fillStyle = css(colour, clamp(alpha));
    ctx.beginPath();
    ctx.arc(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d * 0.7, f.r * (0.4 + 0.3 * hash2(k, 23)), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawWave(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const s = waveState(L, weather, nowMs, reduced);
  const top = water(mix(NAZARE.faceLit, NAZARE.seaNight, 0.8 * m.night), m, tint);
  const bottom = water(mix(NAZARE.faceShadow, NAZARE.seaDeep, 0.8 * m.night), m, tint);
  const bot = L.Y(s.baseTop + WAVE.face);
  const g = ctx.createLinearGradient(0, L.Y(s.baseTop) - s.size * L.h, 0, bot);
  g.addColorStop(0, css(top));
  g.addColorStop(1, css(bottom));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(L.X(WAVE.x0), bot);
  ctx.lineTo(L.X(WAVE.x0), s.crest(WAVE.x0));
  for (let xs = WAVE.x0; xs <= WAVE.x1 + 1e-9; xs += 0.02) ctx.lineTo(L.X(xs), s.crest(xs));
  ctx.lineTo(L.X(WAVE.x1), bot);
  ctx.closePath();
  ctx.fill();

  const foamCol = mix(m.wet ? mix(NAZARE.foam, NAZARE.dull, 0.35) : NAZARE.foam, NAZARE.foamNight, m.night);
  const lipAmt = 0.3 + 0.6 * bump(s.p / 0.35) * (1 - bump((s.p - 0.85) / 0.15));
  const lipA = m.storm ? Math.min(1, lipAmt + 0.2) : lipAmt;
  // the lit band on the sun's side of the lip while it stands and curls
  if (s.p >= 0.35 && s.p < 0.65) {
    ctx.strokeStyle = css(NAZARE.faceLit, 0.8 * (1 - m.night));
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let xs = WAVE.shoulderX; xs <= WAVE.x1; xs += 0.02) {
      const x = L.X(xs) + sunSide(phase) * 2;
      if (xs === WAVE.shoulderX) ctx.moveTo(x, s.crest(xs) + 3); else ctx.lineTo(x, s.crest(xs) + 3);
    }
    ctx.stroke();
  }
  // the foam lip along the crest
  ctx.strokeStyle = css(foamCol, lipA);
  ctx.lineWidth = 1 + 2 * bump(s.p / 0.35);
  ctx.beginPath();
  for (let xs = WAVE.shoulderX; xs <= WAVE.x1; xs += 0.02) {
    if (xs === WAVE.shoulderX) ctx.moveTo(L.X(xs), s.crest(xs)); else ctx.lineTo(L.X(xs), s.crest(xs));
  }
  ctx.stroke();
  // the curl: the lip overhangs the face
  if (s.p >= 0.35 && s.p < 0.85) {
    const t = bump((s.p - 0.35) / 0.3) * (1 - bump((s.p - 0.65) / 0.2));
    const ov = 0.25 * s.size * L.h * t;
    const px = L.X(WAVE.peakX);
    const py = s.crest(WAVE.peakX);
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(foamCol, 0.9);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px - ov * 0.6, py - 0.02 * L.h * t, px - ov, py + 0.3 * s.size * L.h * t);
    ctx.stroke();
  }
  // the break: a foam cloud, the spray blown off the lip by the wind
  const push = windPush(weather && weather.windSpeed, weather && weather.windDir);
  const foamA = clamp(s.foam.a + (m.storm ? 0.2 * s.foam.a : 0));
  foamCloud(ctx, s.foam, foamCol, 0.8 * foamA);
  if (foamA > 0.2) {
    const len = 0.3 * s.size * L.h * (0.5 + Math.abs(push));
    const lean = Math.sign(push);
    ctx.strokeStyle = css(mix(NAZARE.spray, NAZARE.foamNight, m.night), 0.5 * foamA);
    ctx.lineWidth = 1;
    const px = L.X(WAVE.peakX);
    const py = s.crest(WAVE.peakX);
    for (let k = 0; k < 6; k++) {
      const t = 0.5 + 0.5 * hash2(k, 31);
      ctx.beginPath();
      ctx.moveTo(px + (hash2(k, 32) - 0.5) * 6, py);
      ctx.lineTo(px + (hash2(k, 32) - 0.5) * 6 + lean * len * 0.8 * t, py - len * (1 - 0.3 * Math.abs(lean)) * t);
      ctx.stroke();
    }
  }
  return s;
}

export function drawBeach(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  const sand = tone(NAZARE.sandDay, NAZARE.sandDay, NAZARE.sandNight, m.night);
  ctx.fillStyle = css(water(sand, { ...m, wet: m.wet, storm: false, cloud: m.cloud * 0.5 }, tint));
  ctx.fillRect(L.ox, L.Y(BEACH.y0), L.X(BEACH.x1) - L.ox, L.Y(BEACH.y1) - L.Y(BEACH.y0));
  if (m.snow) {
    ctx.fillStyle = css(NAZARE.snowCap, 0.5);
    ctx.fillRect(L.ox, L.Y(BEACH.y0), L.X(BEACH.x1) - L.ox, L.Y(BEACH.y1) - L.Y(BEACH.y0));
  }
  // foam fingers along the top edge, running up with each wave
  const p = wavePhase(nowMs, rollMs(weather, reduced));
  ctx.fillStyle = css(mix(NAZARE.foam, NAZARE.foamNight, m.night), 0.4 * (1 - p));
  for (let k = 0; k < 6; k++) {
    const x = L.X(0.03 + k * 0.08 + 0.03 * hash2(k, 41));
    ctx.fillRect(x, L.Y(BEACH.y0) - 1, 0.05 * L.w, 2 + 2 * hash2(k, 42));
  }
}

// where jar `i` of the plan stands on the face, in px
export function surferSpots(L, weather, state, plan, nowMs) {
  const spots = [];
  plan.forEach((who, i) => {
    const q = surferProgress(who.kind === 'ski' ? 0 : i, nowMs, state.roll);
    let xs = lerp(WAVE.peakX, WAVE.shoulderX + 0.02, q);
    let y;
    if (who.kind === 'paddler') {
      xs = lerp(0.3, 0.14, q);
      y = L.Y(WAVE.formY + 0.01);
    } else {
      if (who.kind === 'ski') xs -= 0.06;
      // on the face: never below its foot, where the crest has fallen away at the shoulder
      y = Math.min(state.crest(Math.max(xs, WAVE.shoulderX + 0.01)) + (0.35 * state.size + who.lane * 0.012) * L.h,
        L.Y(state.baseTop + WAVE.face) - 2);
    }
    spots.push({ ...who, xs, x: L.X(xs), y });
  });
  return spots;
}

export function drawSurfers(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const state = waveState(L, weather, nowMs, reduced);
  const plan = surferPlan(waveBand(state.metres), tint.light);
  const a = surferAlpha(tint.light);
  if (plan.length === 0 || a <= 0) return plan.length;
  const spots = surferSpots(L, weather, state, plan, nowMs);
  for (const s of spots) {
    if (s.kind === 'ski') {
      ctx.fillStyle = css(NAZARE.surfer, a);
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
      ctx.strokeStyle = css(NAZARE.skiWake, a * 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + 1);
      ctx.lineTo(s.x + 0.05 * L.w, s.y + 1);
      ctx.stroke();
      continue;
    }
    const slope = (state.crest(s.xs + 0.01) - state.crest(s.xs - 0.01)) / (0.02 * L.w);
    const dx = 0.01 * L.w;
    ctx.strokeStyle = css(NAZARE.board, a);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x - dx, s.y + 1 - slope * dx);
    ctx.lineTo(s.x + dx, s.y + 1 + slope * dx);
    ctx.stroke();
    ctx.strokeStyle = css(NAZARE.surfer, a);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x, s.y - (s.kind === 'paddler' ? 0.006 : 0.012) * L.h);
    ctx.stroke();
  }
  return plan.length;
}

export function drawBeam(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const m = mood(tint, weather);
  if (m.night <= 0) return;
  const lx = L.X(LANTERN.x);
  const ly = L.Y(LANTERN.y);
  const a0 = wrap(nowMs / 6000) * Math.PI * 2;
  const half = m.fog ? 0.14 : 0.07;
  const alpha = 0.18 * m.night * (m.fog ? 1.6 : 1);
  const len = 0.55 * L.w;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const ang of [a0, a0 + Math.PI]) {
    const g = ctx.createLinearGradient(lx, ly, lx + Math.cos(ang) * len, ly + Math.sin(ang) * len);
    g.addColorStop(0, css(NAZARE.beam, alpha));
    g.addColorStop(1, css(NAZARE.beam, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(ang - half) * len, ly + Math.sin(ang - half) * len);
    ctx.lineTo(lx + Math.cos(ang + half) * len, ly + Math.sin(ang + half) * len);
    ctx.closePath();
    ctx.fill();
  }
  // where a lobe sweeps over the foam, the foam is lit
  const s = waveState(L, weather, nowMs, reduced);
  const bearing = Math.atan2(s.foam.y - ly, s.foam.x - lx);
  for (const ang of [a0, a0 + Math.PI]) {
    let d = Math.abs(wrap((ang - bearing) / (2 * Math.PI) + 0.5) - 0.5) * 2 * Math.PI;
    d = Math.min(d, 2 * Math.PI - d);
    if (d < 0.2) foamCloud(ctx, s.foam, NAZARE.beam, 0.3 * (1 - d / 0.2) * Math.max(0.3, s.foam.a) * m.night);
  }
  ctx.restore();
}
