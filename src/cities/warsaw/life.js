// What lives in Warsaw's jar besides the buildings: a small boat on the Vistula
// by day (never among ice floes), a few birds in fair weather, steam off two or
// three roofs in a hard frost, leaning with the wind, New Year fireworks over the
// skyline and the Christmas tree at the Palace's foot. Every mover is a pure
// function of nowMs; nothing here reads a clock or rolls a die.
import { clamp, wrap } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { localDate, dayFraction } from '../../placeclock.js';
import { isUsable, windPush, gloom } from '../../weather.js';
import { WARSAW } from './palette.js';
import { SKYLINE, FRONT_ROW, FAR_BANK, ICE, iceAmount } from './scene.js';

const ZONE = 'Europe/Warsaw';
const REDUCED_PACE = 0.4;
const time = (nowMs, reduced) => (Number.isFinite(nowMs) ? nowMs * (reduced ? REDUCED_PACE : 1) : 0);

// ---- the boat ------------------------------------------------------------------
// One crossing of the picture takes BOAT.ms; it turns round out of sight, beyond
// the glass, and comes back the other way. None while the river carries ice.
export const BOAT = { ms: 150000, len: 15, margin: 0.08, depth: 0.52 };

export function boatAt(L, nowMs, weather, reduced = false) {
  if (iceAmount(weather) > 0) return null;
  const v = time(nowMs, reduced) / BOAT.ms + 0.37;
  const trip = Math.floor(v);
  const s = v - trip;
  const dir = trip % 2 === 0 ? 1 : -1;
  const u = -BOAT.margin + s * (1 + 2 * BOAT.margin);
  return {
    x: L.ox + (dir > 0 ? u : 1 - u) * L.w,
    y: L.river.top + BOAT.depth * (L.river.bottom - L.river.top),
    dir,
    bob: Math.sin(time(nowMs, reduced) / 900) * 0.3 * L.sy,
  };
}

// Returns whether a boat was drawn. `day` is 1 - nightAmount.
export function drawBoat(ctx, L, day, weather, nowMs, reduced = false) {
  const b = day > 0 ? boatAt(L, nowMs, weather, reduced) : null;
  if (!b) return false;
  const { x, dir } = b;
  const y = b.y + b.bob;
  const u = L.sx;
  const half = (BOAT.len / 2) * u;
  // the wake: two short pale lines trailing behind
  ctx.strokeStyle = css(WARSAW.boatWake, 0.5 * day);
  ctx.lineWidth = 0.6 * u;
  ctx.beginPath();
  ctx.moveTo(x - dir * half, y + 0.9 * L.sy);
  ctx.lineTo(x - dir * (half + 13 * u), y + 0.3 * L.sy);
  ctx.moveTo(x - dir * half, y + 1.3 * L.sy);
  ctx.lineTo(x - dir * (half + 9 * u), y + 2 * L.sy);
  ctx.stroke();
  // the hull, low in the water with a raked bow
  ctx.fillStyle = css(WARSAW.boatHull, day);
  ctx.beginPath();
  ctx.moveTo(x - dir * half, y - 1.1 * L.sy);
  ctx.lineTo(x + dir * (half + 2 * u), y - 1.1 * L.sy);
  ctx.lineTo(x + dir * (half - 1.5 * u), y + 1.2 * L.sy);
  ctx.lineTo(x - dir * (half - 0.8 * u), y + 1.2 * L.sy);
  ctx.closePath();
  ctx.fill();
  // the waterline stripe and the cabin with its awning
  ctx.fillStyle = css(WARSAW.boatDeck, day);
  ctx.fillRect(x - half + 0.8 * u, y + 0.3 * L.sy, 2 * half - 1.4 * u, 0.9 * L.sy);
  ctx.fillStyle = css(WARSAW.boatHull, day);
  ctx.fillRect(x - dir * 1.5 * u - 3.5 * u, y - 3.4 * L.sy, 7 * u, 2.4 * L.sy);
  ctx.fillStyle = css(WARSAW.boatDeck, day);
  ctx.fillRect(x - dir * 1.5 * u - 4.2 * u, y - 4.1 * L.sy, 8.4 * u, 0.9 * L.sy);
  return true;
}

// ---- birds ---------------------------------------------------------------------
// A loose handful crossing the sky over the towers by day, in fair weather only.
export const BIRDS = { count: 5, ms: 64000, y: 0.2 };

export function birdSpots(L, nowMs, weather, day, reduced = false) {
  const kind = weather && weather.known ? weather.kind : 'cloud';
  if (!(day > 0.5) || ['rain', 'drizzle', 'storm', 'fog', 'snow'].includes(kind) || gloom(weather) > 0.5) return [];
  const t = time(nowMs, reduced);
  const push = weather ? windPush(weather.windSpeed, weather.windDir) : 0;
  const v = t / BIRDS.ms + 0.21;
  const dir = Math.floor(v) % 2 === 0 ? 1 : -1;
  const s = wrap(v);
  const cx = dir > 0 ? -0.15 + 1.3 * s : 1.15 - 1.3 * s;
  const out = [];
  for (let i = 0; i < BIRDS.count; i++) {
    const turn = t / (2600 + 700 * hash2(i, 241)) + 6 * hash2(i, 242);
    out.push({
      x: L.ox + (cx - dir * (0.035 * i + 0.03 * hash2(i, 243)) + 0.02 * push) * L.w,
      y: L.oy + (BIRDS.y + 0.05 * (hash2(i, 244) - 0.5) + 0.012 * Math.sin(turn) + 0.03 * Math.sin(s * Math.PI * 2)) * L.h,
      dir,
      flap: Math.sin(t / (150 + 40 * hash2(i, 245)) + 4 * i),
      size: (2.3 + 1.1 * hash2(i, 246)) * L.sx,
    });
  }
  return out;
}

export function drawBirds(ctx, L, tint, day, weather, nowMs, reduced = false) {
  const birds = birdSpots(L, nowMs, weather, day, reduced);
  if (!birds.length) return 0;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(mix(WARSAW.bird, tint.skyLow, 0.25), 0.8 * clamp((day - 0.5) * 2));
  ctx.lineWidth = 0.7 * L.sx;
  ctx.beginPath();
  for (const b of birds) {
    const lift = (0.25 + 0.45 * b.flap) * b.size; // wing tips up and down
    ctx.moveTo(b.x - b.size, b.y - lift);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x + b.size, b.y - lift);
  }
  ctx.stroke();
  ctx.restore();
  return birds.length;
}

// ---- steam in a hard frost -------------------------------------------------------
// At FROST degrees and colder, plumes rise from three roofs of the low city and
// lean with the wind. The same threshold as the river's ice.
export const FROST = ICE.from;
export const STEAM = { roofs: [4, 17, 24], puffs: 6, ms: 5200, rise: 40, lean: 30 };

export const steaming = (weather) => isUsable(weather) && weather.temperature <= FROST;

// The puffs of every plume: { x, y, r, a } in px, a pure function of the clock.
export function steamPuffs(L, nowMs, weather, reduced = false) {
  if (!steaming(weather)) return [];
  const t = time(nowMs, reduced);
  const push = windPush(weather.windSpeed, weather.windDir);
  const out = [];
  STEAM.roofs.forEach((i, n) => {
    const b = FRONT_ROW[i];
    const x0 = L.ox + (b.x + 0.4 * b.hw) * L.w;
    const y0 = L.oy + b.top * L.h;
    for (let k = 0; k < STEAM.puffs; k++) {
      const age = wrap(t / STEAM.ms + k / STEAM.puffs + 0.31 * n);
      out.push({
        x: x0 + (push * STEAM.lean * age * age + 1.5 * Math.sin(age * 7 + k + n)) * L.sx,
        y: y0 - (1 + STEAM.rise * age) * L.sy,
        r: (1.8 + 7 * age) * L.sx,
        a: Math.min(1, age * 6) * (1 - age) * (1 - age),
      });
    }
  });
  return out;
}

export function drawSteam(ctx, L, tint, night, weather, nowMs, reduced = false) {
  const puffs = steamPuffs(L, nowMs, weather, reduced);
  if (!puffs.length) return 0;
  const c = mix(mix(WARSAW.steam, WARSAW.steamNight, night), tint.skyLow, 0.15);
  for (const p of puffs) {
    ctx.fillStyle = css(c, (0.8 - 0.3 * night) * p.a);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  return STEAM.roofs.length;
}

// ---- the calendar -----------------------------------------------------------------
const clockOf = (nowMs) => {
  const d = localDate(nowMs, ZONE);
  const f = dayFraction(nowMs, ZONE);
  return typeof d === 'string' && typeof f === 'number' ? { md: d.slice(5), min: Math.round(f * 1440) } : null;
};

// New Year: from 23:55 on 31 December to 00:20 on 1 January, Warsaw time.
export function fireworksOn(nowMs) {
  const c = clockOf(nowMs);
  if (!c) return false;
  return (c.md === '12-31' && c.min >= 23 * 60 + 55) || (c.md === '01-01' && c.min <= 20);
}

// The Christmas tree stands from 6 December to 6 January.
export function treeUp(nowMs) {
  const c = clockOf(nowMs);
  if (!c) return false;
  return (c.md >= '12-06' && c.md <= '12-31') || (c.md >= '01-01' && c.md <= '01-06');
}

// A new shell every FIREWORKS.every ms, each alive for FIREWORKS.life: where it
// bursts (shares of the body), how wide, which colour and how far through its
// life it is. All from the shell's number, so the same moment is the same sky.
export const FIREWORKS = { every: 420, life: 2300, rays: 18, inner: 10, y0: 0.08, y1: 0.33 };

export function fireworkBursts(nowMs) {
  if (!Number.isFinite(nowMs)) return [];
  const out = [];
  const last = Math.floor(nowMs / FIREWORKS.every);
  for (let n = last; n > last - Math.ceil(FIREWORKS.life / FIREWORKS.every); n--) {
    const age = (nowMs - n * FIREWORKS.every) / FIREWORKS.life;
    if (age < 0 || age >= 1) continue;
    out.push({
      n,
      age,
      x: 0.14 + 0.72 * hash2(n, 251),
      y: FIREWORKS.y0 + (FIREWORKS.y1 - FIREWORKS.y0) * hash2(n, 252),
      r: 22 + 20 * hash2(n, 253),
      colour: WARSAW.fireworks[Math.floor(hash2(n, 254) * WARSAW.fireworks.length)],
      spin: hash2(n, 255) * Math.PI,
    });
  }
  return out;
}

// Painted behind the towers. Under reduced motion: a still glow in the sky, no bursts.
export function drawFireworks(ctx, L, night, nowMs, reduced = false) {
  if (!fireworksOn(nowMs) || !(night > 0)) return false;
  if (reduced) {
    [[0.3, 0.16, 0], [0.62, 0.2, 2], [0.82, 0.13, 1]].forEach(([x, y, c]) => glow(ctx, L.ox + x * L.w, L.oy + y * L.h, 34 * L.sx, WARSAW.fireworks[c], 0.22 * night));
    return true;
  }
  for (const b of fireworkBursts(nowMs)) {
    const cx = L.ox + b.x * L.w;
    const cy = L.oy + b.y * L.h;
    const out = 1 - (1 - b.age) ** 3; // fast out, then hanging
    const fade = (1 - b.age) ** 1.4 * night;
    const droop = 9 * b.age * b.age * L.sy;
    glow(ctx, cx, cy, b.r * 1.5 * L.sx, b.colour, 0.34 * (1 - b.age) * night);
    const ring = (count, share, size, tint) => {
      ctx.fillStyle = css(tint, fade);
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const a = b.spin + (i / count) * Math.PI * 2;
        const rr = b.r * share * out * (0.88 + 0.24 * hash2(b.n + i, 256)) * L.sx;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr + droop;
        ctx.moveTo(x + size, y);
        ctx.arc(x, y, size, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    ring(FIREWORKS.rays, 1, 1.4 * L.sx, b.colour);
    ring(FIREWORKS.inner, 0.55, 0.95 * L.sx, mix(b.colour, WARSAW.fireworks[5], 0.6));
    // the trails: short streaks back toward the heart, while the shell is young
    if (b.age < 0.6) {
      ctx.strokeStyle = css(b.colour, 0.5 * fade * (1 - b.age / 0.6));
      ctx.lineWidth = 0.8 * L.sx;
      ctx.beginPath();
      for (let i = 0; i < FIREWORKS.rays; i++) {
        const a = b.spin + (i / FIREWORKS.rays) * Math.PI * 2;
        const rr = b.r * out * L.sx;
        ctx.moveTo(cx + Math.cos(a) * rr * 0.55, cy + Math.sin(a) * rr * 0.55 + droop * 0.5);
        ctx.lineTo(cx + Math.cos(a) * rr * 0.92, cy + Math.sin(a) * rr * 0.92 + droop);
      }
      ctx.stroke();
    }
  }
  return true;
}

// The tree: in front of the Palace's right wing, its foot behind the low city's
// roofs. x a share of the width; height and half width in px of the reference box.
const PKIN = SKYLINE.find((t) => t.id === 'pkin');
export const FIR = { x: PKIN.x + 0.085, foot: FAR_BANK + 0.012, h: 31, hw: 7.5, lights: 13 };

export function drawTree(ctx, L, night, nowMs, reduced = false) {
  if (!treeUp(nowMs)) return false;
  const x = L.ox + FIR.x * L.w;
  const foot = L.oy + FIR.foot * L.h;
  const h = FIR.h * L.sy;
  const hw = FIR.hw * L.sx;
  const top = foot - h;
  // three tiers, widening downward
  ctx.fillStyle = css(mix(WARSAW.fir, WARSAW.firNight, night));
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const y0 = top + (h * i) / 4.2;
    const y1 = top + (h * (i + 1.6)) / 3.6;
    const half = hw * (0.5 + 0.25 * i);
    ctx.moveTo(x, y0);
    ctx.lineTo(x + half, Math.min(foot, y1));
    ctx.lineTo(x - half, Math.min(foot, y1));
    ctx.closePath();
  }
  ctx.fill();
  // its lights, a few colours, twinkling slowly; brighter after dark
  const t = reduced || !Number.isFinite(nowMs) ? 0 : nowMs / 1000;
  const lit = 0.55 + 0.45 * night;
  for (let i = 0; i < FIR.lights; i++) {
    const v = 0.14 + 0.8 * ((i + 0.5) / FIR.lights); // how far down the tree
    const half = hw * (0.16 + 0.62 * v);
    const lx = x + (hash2(i, 261) * 2 - 1) * half;
    const ly = top + v * h * 0.86;
    if (ly > foot) continue;
    const c = WARSAW.firLights[i % WARSAW.firLights.length];
    const tw = 0.7 + 0.3 * Math.sin(t * (1.3 + hash2(i, 262)) + 6 * hash2(i, 263));
    ctx.fillStyle = css(c, lit * tw);
    ctx.beginPath();
    ctx.arc(lx, ly, 0.8 * L.sx, 0, Math.PI * 2);
    ctx.fill();
  }
  if (night > 0) glow(ctx, x, top + 0.55 * h, 15 * L.sx, WARSAW.firLights[0], 0.28 * night);
  // the star on top
  ctx.fillStyle = css(WARSAW.firStar, 0.75 + 0.25 * night);
  ctx.beginPath();
  ctx.arc(x, top - 0.6 * L.sy, 1.3 * L.sx, 0, Math.PI * 2);
  ctx.fill();
  if (night > 0) glow(ctx, x, top - 0.6 * L.sy, 6 * L.sx, WARSAW.firStar, 0.6 * night);
  return true;
}

// How long before the next frame the life here needs, in ms (0 for none of its own).
export function lifeCadence(weather, opts = {}) {
  return fireworksOn(opts.nowMs) && !opts.reduced ? 100 : 0;
}
