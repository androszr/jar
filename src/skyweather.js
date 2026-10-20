// The sky inside a jar: sun or moon and stars when it is clear, clouds by
// cover, rain and snow leaning with the wind, a storm's flashes, dew after a fog, fog as condensation on the glass.
// Every mover is a function of the phase or of the `nowMs` passed in.
import { sunPos, sunAltitude, moonPos, isNight, wrap } from './clock.js';
import { weatherKind, cloudAmount, windSlant, cloudDrift, flashIntensity } from './weather.js';
import { PALETTE, css, glow, droplet } from './look/index.js';

// A tiny deterministic 0..1 from two numbers.
export function hash2(i, seed = 0) {
  const s = Math.sin(i * 127.1 + seed * 311.7 + 1.7) * 43758.5453;
  return s - Math.floor(s);
}

function stars(ctx, rect, nightness, nowMs) {
  if (nightness <= 0) return;
  for (let i = 0; i < 46; i++) {
    const x = rect.x + hash2(i, 1) * rect.w;
    const y = rect.y + hash2(i, 2) * rect.h * 0.55;
    const tw = 0.6 + 0.4 * Math.sin(nowMs / 900 + hash2(i, 3) * 6.28);
    ctx.fillStyle = css(PALETTE.star, nightness * tw * (0.4 + 0.6 * hash2(i, 4)));
    ctx.fillRect(x, y, 1.6, 1.6);
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

function clouds(ctx, rect, amount, phase, tint, nowMs, wind = 0) {
  const n = Math.round(amount * 7);
  const dull = 0.35 + 0.65 * tint.light;
  for (let i = 0; i < n; i++) {
    const { cx, cy, r } = cloudSpot(i, rect, nowMs, wind);
    const colour = [PALETTE.cloud[0] * dull, PALETTE.cloud[1] * dull, PALETTE.cloud[2] * dull];
    ctx.fillStyle = css(colour, 0.35 + 0.35 * amount);
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(cx + (k - 1.5) * r * 0.6, cy + (k % 2) * 6, r * (0.7 + 0.2 * (k % 2)), r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Rain leaning by `slant` radians (positive: the foot goes east). A streak
// drifts sideways as it falls and wraps inside the rect.
function streaks(ctx, rect, count, len, cycleMs, nowMs, alpha, slant = 0) {
  ctx.strokeStyle = css(PALETTE.rain, alpha);
  ctx.lineWidth = 1.2;
  const dx = Math.sin(slant) * len;
  const dy = Math.cos(slant) * len;
  const tan = Math.tan(slant);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const t = wrap(hash2(i, 8) + nowMs / cycleMs);
    const fall = t * (rect.h + len);
    const x = rect.x + wrap((hash2(i, 9) * rect.w + fall * tan) / rect.w) * rect.w;
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
    const s = 1.2 + 1.8 * hash2(i, 12);
    ctx.fillRect(x, y, s, s);
  }
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

// Paint the sky layers into `rect` (the jar's interior, local px). `opts`:
// `reduced` (prefers-reduced-motion) and `dew` (0..1, from the feed).
export function drawJarSky(ctx, rect, phase, tint, weather, nowMs, opts = {}) {
  // Unknown weather is neutral: cloud, no sun, no stars.
  const known = !!(weather && weather.known);
  const kind = known ? weather.kind : 'cloud';
  const cover = weather ? weather.cloudCover : null;
  const amount = cloudAmount(cover, kind);
  const night = isNight(phase);
  const clear = known && (kind === 'clear' || (kind === 'cloud' && amount < 0.35));
  const nightness = clear ? Math.max(0, Math.min(1, (0.45 - tint.light) / 0.3)) * (1 - amount * 0.8) : 0;

  // sun by day (glow), moon and stars at night
  const alt = sunAltitude(phase);
  if (!night && alt > -0.05 && known && (clear || kind === 'cloud')) {
    const sp = sunPos(phase);
    const sx = rect.x + rect.w * Math.max(0.12, Math.min(0.88, (sp.x - 250) / 800));
    const sy = rect.y + rect.h * (0.55 - 0.42 * Math.max(0, alt));
    const strength = (1 - amount * 0.85) * Math.min(1, 0.4 + alt);
    glow(ctx, sx, sy, rect.w * 0.3, PALETTE.sun, 0.55 * strength);
    ctx.fillStyle = css(PALETTE.sun, strength);
    ctx.beginPath();
    ctx.arc(sx, sy, 15, 0, Math.PI * 2);
    ctx.fill();
  }
  if (night || nightness > 0) {
    if (clear) stars(ctx, rect, nightness, nowMs);
    const mp = moonPos(phase);
    if (mp.alt > 0) {
      const mx = rect.x + rect.w * Math.max(0.15, Math.min(0.85, (mp.x - 400) / 1000));
      const my = rect.y + rect.h * (0.4 - 0.28 * mp.alt);
      glow(ctx, mx, my, rect.w * 0.25, PALETTE.moon, 0.45 * (1 - amount * 0.7));
      ctx.fillStyle = css(PALETTE.moon, 0.95 * (1 - amount * 0.6));
      ctx.beginPath();
      ctx.arc(mx, my, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let wind = 0;
  if (amount > 0.05) {
    wind = known ? cloudDrift(weather.windSpeed, weather.windDir, nowMs, { reduced: !!opts.reduced }) : 0;
    clouds(ctx, rect, amount, phase, tint, nowMs, wind);
  }

  const slant = known && weather ? windSlant(weather.windSpeed, weather.windDir, kind) : 0;
  if (kind === 'rain' || kind === 'storm') streaks(ctx, rect, 70, 22, 2000, nowMs, 0.55, slant);
  if (kind === 'drizzle') streaks(ctx, rect, 40, 12, 2400, nowMs, 0.4, slant);
  if (kind === 'snow') flakes(ctx, rect, 70, 6000, nowMs, slant);
  if (kind === 'storm') {
    const f = flashIntensity(weather.code, nowMs, { reduced: !!opts.reduced });
    if (f > 0) {
      glow(ctx, rect.x + rect.w * 0.5, rect.y + rect.h * 0.3, rect.w * 0.9, PALETTE.flash, f);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = css(PALETTE.flash, 0.35 * f);
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
  }
  // dew is what a fog leaves behind; while the fog is there the glass is misted instead
  if (kind !== 'fog' && opts.dew > 0) drawDew(ctx, rect, opts.dew);
  // fog is drawn last in the jar (see paintFog), on the inside of the glass
  return { wind }; // the cloud drift term actually painted (0 when no clouds or no wind)
}

// Fog as condensation on the inside of the glass, over the city.
export function drawFog(ctx, rect, weather, nowMs) {
  if (weather && weather.kind === 'fog') condensation(ctx, rect, nowMs);
}

export { weatherKind };
