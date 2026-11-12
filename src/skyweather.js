// The sky inside a jar: sun or moon and stars when it is clear, clouds by
// cover, rain and snow leaning with the wind, a storm's flashes, dew after a fog, fog as condensation on the glass.
// Every mover is a function of the phase or of the `nowMs` passed in.
import { sunPos, sunAltitude, moonPos, isNight, wrap } from './clock.js';
import { weatherKind, cloudAmount, windSlant, cloudTravel, flashIntensity, gloom, FLASH } from './weather.js';
import { moonPhase, moonGlow } from './moon.js';
import { PALETTE, css, mix, glow, droplet, moonDisc, cloud, sunDisc, bolt } from './look/index.js';

// A tiny deterministic 0..1 from two numbers.
export function hash2(i, seed = 0) {
  const s = Math.sin(i * 127.1 + seed * 311.7 + 1.7) * 43758.5453;
  return s - Math.floor(s);
}

// A shooting star: one every SHOOT_EVERY_MS on average, a short streak for
// SHOOT_MS, placed by the count of the window it falls in. null between them.
export const SHOOT_EVERY_MS = 47000;
export const SHOOT_MS = 900;
export function shootingStar(nowMs) {
  if (!Number.isFinite(nowMs)) return null;
  const n = Math.floor(nowMs / SHOOT_EVERY_MS);
  // two windows in five carry one, so they come unevenly
  if (hash2(n, 31) > 0.4) return null;
  const start = hash2(n, 32) * (SHOOT_EVERY_MS - SHOOT_MS);
  const age = nowMs - n * SHOOT_EVERY_MS - start;
  if (age < 0 || age > SHOOT_MS) return null;
  const t = age / SHOOT_MS;
  const dir = hash2(n, 35) > 0.5 ? 1 : -1;
  return { t, x: 0.2 + 0.6 * hash2(n, 33), y: 0.06 + 0.2 * hash2(n, 34), dir };
}

function stars(ctx, rect, nightness, nowMs, reduced = false) {
  if (nightness <= 0) return;
  for (let i = 0; i < 58; i++) {
    const x = rect.x + hash2(i, 1) * rect.w;
    const y = rect.y + hash2(i, 2) * rect.h * 0.55;
    const tw = 0.6 + 0.4 * Math.sin(nowMs / 900 + hash2(i, 3) * 6.28);
    // most are pinpricks, a few are bright: the size follows the cube of a hash
    const big = hash2(i, 19) ** 3;
    ctx.fillStyle = css(PALETTE.star, nightness * tw * (0.35 + 0.65 * hash2(i, 4)));
    ctx.beginPath();
    ctx.arc(x, y, 0.55 + 1.15 * big, 0, Math.PI * 2);
    ctx.fill();
    if (big > 0.55) glow(ctx, x, y, 7, PALETTE.star, 0.22 * nightness * tw);
  }
  const s = reduced ? null : shootingStar(nowMs);
  if (s && nightness > 0.5) {
    const len = rect.w * 0.16;
    const hx = rect.x + rect.w * s.x + s.dir * s.t * rect.w * 0.22;
    const hy = rect.y + rect.h * s.y + s.t * rect.h * 0.1;
    const fade = Math.sin(Math.PI * s.t) * nightness;
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      ctx.strokeStyle = css(PALETTE.star, fade * (1 - k / 6) * 0.8);
      ctx.lineWidth = 1.6 - k * 0.2;
      ctx.beginPath();
      ctx.moveTo(hx - s.dir * (len * k) / 6, hy - (len * 0.45 * k) / 6);
      ctx.lineTo(hx - s.dir * (len * (k + 1)) / 6, hy - (len * 0.45 * (k + 1)) / 6);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Where cloud `i` sits: a pure function of the clock and the wind term (in jar
// widths). The travel margin is twice the radius, wider than the cloud's
// ellipses (cx - 1.6r .. cx + 1.8r), so it wraps only while wholly off the glass.
export function cloudSpot(i, rect, nowMs, wind = 0) {
  const r = 34 + 30 * hash2(i, 7);
  const m = 2 * r;
  const travel = wrap(hash2(i, 5) + nowMs / (240000 + i * 30000) + wind);
  const cx = rect.x - m + travel * (rect.w + 2 * m);
  const cy = rect.y + rect.h * (0.1 + 0.34 * hash2(i, 6));
  return { cx, cy, r };
}

// The colour of a cloud: dulled by the dark and by a heavy sky (`heavy` 0..1),
// warmed while the sun is low (`warm` 0..1).
export function cloudColour(light, heavy = 0, warm = 0) {
  const dull = (0.35 + 0.65 * light) * (1 - 0.32 * heavy);
  const base = mix(PALETTE.cloud, PALETTE.cloudWarm, 0.55 * warm * (1 - heavy));
  return [base[0] * dull, base[1] * dull, base[2] * dull];
}

// How low the sun stands for the clouds, 0..1: 1 on the horizon, 0 from a
// quarter of the way up and at night.
export function lowSun(phase) {
  const alt = sunAltitude(phase);
  if (isNight(phase) && alt < -0.08) return 0;
  return Math.max(0, Math.min(1, 1 - Math.abs(alt) / 0.25));
}

function clouds(ctx, rect, amount, phase, tint, nowMs, wind = 0, heavy = 0) {
  const n = Math.round(amount * 7);
  const colour = cloudColour(tint.light, heavy, lowSun(phase));
  for (let i = 0; i < n; i++) {
    const { cx, cy, r } = cloudSpot(i, rect, nowMs, wind);
    cloud(ctx, cx, cy, r, colour, 0.5 + 0.38 * amount);
  }
}

// Rain leaning by `slant` radians (positive: the foot goes east). A streak
// drifts sideways as it falls and wraps inside the rect.
function streaks(ctx, rect, count, len, cycleMs, nowMs, alpha, slant = 0, width = 1.2, seed = 0) {
  ctx.strokeStyle = css(PALETTE.rain, alpha);
  ctx.lineWidth = width;
  const dx = Math.sin(slant) * len;
  const dy = Math.cos(slant) * len;
  const tan = Math.tan(slant);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const t = wrap(hash2(i, 8 + seed) + nowMs / cycleMs);
    const fall = t * (rect.h + len);
    const x = rect.x + wrap((hash2(i, 9 + seed) * rect.w + fall * tan) / rect.w) * rect.w;
    const y = rect.y + fall - len;
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
  }
  ctx.stroke();
}

function flakes(ctx, rect, count, cycleMs, nowMs, slant = 0) {
  ctx.fillStyle = css(PALETTE.snow, 0.85);
  const tan = Math.tan(slant);
  for (let i = 0; i < count; i++) {
    const t = wrap(hash2(i, 10) + nowMs / cycleMs);
    const loose = 0.35 * Math.abs(slant) * rect.w * 0.02 * Math.sin(2 * Math.PI * wrap(nowMs / cycleMs + hash2(i, 18)));
    const x = rect.x + wrap((hash2(i, 11) * rect.w + t * rect.h * tan) / rect.w) * rect.w + Math.sin(nowMs / 1200 + i) * 6 + loose;
    const y = rect.y + t * rect.h;
    // three depths: far specks, a middle layer, a few big near flakes
    const depth = hash2(i, 12);
    const s = depth < 0.5 ? 0.7 + 0.5 * depth : depth < 0.88 ? 1.1 + 0.9 * depth : 2.2 + 1.2 * depth;
    ctx.globalAlpha = depth < 0.5 ? 0.6 : 1;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function condensation(ctx, rect, nowMs) {
  ctx.fillStyle = css(PALETTE.fog, 0.34);
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  for (let i = 0; i < 40; i++) {
    const x = rect.x + hash2(i, 13) * rect.w;
    const y = rect.y + hash2(i, 14) * rect.h;
    const r = 1.2 + 2.6 * hash2(i, 15);
    ctx.fillStyle = css(PALETTE.fog, 0.35);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (hash2(i, 16) > 0.7) {
      const slide = wrap(nowMs / 30000 + hash2(i, 17)) * 26;
      ctx.strokeStyle = css(PALETTE.fog, 0.22);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + slide);
      ctx.stroke();
    }
  }
}

const DEW_SEED = 0x5ed;

// Dew on the inside of the glass after a fog lifts. `amount` (1 fresh, 0 gone)
// sets size and strength; it moves with `amount`, never with the frame's time.
export function drawDew(ctx, rect, amount) {
  if (!(amount > 0)) return;
  for (let i = 0; i < 28; i++) {
    const x = rect.x + rect.w * (0.08 + 0.84 * hash2(i, DEW_SEED));
    let y = rect.y + rect.h * (0.1 + 0.75 * hash2(i + 100, DEW_SEED));
    const r = (1.5 + 2.5 * hash2(i + 200, DEW_SEED)) * (0.4 + 0.6 * amount);
    if (i % 6 === 0) {
      y += (1 - amount) * 0.18 * rect.h * hash2(i + 300, DEW_SEED);
      droplet(ctx, x, y - r * 2.4, r * 0.55, amount * 0.7);
      droplet(ctx, x, y - r * 4.4, r * 0.35, amount * 0.5);
    }
    droplet(ctx, x, y, r, amount);
  }
}

// The lightning flash of a thunderstorm over `rect`; nothing in any other weather.
// A city whose scene covers the sky may call it again after painting.
export function drawStormFlash(ctx, rect, weather, nowMs, opts = {}) {
  if (!(weather && weather.known && weather.kind === 'storm')) return;
  const f = flashIntensity(weather.code, nowMs, { reduced: !!opts.reduced });
  if (f > 0) {
    const b = opts.reduced ? null : boltPath(weather.code, nowMs, opts.strike);
    if (b) {
      const at = (pts) => pts.map(([x, y]) => [rect.x + x * rect.w, rect.y + y * rect.h]);
      bolt(ctx, at(b.points), b.forks.map(at), f);
    }
    glow(ctx, rect.x + rect.w * 0.5, rect.y + rect.h * 0.3, rect.w * 0.9, PALETTE.flash, f);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = css(PALETTE.flash, 0.35 * f);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }
}

// The bolt of the storm period `nowMs` falls in: a jagged channel from the top
// of the sky down to a foot, with two forks, all in fractions of the sky rect
// and the same for the whole period. `strike` ([x, y], a city's tall thing)
// takes the bolt on every other period. null outside a thunderstorm.
export const BOLT_STEPS = 9;
export function boltPath(code, nowMs, strike = null) {
  const f = FLASH[code];
  if (!f || !Number.isFinite(nowMs)) return null;
  const n = Math.floor(nowMs / f.periodMs);
  const aimed = Array.isArray(strike) && n % 2 === 0;
  const foot = aimed ? strike : [0.15 + 0.7 * hash2(n, 71), 0.4 + 0.25 * hash2(n, 72)];
  const head = [foot[0] + (hash2(n, 73) - 0.5) * 0.3, -0.02];
  const points = [];
  for (let i = 0; i <= BOLT_STEPS; i++) {
    const t = i / BOLT_STEPS;
    const jag = i === 0 || i === BOLT_STEPS ? 0 : (hash2(n * 17 + i, 74) - 0.5) * 0.11;
    points.push([head[0] + (foot[0] - head[0]) * t + jag, head[1] + (foot[1] - head[1]) * t]);
  }
  const forks = [];
  for (let k = 0; k < 2; k++) {
    const from = 2 + Math.floor(hash2(n + k, 75) * (BOLT_STEPS - 4));
    const dir = hash2(n + k, 76) > 0.5 ? 1 : -1;
    const fork = [points[from]];
    for (let j = 1; j <= 3; j++) {
      const last = fork[fork.length - 1];
      fork.push([last[0] + dir * (0.03 + 0.04 * hash2(n * 5 + k * 3 + j, 77)), last[1] + 0.035 + 0.03 * hash2(n * 7 + k * 3 + j, 78)]);
    }
    forks.push(fork);
  }
  return { points, forks, aimed };
}

// Rain, drizzle and snow falling through `rect`, leaning with the wind; nothing
// for an unknown reading or any other kind. A city whose scene covers the sky
// may call it again after painting, so the weather still falls in front of it.
export function drawPrecipitation(ctx, rect, weather, nowMs) {
  const known = !!(weather && weather.known);
  const kind = known ? weather.kind : 'cloud';
  const slant = known ? windSlant(weather.windSpeed, weather.windDir, kind) : 0;
  // a far, fine, slower curtain behind the near streaks
  if (kind === 'rain' || kind === 'storm') {
    streaks(ctx, rect, 90, 11, 2900, nowMs, 0.26, slant, 0.7, 40);
    streaks(ctx, rect, 70, 22, 2000, nowMs, 0.55, slant);
  }
  if (kind === 'drizzle') {
    streaks(ctx, rect, 50, 7, 3300, nowMs, 0.22, slant, 0.7, 40);
    streaks(ctx, rect, 40, 12, 2400, nowMs, 0.4, slant);
  }
  if (kind === 'snow') flakes(ctx, rect, 70, 6000, nowMs, slant);
}

// Rings where the rain lands on open water. `water` is { x, y, w, h } in the
// jar's local px (a city's own `water(rect)`), or null for none. Each ring
// lives RING_MS, opens out and fades; where it lands changes with every life.
export const RING_MS = 900;
export function rainRings(weather, nowMs, count = null) {
  const known = !!(weather && weather.known);
  const kind = known ? weather.kind : '';
  const n = count ?? (kind === 'rain' || kind === 'storm' ? 16 : kind === 'drizzle' ? 7 : 0);
  const rings = [];
  for (let i = 0; i < n; i++) {
    const lap = nowMs / RING_MS + hash2(i, 41);
    const life = Math.floor(lap);
    rings.push({ t: lap - life, x: hash2(i + life * 13, 42), y: hash2(i + life * 7, 43) });
  }
  return rings;
}

export function drawSplashes(ctx, water, weather, nowMs) {
  if (!water || !(water.w > 0) || !(water.h > 0)) return 0;
  const rings = rainRings(weather, nowMs);
  if (!rings.length) return 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(water.x, water.y, water.w, water.h);
  ctx.clip();
  ctx.lineWidth = 1;
  for (const r of rings) {
    const cx = water.x + water.w * (0.04 + 0.92 * r.x);
    const cy = water.y + water.h * (0.12 + 0.76 * r.y);
    // nearer water (lower in the band) carries wider rings
    const reach = (3 + 7 * r.y) * (0.25 + 0.75 * r.t);
    ctx.strokeStyle = css(PALETTE.rain, 0.55 * (1 - r.t));
    ctx.beginPath();
    ctx.ellipse(cx, cy, reach, reach * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  return rings.length;
}

// Rain on the glass: beads that gather, run down in a wavering line and leave
// a short wet trail. Drawn inside the jar, over the city. Nothing unless it
// rains. Each bead's run is BEAD_MS long and starts somewhere new every time.
export const BEAD_MS = 5200;
export function drawRainOnGlass(ctx, rect, weather, nowMs, reduced = false) {
  const known = !!(weather && weather.known);
  const kind = known ? weather.kind : '';
  const n = kind === 'rain' || kind === 'storm' ? 12 : kind === 'drizzle' ? 6 : 0;
  if (!n) return 0;
  const t = reduced ? 0 : nowMs;
  for (let i = 0; i < n; i++) {
    const lap = t / (BEAD_MS * (0.7 + 0.6 * hash2(i, 51))) + hash2(i, 52);
    const life = Math.floor(lap);
    const u = lap - life;
    // it sits and swells for the first third, then runs
    const run = Math.max(0, (u - 0.33) / 0.67);
    const x0 = rect.x + rect.w * (0.06 + 0.88 * hash2(i + life * 5, 53));
    const y0 = rect.y + rect.h * (0.1 + 0.4 * hash2(i + life * 3, 54));
    const fall = run * run * rect.h * 0.42;
    const x = x0 + Math.sin(fall / 14 + i) * 2.2;
    const y = y0 + fall;
    const r = 1.4 + 1.6 * Math.min(1, u * 3) * (1 - 0.4 * run);
    const a = Math.min(1, u * 6) * (1 - run ** 3);
    if (run > 0) {
      ctx.strokeStyle = css(PALETTE.dew, 0.22 * a);
      ctx.lineWidth = r * 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + Math.sin(fall / 28 + i) * 2.2, (y0 + y) / 2, x, y);
      ctx.stroke();
    }
    droplet(ctx, x, y, r, a);
  }
  return n;
}

// What a shaken jar throws up: specks lifted off the floor of the jar in a
// swirl that settles again. `swirl` 0..1 is how much of it is in the air and
// `ageMs` how long ago the shake was; snow when it is cold, warm glitter else.
export const FLURRY = 70;
export function drawFlurry(ctx, rect, swirl, ageMs, weather) {
  if (!(swirl > 0)) return 0;
  const cold = !!(weather && weather.known && (weather.kind === 'snow' || (typeof weather.temperature === 'number' && weather.temperature <= 1)));
  const colour = cold ? PALETTE.snow : PALETTE.glitter;
  const turn = ageMs / 420;
  for (let i = 0; i < FLURRY; i++) {
    const reach = 0.25 + 0.75 * hash2(i, 61);
    const lift = swirl * reach;
    const angle = hash2(i, 62) * Math.PI * 2 + turn * (0.6 + 0.8 * hash2(i, 63));
    const x = rect.x + rect.w * (0.5 + (hash2(i, 64) - 0.5) * 0.6 + 0.2 * lift * Math.cos(angle));
    const y = rect.y + rect.h * (0.82 - 0.72 * lift + 0.05 * Math.sin(angle * 1.3));
    const s = 1 + 1.8 * hash2(i, 65);
    ctx.fillStyle = css(colour, Math.min(1, swirl * 2.2) * (0.5 + 0.5 * Math.abs(Math.sin(angle * 2 + i))));
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  return FLURRY;
}

// Paint the sky layers into `rect` (the jar's interior, local px). `opts`:
// `reduced` (prefers-reduced-motion) and `dew` (0..1, from the feed).
export function drawJarSky(ctx, rect, phase, tint, weather, nowMs, opts = {}) {
  // Unknown weather is neutral: cloud, no sun, no stars.
  const known = !!(weather && weather.known);
  const kind = known ? weather.kind : 'cloud';
  const cover = weather ? weather.cloudCover : null;
  const amount = cloudAmount(cover, kind);
  const heavy = gloom(weather);
  const night = isNight(phase);
  const clear = known && (kind === 'clear' || (kind === 'cloud' && amount < 0.35));
  const nightness = clear ? Math.max(0, Math.min(1, (0.45 - tint.light) / 0.3)) * (1 - amount * 0.8) : 0;

  // sun by day (glow), moon and stars at night
  const alt = sunAltitude(phase);
  if (!(opts.sun === false) && !night && alt > -0.05 && known && (clear || kind === 'cloud')) {
    const sp = sunPos(phase);
    const sx = rect.x + rect.w * Math.max(0.12, Math.min(0.88, (sp.x - 250) / 800));
    const sy = rect.y + rect.h * (0.55 - 0.42 * Math.max(0, alt));
    const strength = (1 - amount * 0.85) * Math.min(1, 0.4 + alt) * (1 - heavy);
    // a wide faint corona, a tighter one, then the disc with its soft edge
    glow(ctx, sx, sy, rect.w * 0.55, PALETTE.sun, 0.22 * strength);
    glow(ctx, sx, sy, rect.w * 0.26, PALETTE.sun, 0.5 * strength);
    sunDisc(ctx, sx, sy, 13, strength);
  }
  let drawnMoon = null;
  if (night || nightness > 0) {
    if (clear) stars(ctx, rect, nightness, nowMs, !!opts.reduced);
    const mp = moonPos(phase);
    if (mp.alt > 0) {
      const mx = rect.x + rect.w * Math.max(0.15, Math.min(0.85, (mp.x - 400) / 1000));
      const my = rect.y + rect.h * (0.4 - 0.28 * mp.alt);
      const moon = moonPhase(nowMs);
      glow(ctx, mx, my, rect.w * 0.5, PALETTE.moon, 0.12 * (1 - amount * 0.7) * moonGlow(moon.illumination));
      glow(ctx, mx, my, rect.w * 0.25, PALETTE.moon, 0.45 * (1 - amount * 0.7) * moonGlow(moon.illumination));
      moonDisc(ctx, mx, my, 10, moon, 0.95 * (1 - amount * 0.6));
      drawnMoon = { illumination: moon.illumination, name: moon.name, x: (mx - rect.x) / rect.w, y: (my - rect.y) / rect.h };
    }
  }

  // a city that declines the shared sun paints its own here, behind the clouds
  if (typeof opts.backdrop === 'function') opts.backdrop(ctx, rect);

  let wind = 0;
  if (amount > 0.05) {
    wind = known ? cloudTravel(weather.windSpeed, weather.windDir, nowMs, { ...(opts.anchor || {}), reduced: !!opts.reduced }) : 0;
    clouds(ctx, rect, amount, phase, tint, nowMs, wind, heavy);
  }

  drawPrecipitation(ctx, rect, weather, nowMs);
  drawStormFlash(ctx, rect, weather, nowMs, opts);
  // dew is what a fog leaves behind; while the fog is there the glass is misted instead
  if (kind !== 'fog' && opts.dew > 0) drawDew(ctx, rect, opts.dew);
  // fog is drawn last in the jar (see paintFog), on the inside of the glass
  return { wind, moon: drawnMoon, gloom: heavy }; // the cloud drift term actually painted (0 when no clouds or no wind)
}

// Fog as condensation on the inside of the glass, over the city.
export function drawFog(ctx, rect, weather, nowMs) {
  if (weather && weather.kind === 'fog') condensation(ctx, rect, nowMs);
}

export { weatherKind };
