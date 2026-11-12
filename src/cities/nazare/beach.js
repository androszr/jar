// The beach in front: the Praia do Norte seen from its own sand. The water's
// edge is a little above the label plate; from there the sand slopes toward the
// viewer all the way to the bottom of the jar, wet and shining where the sea
// has just been, dry and paler above it, darker near us. Nothing below the
// water's edge is the colour of the sea. The beach follows the season and the
// swell (`beachLife` in sea.js): umbrellas on a warm fair day with a gentle
// sea, a red flag on a big or giant one. Every mover is a function of `nowMs`.
import { clamp, lerp, smoothstep } from '../../clock.js';
import { css, mix } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { gloom, windPush, REDUCED_DRIFT } from '../../weather.js';
import { NAZARE } from './palette.js';
import { waveBand, waveHeightOf, beachLife } from './sea.js';
import { seaSideLight } from './sun.js';
import { BEACH, CLIFF, layout, nightAmount, waveStates } from './scene.js';

const bump = (t) => smoothstep(clamp(t));
const tone = (day, dusk, night, n) => mix(mix(day, dusk, Math.min(1, n * 2)), night, Math.max(0, n * 2 - 1));
const kindOf = (weather) => (weather && weather.kind ? weather.kind : 'cloud');

// The water's edge across the jar (a share of the height at a share of the width): nearly level, never ruled.
export const waterline = (xs) => BEACH.y0 + 0.004 * Math.sin(xs * 7 + 1);
// how far the spent wave runs up the sand, 0..1, at roll phase p
export const swashAt = (p) => bump((p - 0.82) / 0.08) * (1 - bump((p - 0.94) / 0.06));
// Where the red flag stands (shares of the body): on the strand, left of the label plate's middle.
export const FLAG = { x: 0.31, foot: 0.732, top: 0.672 };

// The sand's three tones at this hour and in this weather: wet, dry, and near us.
function sandTones(tint, weather) {
  const night = nightAmount(tint.light);
  const grey = gloom(weather) * (1 - night);
  const t = (c) => mix(tone(c, mix(c, NAZARE.sandDusk, 0.55), NAZARE.sandNight, night), NAZARE.dull, 0.3 * grey);
  return { night, wet: t(NAZARE.sandWet), dry: t(NAZARE.sandDay), near: mix(t(NAZARE.sandNear), NAZARE.cliffNight, 0.3 * night) };
}

function sandPath(ctx, L) {
  ctx.beginPath();
  // wider than the jar: the diorama slides a little behind the glass
  for (let xs = -0.1; xs <= 1.16; xs += 0.05) {
    if (xs === -0.1) ctx.moveTo(L.X(xs), L.Y(waterline(xs))); else ctx.lineTo(L.X(xs), L.Y(waterline(xs)));
  }
  ctx.lineTo(L.X(1.15), L.oy + 1.1 * L.h);
  ctx.lineTo(L.X(-0.1), L.oy + 1.1 * L.h);
  ctx.closePath();
}

// The sand itself, painted before the headland so the rock stands on it.
export function drawSand(ctx, rect, phase, tint, weather) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const s = sandTones(tint, weather);
  const y0 = L.Y(BEACH.y0 - 0.004);
  const g = ctx.createLinearGradient(0, y0, 0, L.oy + L.h);
  g.addColorStop(0, css(s.wet));
  g.addColorStop(0.05, css(mix(s.wet, s.dry, 0.25)));
  g.addColorStop(0.13, css(s.dry));
  g.addColorStop(0.45, css(mix(s.dry, s.near, 0.55)));
  g.addColorStop(1, css(s.near));
  ctx.fillStyle = g;
  sandPath(ctx, L);
  ctx.fill();
  // the wet sand mirrors the sky just above the water's edge
  const sh = ctx.createLinearGradient(0, y0, 0, L.Y(BEACH.y0 + 0.026));
  sh.addColorStop(0, css(tint.skyLow, 0.5 - 0.25 * s.night));
  sh.addColorStop(1, css(tint.skyLow, 0));
  ctx.fillStyle = sh;
  sandPath(ctx, L);
  ctx.fill();
  if (kindOf(weather) === 'snow') {
    ctx.fillStyle = css(NAZARE.snowCap, 0.5);
    sandPath(ctx, L);
    ctx.fill();
  }
}

// Everything on the sand, painted after the headland: the rock's shadow and
// its fallen blocks, ripples, the day's people, the flag, and the swash.
// Returns { umbrellas, flag }.
export function drawBeach(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const s = sandTones(tint, weather);
  const night = s.night;
  const day = 1 - night;
  const u = L.h / 396;
  const tm = reduced ? nowMs * REDUCED_DRIFT : nowMs;
  const snow = kindOf(weather) === 'snow';
  const y0 = L.Y(BEACH.y0);
  const y1 = L.Y(BEACH.strand);
  const h = y1 - y0;
  const x1 = L.X(BEACH.x1);
  const bottom = L.oy + L.h;
  // the cliff's shadow: over the sand beside its foot (longest in the morning,
  // when the sun is behind the rock) and under its base, so the beach runs
  // into the rock, not into a wall
  const side = 0.45 * (1 - 0.5 * seaSideLight(phase) * day);
  const sh = ctx.createLinearGradient(L.X(BEACH.x1 - 0.13), 0, x1, 0);
  sh.addColorStop(0, css(NAZARE.cliffNight, 0));
  sh.addColorStop(1, css(NAZARE.cliffNight, side));
  ctx.fillStyle = sh;
  ctx.fillRect(L.X(BEACH.x1 - 0.13), y0, 0.13 * L.w, L.Y(CLIFF.bottom) - y0);
  const under = ctx.createLinearGradient(0, L.Y(CLIFF.bottom), 0, L.Y(CLIFF.bottom + 0.12));
  under.addColorStop(0, css(NAZARE.cliffNight, side));
  under.addColorStop(1, css(NAZARE.cliffNight, 0));
  ctx.fillStyle = under;
  ctx.fillRect(x1, L.Y(CLIFF.bottom) - 0.5, L.ox + 1.15 * L.w - x1, 0.12 * L.h + 0.5);
  // ripples the wind has left in the dry sand
  ctx.strokeStyle = css(snow ? NAZARE.snowCap : mix(NAZARE.sandRipple, NAZARE.cliffNight, 0.7 * night), 0.2 * day + 0.08);
  ctx.lineWidth = Math.max(0.6, 0.8 * u);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k < 16; k++) {
    const x = L.X(0.02 + 0.5 * hash2(k, 44) + (k % 2 ? 0.46 : 0));
    const y = L.Y(0.752 + 0.24 * hash2(k, 45));
    const w = (0.035 + 0.05 * hash2(k, 46)) * L.w;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w / 2, y - (1 + 1.5 * hash2(k, 47)) * u, x + w, y + 0.6 * u);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
  // fallen rock at the cliff foot and along its base
  const rock = mix(tone(NAZARE.cliffDay, NAZARE.cliffDusk, NAZARE.cliffNight, night), NAZARE.cliffNight, 0.3);
  ctx.fillStyle = css(rock);
  for (const b of plates.boulders) {
    const by = L.Y(b.y);
    ctx.beginPath();
    ctx.ellipse(L.X(b.x), by - 0.5 * b.r * L.w, b.r * L.w * 1.4, b.r * L.w, 0, Math.PI, 0);
    ctx.lineTo(L.X(b.x) + b.r * L.w * 1.4, by);
    ctx.lineTo(L.X(b.x) - b.r * L.w * 1.4, by);
    ctx.fill();
  }
  const life = beachLife(weather, waveBand(waveHeightOf(weather)), tint.light, nowMs);
  // a warm fair day with a gentle sea brings people down: umbrellas, towels, a few bathers
  const busy = life.umbrellas;
  if (busy > 0.02) {
    for (const [i, p] of plates.umbrellas.entries()) {
      const x = L.X(p.x);
      const top = y0 + 0.08 * h;
      const r = 0.017 * L.w;
      ctx.fillStyle = css(NAZARE.towels[i % NAZARE.towels.length], 0.9 * busy);
      ctx.fillRect(x + 0.4 * r, y1 - 0.2 * h, 1.3 * r, 0.1 * h);
      ctx.strokeStyle = css(NAZARE.umbrellaPole, busy);
      ctx.lineWidth = Math.max(0.8, u);
      ctx.beginPath();
      ctx.moveTo(x, y1 - 0.12 * h);
      ctx.lineTo(x, top);
      ctx.stroke();
      // the canopy: a low dome in two tones, its rim scalloped
      ctx.fillStyle = css(NAZARE.umbrellas[p.tone], busy);
      ctx.beginPath();
      ctx.ellipse(x, top + 0.24 * h, r, 0.34 * h, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = css(NAZARE.foam, 0.55 * busy);
      ctx.beginPath();
      ctx.ellipse(x, top + 0.24 * h, 0.34 * r, 0.34 * h, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = css(NAZARE.bather, busy);
    for (const p of plates.people) {
      const x = L.X(p.x);
      const feet = y0 + (0.68 + 0.28 * p.dy) * h;
      ctx.fillRect(x - 0.7 * u, feet - 0.32 * h, 1.4 * u, 0.32 * h);
      ctx.beginPath();
      ctx.arc(x, feet - 0.32 * h - 1.1 * u, 1.1 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // a big or giant day: the red flag is up, snapping in the wind, and a few have come down to watch
  if (life.flag) {
    const push = windPush(weather && weather.windSpeed, weather && weather.windDir);
    const dir = push < 0 ? -1 : 1;
    const fx = L.X(FLAG.x);
    const fy = L.Y(FLAG.top);
    ctx.strokeStyle = css(mix(NAZARE.flagPole, NAZARE.cliffNight, 0.75 * night));
    ctx.lineWidth = Math.max(0.9, 1.1 * u);
    ctx.beginPath();
    ctx.moveTo(fx, L.Y(FLAG.foot));
    ctx.lineTo(fx, fy);
    ctx.stroke();
    const fw = 0.034 * L.w * dir;
    const fh = 0.02 * L.h;
    const snap = (t) => (reduced ? 0 : 0.18 * fh * t * Math.sin(tm / 170 - 5 * t));
    ctx.fillStyle = css(mix(NAZARE.flagRed, NAZARE.cliffNight, 0.7 * night));
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 0.5 * fw, fy + snap(0.5));
    ctx.lineTo(fx + fw, fy + snap(1));
    ctx.lineTo(fx + fw, fy + fh + snap(1));
    ctx.lineTo(fx + 0.5 * fw, fy + fh + snap(0.5));
    ctx.lineTo(fx, fy + fh);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < life.onlookers; i++) {
      const x = L.X(FLAG.x + 0.05 + 0.03 * i + 0.012 * hash2(i, 48));
      const feet = y0 + (0.78 + 0.16 * hash2(i, 49)) * h;
      ctx.fillStyle = css(NAZARE.jackets[i % NAZARE.jackets.length], 0.95);
      ctx.fillRect(x - 0.8 * u, feet - 0.36 * h, 1.6 * u, 0.36 * h);
      ctx.fillStyle = css(NAZARE.bather, 0.95);
      ctx.beginPath();
      ctx.arc(x, feet - 0.36 * h - 1.1 * u, 1.1 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the swash: a thin bright line where the water reaches, breathing up and
  // down the sand, with the darker mark of the last one just above it
  const foam = mix(NAZARE.foam, NAZARE.foamNight, night);
  const edge = (lift, wob) => {
    ctx.beginPath();
    for (let xs = -0.02; xs <= BEACH.x1 + 0.04; xs += 0.02) {
      const breathe = 0.5 + 0.5 * Math.sin(tm / 1500 + xs * 9);
      const y = L.Y(waterline(xs)) + lift + (wob * breathe + 0.5 * Math.sin(xs * 61)) * u;
      if (xs < 0) ctx.moveTo(L.X(xs), y); else ctx.lineTo(L.X(xs), y);
    }
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = css(mix(s.wet, NAZARE.seaDeep, 0.3), 0.4);
  ctx.lineWidth = Math.max(0.7, u);
  edge(3.6 * u, 0.8);
  ctx.strokeStyle = css(foam, 0.85 - 0.3 * night);
  ctx.lineWidth = Math.max(0.9, 1.3 * u);
  edge(0, 2.4);
  // each spent wave runs up the sand as a sheet of foam and leaves it wet
  for (const w of waveStates(L, weather, nowMs, reduced)) {
    const a = swashAt(w.p);
    if (a <= 0) continue;
    const run = 0.75 * h * bump((w.p - 0.82) / 0.12);
    ctx.fillStyle = css(mix(s.wet, NAZARE.seaDeep, 0.2), 0.55 * a);
    ctx.beginPath();
    for (let xs = -0.02; xs <= BEACH.x1 + 0.04; xs += 0.03) {
      const y = L.Y(waterline(xs)) - u;
      if (xs < 0) ctx.moveTo(L.X(xs), y); else ctx.lineTo(L.X(xs), y);
    }
    for (let xs = BEACH.x1 + 0.04; xs >= -0.021; xs -= 0.03) ctx.lineTo(L.X(xs), L.Y(waterline(xs)) + run + 1.2 * u * Math.sin(xs * 47));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = css(foam, 0.9 * a);
    ctx.lineWidth = Math.max(1, 1.8 * u);
    ctx.beginPath();
    for (let xs = -0.02; xs <= BEACH.x1 + 0.04; xs += 0.02) {
      const y = L.Y(waterline(xs)) + run + 1.2 * u * Math.sin(xs * 47);
      if (xs < 0) ctx.moveTo(L.X(xs), y); else ctx.lineTo(L.X(xs), y);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  return { umbrellas: busy > 0.02, flag: life.flag };
}
