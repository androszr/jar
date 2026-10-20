// Warsaw in a jar: a downtown close-up (Varso Tower, the Palace of Culture and
// Science, Warsaw Spire, Zlota 44, a hint of the InterContinental), a quay and
// a thin strip of the Vistula, and the Mermaid on her plinth in front. Lit by
// the look's tint; windows glow below LAMP_THRESHOLD. Heights are shares of the
// interior height above the ground.
import { LAMP_THRESHOLD, osc, clamp } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { WARSAW } from './palette.js';

export const GROUND = 0.66; // the skyline stands on this share of the interior height

// The downtown cluster, left to right: x and half width are shares of the
// interior width, roof and top (needle, spire, masts) shares of its height.
export const SKYLINE = [
  { id: 'varso', x: 0.17, hw: 0.035, roof: 0.4, top: 0.52 },
  { id: 'pkin', x: 0.42, hw: 0.16, roof: 0.36, top: 0.48 },
  { id: 'spire', x: 0.64, hw: 0.045, roof: 0.4, top: 0.45 },
  { id: 'zlota', x: 0.8, hw: 0.05, roof: 0.36, top: 0.36 },
  { id: 'intercontinental', x: 0.95, hw: 0.04, roof: 0.3, top: 0.3 },
];
const TOWER = Object.fromEntries(SKYLINE.map((t) => [t.id, t]));

// The palace's stepped tower, as tiers from the base up: half width (share of
// the interior width) and the height above the ground (share of height).
const TIERS = [
  { hw: 0.16, top: 0.09 },
  { hw: 0.12, top: 0.18 },
  { hw: 0.09, top: 0.27 },
  { hw: 0.06, top: 0.36 },
];

// The Mermaid: x a share of the width (on the quay), the plinth's half width
// and height, and the figure's height (sword included), shares as above.
export const MERMAID = { x: 0.5, base: 0.725, plinth: { hw: 0.045, h: 0.05 }, h: 0.17 };
const QUAY_TOP = GROUND;
const QUAY_BOTTOM = 0.8;
const WATER_BOTTOM = 0.92;

export function buildPlates(w, h) {
  const lit = [];
  for (let i = 0; i < 160; i++) lit.push(hash2(i, 31));
  return { w, h, lit };
}

const body = (tint, shade, stone) => mix(shade, stone, clamp(tint.light));

function windows(ctx, x0, x1, y0, y1, cols, rows, amount, plates, seed) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = (seed + r * cols + c) % plates.lit.length;
      if (plates.lit[k] > amount * 0.7) continue;
      const x = x0 + ((c + 0.5) / cols) * (x1 - x0);
      const y = y0 + ((r + 0.5) / rows) * (y1 - y0);
      ctx.fillStyle = css(WARSAW.windowGlow, 0.9);
      ctx.fillRect(x - 1.25, y - 1.25, 2.5, 2.5);
      if (plates.lit[k] < 0.12) glow(ctx, x, y, 7, WARSAW.windowGlow, 0.3);
    }
  }
}

export function drawSkyline(ctx, rect, phase, tint, plates, weather) {
  const { x, y, w, h } = rect;
  const gy = y + h * GROUND;
  const night = clamp((LAMP_THRESHOLD + 0.1 - tint.light) / 0.3);
  const stone = body(tint, WARSAW.palaceShade, WARSAW.palaceStone);
  const glass = body(tint, WARSAW.towerShade, WARSAW.towerGlass);
  const crown = body(tint, WARSAW.towerShade, WARSAW.crown);
  const snow = weather && weather.kind === 'snow';
  const cap = (x0, x1, yTop) => {
    if (!snow) return;
    ctx.fillStyle = css(WARSAW.snowCap);
    ctx.fillRect(x0, yTop - 2, x1 - x0, 4);
  };
  const sheen = (x0, tw, yTop) => {
    ctx.fillStyle = css(mix(glass, tint.skyLow, 0.18), 0.5);
    ctx.fillRect(x0, yTop, tw * 0.3, gy - yTop);
  };
  const lit = (x0, x1, yTop, cols, seed) => {
    if (night > 0) windows(ctx, x0 + 4, x1 - 4, yTop + 6, gy - 6, cols, Math.max(1, Math.round((gy - yTop) / 16)), night, plates, seed);
  };

  // the InterContinental, a hint at the right edge: a slab standing on a leg
  {
    const t = TOWER.intercontinental;
    const tx = x + w * t.x;
    const tw = w * t.hw * 2;
    const top = gy - h * t.roof;
    const foot = gy - h * 0.08;
    ctx.fillStyle = css(glass);
    ctx.fillRect(tx - tw / 2, top, tw, foot - top);
    ctx.fillRect(tx + tw * 0.1, foot, tw * 0.4, gy - foot);
    cap(tx - tw / 2, tx + tw / 2, top);
    if (night > 0) windows(ctx, tx - tw / 2 + 4, tx + tw / 2 - 4, top + 6, foot - 4, 3, Math.max(1, Math.round((foot - top) / 16)), night, plates, 90);
  }

  // Varso Tower: tall and thin, a lit crown, a needle
  {
    const t = TOWER.varso;
    const tx = x + w * t.x;
    const tw = w * t.hw * 2;
    const top = gy - h * t.roof;
    ctx.fillStyle = css(glass);
    ctx.fillRect(tx - tw / 2, top, tw, gy - top);
    sheen(tx - tw / 2, tw, top);
    ctx.fillStyle = css(crown, 0.9);
    ctx.fillRect(tx - tw / 2, top, tw, h * 0.04);
    ctx.strokeStyle = css(glass);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, top);
    ctx.lineTo(tx, gy - h * t.top);
    ctx.stroke();
    cap(tx - tw / 2, tx + tw / 2, top);
    lit(tx - tw / 2, tx + tw / 2, top + h * 0.04, 3, 10);
  }

  // Warsaw Spire: a curved crown and two masts
  {
    const t = TOWER.spire;
    const tx = x + w * t.x;
    const tw = w * t.hw * 2;
    const top = gy - h * t.roof;
    ctx.fillStyle = css(glass);
    ctx.beginPath();
    ctx.moveTo(tx - tw / 2, gy);
    ctx.lineTo(tx - tw / 2, top + h * 0.03);
    ctx.quadraticCurveTo(tx, top - h * 0.04, tx + tw / 2, top + h * 0.03);
    ctx.lineTo(tx + tw / 2, gy);
    ctx.closePath();
    ctx.fill();
    sheen(tx - tw / 2, tw, top + h * 0.03);
    ctx.strokeStyle = css(glass);
    ctx.lineWidth = 1.5;
    for (const dx of [-0.25, 0.25]) {
      ctx.beginPath();
      ctx.moveTo(tx + dx * tw, top);
      ctx.lineTo(tx + dx * tw, gy - h * t.top);
      ctx.stroke();
    }
    cap(tx - tw / 2, tx + tw / 2, top + h * 0.03);
    lit(tx - tw / 2, tx + tw / 2, top + h * 0.04, 4, 40);
  }

  // Zlota 44: a sail, straight on the left, curved on the right
  {
    const t = TOWER.zlota;
    const tx = x + w * t.x;
    const tw = w * t.hw * 2;
    const l = tx - tw / 2;
    const r = tx + tw / 2;
    const top = gy - h * t.roof;
    ctx.fillStyle = css(glass);
    ctx.beginPath();
    ctx.moveTo(l, gy);
    ctx.lineTo(l, top);
    ctx.quadraticCurveTo(r - tw * 0.1, gy - h * t.roof * 0.75, r, gy - h * t.roof * 0.35);
    ctx.lineTo(r, gy);
    ctx.closePath();
    ctx.fill();
    sheen(l, tw, top);
    cap(l, l + tw * 0.25, top);
    if (night > 0) windows(ctx, l + 4, l + tw * 0.6, top + 8, gy - 6, 3, Math.max(1, Math.round((gy - top) / 16)), night, plates, 60);
  }

  // the palace: tiers, spire, corner turrets
  const p = TOWER.pkin;
  const px = x + w * p.x;
  ctx.fillStyle = css(stone);
  let prevTop = 0;
  TIERS.forEach((t, i) => {
    const tw = w * t.hw * 2;
    ctx.fillStyle = css(stone);
    ctx.fillRect(px - tw / 2, gy - h * t.top, tw, h * t.top);
    cap(px - tw / 2, px + tw / 2, gy - h * t.top);
    prevTop = t.top;
    if (night > 0) {
      const lower = i === 0 ? 0 : TIERS[i - 1].top;
      windows(ctx, px - tw / 2 + 5, px + tw / 2 - 5, gy - h * t.top + 5, gy - h * lower - 4, 2 + i * 2, 2 + i, night, plates, i * 40);
    }
  });
  ctx.fillStyle = css(stone);
  ctx.beginPath();
  ctx.moveTo(px - w * 0.02, gy - h * prevTop);
  ctx.lineTo(px + w * 0.02, gy - h * prevTop);
  ctx.lineTo(px, gy - h * p.top);
  ctx.closePath();
  ctx.fill();
  for (const sgn of [-1, 1]) {
    for (const inner of [0, 1]) {
      const tx = px + sgn * w * (TIERS[0].hw - 0.012 - inner * 0.07);
      ctx.fillRect(tx - 6, gy - h * 0.09 - h * 0.05, 12, h * 0.05);
      ctx.beginPath();
      ctx.moveTo(tx - 6, gy - h * 0.14);
      ctx.lineTo(tx + 6, gy - h * 0.14);
      ctx.lineTo(tx, gy - h * 0.17);
      ctx.closePath();
      ctx.fill();
    }
  }
  // a little haze toward the horizon, in the sky's own light
  ctx.fillStyle = css(tint.skyLow, 0.16);
  ctx.fillRect(x, gy - h * 0.1, w, h * 0.1);
}

export function drawRiver(ctx, rect, phase, tint, weather, nowMs) {
  const { x, y, w, h } = rect;
  const quayTop = y + h * QUAY_TOP;
  const top = y + h * QUAY_BOTTOM;
  const bottom = y + h * WATER_BOTTOM;
  const wet = weather && (weather.kind === 'rain' || weather.kind === 'drizzle' || weather.kind === 'storm' || weather.kind === 'fog');
  let colour = mix(WARSAW.riverNight, WARSAW.river, clamp(tint.light));
  if (wet) colour = mix(colour, WARSAW.dull, 0.35 * clamp(tint.light + 0.2));
  // the quay the Mermaid stands on
  ctx.fillStyle = css(mix(WARSAW.quay, WARSAW.plinth, 0.25 * clamp(tint.light)));
  ctx.fillRect(x, quayTop, w, top - quayTop);
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, css(mix(colour, tint.skyLow, 0.35)));
  g.addColorStop(1, css(colour));
  ctx.fillStyle = g;
  ctx.fillRect(x, top, w, bottom - top);
  // ripples, a function of the phase so they loop with the day
  ctx.strokeStyle = css(mix(colour, tint.skyLow, 0.6), 0.5);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const ry = top + 6 + i * ((bottom - top - 8) / 3);
    const shift = osc(phase, 6, i * 0.13) * 8;
    ctx.beginPath();
    ctx.moveTo(x + 14 + shift + hash2(i, 41) * 40, ry);
    ctx.lineTo(x + w * (0.3 + 0.4 * hash2(i, 42)) + shift, ry);
    ctx.stroke();
  }
  // smeared window reflections at night
  const night = clamp((LAMP_THRESHOLD + 0.1 - tint.light) / 0.3);
  if (night > 0) {
    for (let i = 0; i < 8; i++) {
      const rx = x + w * (0.18 + 0.7 * hash2(i, 43));
      const len = 4 + 10 * hash2(i, 44);
      ctx.fillStyle = css(WARSAW.windowGlow, 0.22 * night);
      ctx.fillRect(rx + osc(phase, 8, i * 0.2) * 2, top + 2, 2, len);
    }
  }
  // the near bank
  ctx.fillStyle = css(WARSAW.bank);
  ctx.fillRect(x, bottom, w, y + h - bottom);
}

// The Mermaid of Warsaw: bronze on a stone plinth at the quay's edge, a fish
// tail, a round shield on the viewer's left, a raised sword on the right.
export function drawMermaid(ctx, rect, phase, tint, weather) {
  const { x, y, w, h } = rect;
  const mx = x + w * MERMAID.x;
  const baseY = y + h * MERMAID.base; // the plinth stands on the quay, clear of the label plate
  const pw = w * MERMAID.plinth.hw * 2;
  const ph = h * MERMAID.plinth.h;
  const light = clamp(tint.light);
  const night = clamp((LAMP_THRESHOLD + 0.1 - tint.light) / 0.3);
  const snow = weather && weather.kind === 'snow';

  ctx.fillStyle = css(mix(WARSAW.quay, WARSAW.plinth, 0.4 + 0.6 * light));
  ctx.fillRect(mx - pw / 2, baseY - ph, pw, ph);
  if (snow) {
    ctx.fillStyle = css(WARSAW.snowCap);
    ctx.fillRect(mx - pw / 2, baseY - ph - 2, pw, 4);
  }
  if (night > 0) glow(ctx, mx, baseY, 40, WARSAW.windowGlow, 0.25 * night);

  const u = h * MERMAID.h;
  const by = baseY - ph; // figure's base
  const bronze = mix(WARSAW.bronze, WARSAW.bronzeLit, light);
  const P = (dx, dy) => [mx + dx * u, by + dy * u];
  const line = (dx, dy, c) => ctx[c](...P(dx, dy));
  ctx.fillStyle = css(bronze);
  ctx.beginPath();
  line(-0.36, 0, 'moveTo');
  line(-0.2, -0.08, 'lineTo');
  line(-0.34, -0.2, 'lineTo');
  ctx.quadraticCurveTo(...P(-0.1, -0.18), ...P(0.04, -0.38));
  line(0.08, -0.55, 'lineTo');
  line(0.12, -0.7, 'lineTo');
  line(0.05, -0.76, 'lineTo');
  line(-0.07, -0.76, 'lineTo');
  line(-0.1, -0.7, 'lineTo');
  line(-0.07, -0.55, 'lineTo');
  line(-0.12, -0.4, 'lineTo');
  ctx.quadraticCurveTo(...P(-0.22, -0.02), ...P(0.1, 0));
  ctx.closePath();
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(...P(0, -0.84), u * 0.07, 0, Math.PI * 2);
  ctx.fill();
  // shield
  ctx.fillStyle = css(WARSAW.bronzeLit);
  ctx.beginPath();
  ctx.arc(...P(-0.2, -0.58), u * 0.11, 0, Math.PI * 2);
  ctx.fill();
  // sword
  ctx.strokeStyle = css(WARSAW.bronzeLit);
  ctx.lineWidth = 2;
  ctx.beginPath();
  line(0.08, -0.72, 'moveTo');
  line(0.2, -1, 'lineTo');
  ctx.stroke();
}
