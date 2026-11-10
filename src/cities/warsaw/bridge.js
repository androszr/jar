// The Swietokrzyski Bridge, in front of Warsaw's skyline: the deck leaves the far
// quay on the left and lands in the near (Praga) bank's forest on the right,
// hung from one inverted-Y pylon that stands among those trees, its cables fanning to
// the far side and a short back stay. Lamps along the deck and a red light on the
// pylon's head come up with the dark. Shares of the 340 x 396 body box.
import { css, mix, glow } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { layout, nightAmount, tone } from './scene.js';
import { WARSAW } from './palette.js';

export const BRIDGE = {
  x0: 0.3, // where the deck leaves the far quay (share of the width), right of the Mermaid
  pylon: 0.8, // the pylon's x (share of the width)
  head: 0.3, // the pylon's head (share of the body height from the top)
  land: 0.702, // the deck's height where it meets the right edge, over the trees
  sag: 4, // px the deck bows upward at mid-span
  fan: 11, // cables to the far side
  back: 6, // back-stay cables
  lampStep: 9, // px between deck lamps
};

// The deck's top edge at x px, for a layout L.
export function deckY(L, x) {
  const x0 = L.X(BRIDGE.x0);
  const t = (x - x0) / (L.X(1) - x0);
  const y0 = L.river.top - 2 * L.sy;
  const y1 = L.oy + BRIDGE.land * L.h;
  return y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * BRIDGE.sag * L.sy;
}

// Night traffic: lights crawl along the deck, white ones inbound (rightwards),
// red ones outbound (leftwards). Position is a pure function of nowMs.
export const TRAFFIC = {
  count: 9, // lights per direction
  periodMs: 28000, // one light crosses the whole deck at base speed
  spread: 0.6, // extra fraction of speed a light may have
  laneIn: 0.6, // px below the deck's top edge, inbound lane
  laneOut: 2.2, // outbound lane
};

export function trafficLights(L, nowMs, reduced = false) {
  const x0 = L.X(BRIDGE.x0);
  const x1 = L.X(1);
  const out = [];
  for (const dir of [1, -1]) {
    for (let i = 0; i < TRAFFIC.count; i++) {
      const v = hash2(i, dir + 2) + (dir * (reduced ? 0.4 : 1) * nowMs / TRAFFIC.periodMs) * (1 + TRAFFIC.spread * hash2(i, 3));
      const s = v - Math.floor(v);
      const x = x0 + s * (x1 - x0);
      out.push({ x, y: deckY(L, x) + (dir > 0 ? TRAFFIC.laneIn : TRAFFIC.laneOut) * L.sy, dir });
    }
  }
  return out;
}

export function drawBridge(ctx, rect, phase, tint, weather, nowMs = 0, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = nightAmount(tint.light);
  const snow = weather && weather.kind === 'snow';
  const x0 = L.X(BRIDGE.x0);
  const x1 = L.X(1);
  const px = L.X(BRIDGE.pylon);
  const head = L.oy + BRIDGE.head * L.h;
  const base = deckY(L, px);
  const foot = L.quayTop + 10 * L.sy;
  const steel = tone(WARSAW.pylonDay, WARSAW.pylonDay, WARSAW.pylonNight, night);

  // the cables, behind the deck: a fan to the far side, a short back stay
  ctx.strokeStyle = css(tone(WARSAW.cableDay, WARSAW.cableDay, WARSAW.cableNight, night), 0.45 + 0.25 * night);
  ctx.lineWidth = 0.5 * L.sx;
  const span = px - 20 * L.sx - (x0 + 24 * L.sx);
  for (let i = 0; i < BRIDGE.fan; i++) {
    const x = px - 20 * L.sx - (span * i) / (BRIDGE.fan - 1);
    ctx.beginPath();
    ctx.moveTo(px, head + (6 + i * 0.6) * L.sy);
    ctx.lineTo(x, deckY(L, x));
    ctx.stroke();
  }
  for (let i = 0; i < BRIDGE.back; i++) {
    const x = Math.min(x1, px + (10 + i * 9) * L.sx);
    ctx.beginPath();
    ctx.moveTo(px, head + (6 + i) * L.sy);
    ctx.lineTo(x, deckY(L, x) + 2 * L.sy);
    ctx.stroke();
  }

  // the deck, a thin band with its own thickness
  ctx.beginPath();
  for (let x = x0; x <= x1 + 0.01; x += 4 * L.sx) ctx.lineTo(x, deckY(L, x));
  for (let x = x1; x >= x0 - 0.01; x -= 4 * L.sx) ctx.lineTo(x, deckY(L, x) + 4 * L.sy);
  ctx.closePath();
  ctx.fillStyle = css(tone(WARSAW.deckDay, WARSAW.deckNight, WARSAW.deckNight, night));
  ctx.fill();
  if (snow) {
    ctx.beginPath();
    for (let x = x0; x <= x1 + 0.01; x += 4 * L.sx) ctx.lineTo(x, deckY(L, x) - 0.6 * L.sy);
    for (let x = x1; x >= x0 - 0.01; x -= 4 * L.sx) ctx.lineTo(x, deckY(L, x) + 1 * L.sy);
    ctx.closePath();
    ctx.fillStyle = css(mix(WARSAW.snowCap, WARSAW.pylonNight, 0.5 * night));
    ctx.fill();
  }

  // the pylon: one mast that splits into two legs standing in the forest
  const mid = head + 0.45 * (base - head);
  ctx.beginPath();
  ctx.moveTo(px - 1.8 * L.sx, head);
  ctx.lineTo(px + 1.8 * L.sx, head);
  ctx.lineTo(px + 2.2 * L.sx, mid);
  ctx.lineTo(px + 12 * L.sx, foot);
  ctx.lineTo(px + 8.5 * L.sx, foot);
  ctx.lineTo(px, mid + 4 * L.sy);
  ctx.lineTo(px - 8.5 * L.sx, foot);
  ctx.lineTo(px - 12 * L.sx, foot);
  ctx.lineTo(px - 2.2 * L.sx, mid);
  ctx.closePath();
  ctx.fillStyle = css(steel);
  ctx.fill();

  if (night > 0) {
    // the red light on the pylon's head, and the lamps along the deck
    ctx.fillStyle = css(WARSAW.pylonLight, night);
    ctx.beginPath();
    ctx.arc(px, head - 1.5 * L.sy, 2 * L.sx, 0, Math.PI * 2);
    ctx.fill();
    glow(ctx, px, head, 10 * L.sx, WARSAW.pylonLight, 0.6 * night);
    ctx.fillStyle = css(WARSAW.deckLamp, 0.95 * night);
    for (let x = x0 + 6 * L.sx; x < x1; x += BRIDGE.lampStep * L.sx) {
      ctx.beginPath();
      ctx.arc(x, deckY(L, x) - 1.5 * L.sy, 1 * L.sx, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const { x, y, dir } of trafficLights(L, nowMs, reduced)) {
      const colour = dir > 0 ? WARSAW.headlight : WARSAW.taillight;
      glow(ctx, x, y, 5 * L.sx, colour, 0.55 * night);
      ctx.fillStyle = css(colour, night);
      ctx.fillRect(x - 1.3 * L.sx, y - 0.8 * L.sy, 2.6 * L.sx, 1.6 * L.sy);
    }
  }
}
