// The Swietokrzyski Bridge, in front of Warsaw's skyline: the deck leaves the far
// quay on the left and lands in the near (Praga) bank's forest on the right,
// hung from one inverted-Y pylon that stands among those trees, its cables fanning to
// the far side and a short back stay. Lamps along the deck and a red light on the
// pylon's head come up with the dark; by day the pylon is grey steel with a light
// side toward the sun, the deck has depth and a railing, and small cars and a bus
// cross it. Shares of the 340 x 396 body box.
import { css, mix, glow } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { layout, nightAmount, tone, sunLight, rainy } from './scene.js';
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

// The deck seen from the near bank: thin where it leaves the far quay, thicker
// as it comes toward the viewer. `t` is 0 at the far end, 1 at the right edge.
export const DECK = { far: 3, near: 6.5, rail: 1.5, post: 7 };
export const deckT = (L, x) => Math.max(0, Math.min(1, (x - L.X(BRIDGE.x0)) / (L.X(1) - L.X(BRIDGE.x0))));
export const deckThick = (L, x) => (DECK.far + (DECK.near - DECK.far) * deckT(L, x)) * L.sy;

// Daytime traffic: the same movers as the night's lights, as tiny cars; the
// first of each direction is a bus. { x, y (the road under it), w, h, dir, bus, paint }.
export function vehicles(L, nowMs, reduced = false) {
  return trafficLights(L, nowMs, reduced).map((l, n) => {
    const i = n % TRAFFIC.count;
    const t = deckT(L, l.x);
    const bus = i === 0;
    const size = 0.75 + 0.6 * t; // nearer is bigger
    return {
      x: l.x,
      y: deckY(L, l.x) + (l.dir > 0 ? 0.2 : 0.9) * L.sy,
      w: (bus ? 7.5 : 3.6) * size * L.sx,
      h: (bus ? 2.6 : 1.7) * size * L.sy,
      dir: l.dir,
      bus,
      paint: bus ? WARSAW.bus : WARSAW.cars[Math.floor(hash2(i, l.dir + 7) * WARSAW.cars.length)],
    };
  });
}

// `light` is scene.js's sunLight() (worked out here when not handed in): the pylon's light side follows the sun.
// Returns { vehicles }: how many cars were drawn by day.
export function drawBridge(ctx, rect, phase, tint, weather, nowMs = 0, reduced = false, light = null) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = nightAmount(tint.light);
  const day = 1 - night;
  const snow = weather && weather.kind === 'snow';
  const wet = rainy(weather);
  const { side, golden, heavy } = light || sunLight(phase, weather);
  const x0 = L.X(BRIDGE.x0);
  const x1 = L.X(1);
  const px = L.X(BRIDGE.pylon);
  const head = L.oy + BRIDGE.head * L.h;
  const base = deckY(L, px);
  const foot = L.quayTop + 10 * L.sy;
  // grey steel: a light side toward the sun (warm when it is low, flat under a heavy sky), a shade side away from it
  const shadeC = tone(WARSAW.pylonShade, WARSAW.pylonNight, WARSAW.pylonNight, night);
  const litC = tone(mix(mix(WARSAW.pylonLit, WARSAW.pylonGolden, 0.7 * golden), WARSAW.pylonShade, 0.6 * heavy), WARSAW.pylonNight, WARSAW.pylonNight, night);

  // the cables, behind the deck: a fan to the far side, a short back stay
  ctx.strokeStyle = css(tone(WARSAW.cableDay, WARSAW.cableDay, WARSAW.cableNight, night), 0.4 + 0.3 * night);
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

  // the deck: a girder with some depth, a paler road edge along its top, a darker underside
  const edge = (dy, k = 0) => (x) => deckY(L, x) + dy * L.sy + k * deckThick(L, x);
  const band = (upper, lower) => {
    ctx.beginPath();
    for (let x = x0; x <= x1 + 0.01; x += 4 * L.sx) ctx.lineTo(x, upper(x));
    for (let x = x1; x >= x0 - 0.01; x -= 4 * L.sx) ctx.lineTo(x, lower(x));
    ctx.closePath();
  };
  const deckC = tone(WARSAW.deckDay, WARSAW.deckNight, WARSAW.deckNight, night);
  band(edge(0), edge(0, 1));
  ctx.fillStyle = css(deckC);
  ctx.fill();
  band(edge(0, 0.62), edge(0, 1));
  ctx.fillStyle = css(mix(deckC, WARSAW.deckNight, 0.45));
  ctx.fill();
  band(edge(0), edge(0, 0.22));
  ctx.fillStyle = css(tone(WARSAW.deckEdge, WARSAW.deckNight, WARSAW.deckNight, night), 0.9 * day + 0.25);
  ctx.fill();
  if (snow) {
    band(edge(-0.6), edge(1));
    ctx.fillStyle = css(mix(WARSAW.snowCap, WARSAW.pylonNight, 0.5 * night));
    ctx.fill();
  }

  // by day, the traffic: small cars and a bus in each direction, the far lane first
  let cars = 0;
  if (day > 0) {
    const all = vehicles(L, nowMs, reduced);
    for (const dir of [1, -1]) {
      for (const v of all) {
        if (v.dir !== dir) continue;
        ctx.fillStyle = css(v.paint, day);
        ctx.fillRect(v.x - v.w / 2, v.y - v.h, v.w, v.h);
        ctx.fillStyle = css(v.bus ? WARSAW.busStripe : WARSAW.facadeWindow, 0.75 * day);
        if (v.bus) ctx.fillRect(v.x - v.w / 2, v.y - 0.4 * v.h, v.w, 0.4 * v.h);
        else ctx.fillRect(v.x - v.w * 0.22, v.y - v.h, v.w * 0.5, 0.45 * v.h);
        cars++;
      }
    }
  }

  // the railing on the near side: a thin rail on short posts
  ctx.strokeStyle = css(tone(WARSAW.railing, WARSAW.cableNight, WARSAW.cableNight, night), 0.85 * day + 0.4 * night);
  ctx.lineWidth = 0.5 * L.sx;
  const railY = (x) => deckY(L, x) - DECK.rail * (0.7 + 0.8 * deckT(L, x)) * L.sy;
  ctx.beginPath();
  for (let x = x0; x <= x1 + 0.01; x += 4 * L.sx) ctx.lineTo(x, railY(x));
  for (let x = x0 + 3 * L.sx; x < x1; x += DECK.post * L.sx) {
    ctx.moveTo(x, railY(x));
    ctx.lineTo(x, deckY(L, x));
  }
  ctx.stroke();

  // the pylon: one mast that splits into two legs standing in the forest;
  // the whole of it in shade grey, then the half and the leg that face the sun
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
  ctx.fillStyle = css(shadeC);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(px + side * 0.3 * L.sx, head);
  ctx.lineTo(px + side * 1.8 * L.sx, head);
  ctx.lineTo(px + side * 2.2 * L.sx, mid);
  ctx.lineTo(px + side * 12 * L.sx, foot);
  ctx.lineTo(px + side * 10.4 * L.sx, foot);
  ctx.lineTo(px + side * 0.9 * L.sx, mid + 1.5 * L.sy);
  ctx.closePath();
  ctx.fillStyle = css(litC);
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
    // the traffic's lights: small soft points, wider and brighter on a wet road
    for (const { x, y, dir } of trafficLights(L, nowMs, reduced)) {
      const colour = dir > 0 ? WARSAW.headlight : WARSAW.taillight;
      glow(ctx, x, y, (wet ? 8 : 5) * L.sx, colour, (wet ? 0.7 : 0.55) * night);
      ctx.fillStyle = css(colour, night);
      ctx.fillRect(x - 1.3 * L.sx, y - 0.8 * L.sy, 2.6 * L.sx, 1.6 * L.sy);
    }
  }
  return { vehicles: cars };
}
