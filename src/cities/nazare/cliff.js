// The life on the Sitio headland and around it: scrub along the cliff top, the
// path down the rock with its railing and lamps, the rock going dark and glossy
// where a wave has just hit it, the row of surfboards on the fort wall, a door
// under the lighthouse that is lit at night, the crowd on the fort roof (bigger
// the bigger the swell), gulls round the cliff and a safety jet ski waiting
// outside the break on a big day. Every mover is a function of `nowMs`
// (sampled, never accumulated), so the same moment draws the same pixels.
import { LAMP_THRESHOLD, clamp, wrap, lerp, smoothstep } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { windPush, REDUCED_DRIFT } from '../../weather.js';
import { NAZARE } from './palette.js';
import { waveBand, waveHeightOf, waveSize, surferAlpha } from './sea.js';
import { CLIFF, FORT, TOWER, WAVE, layout, nightAmount, cliffFaceX, waveStates, hitAt } from './scene.js';

const bump = (t) => smoothstep(clamp(t));
const tone = (day, dusk, night, n) => mix(mix(day, dusk, Math.min(1, n * 2)), night, Math.max(0, n * 2 - 1));
const kindOf = (weather) => (weather && weather.kind ? weather.kind : 'cloud');
const pushOf = (weather) => windPush(weather && weather.windSpeed, weather && weather.windDir);

// ---- the crowd on the fort roof ------------------------------------------------
// How many came to watch: nobody on a calm day or in the dark, a full roof for a
// giant sea, and half of them stay home in rain, a storm or fog.
export const CROWD = { calm: 0, moderate: 3, big: 7, giant: 12 };
export function spectatorCount(band, light, kind = 'cloud') {
  if (!(light >= LAMP_THRESHOLD)) return 0;
  const n = CROWD[band] ?? 0;
  return kind === 'rain' || kind === 'drizzle' || kind === 'storm' || kind === 'fog' || kind === 'snow' ? Math.floor(n / 2) : n;
}

// The battlements, as drawFort cuts them: a merlon every MERLON.step from the
// fort's left end, MERLON.w wide. People stand in the gaps between them.
export const MERLON = { step: 0.03, w: 0.012 };
export const PERSON = { h: 0.021, w: 0.007 }; // shares of the body height and width

// Every place a spectator may stand (shares of the width), two to a gap, none
// under the tower; shuffled once so a small crowd is spread along the wall.
export const SPECTATOR_SPOTS = (() => {
  const spots = [];
  for (let k = 0; FORT.x0 + (k + 1) * MERLON.step + MERLON.w <= FORT.x1 + 1e-9; k++) {
    const mid = FORT.x0 + k * MERLON.step + MERLON.w + (MERLON.step - MERLON.w) / 2;
    if (mid + 0.009 > TOWER.x0 && mid - 0.009 < TOWER.x1) continue;
    spots.push(mid - 0.0045, mid + 0.0045);
  }
  return spots.map((x, i) => ({ x, i })).sort((a, b) => hash2(a.i, 81) - hash2(b.i, 81)).map((s) => s.x);
})();

// How loudly they cheer, 0..1: a big or giant wave hitting the rock.
export function cheerAmount(states) {
  return Math.max(0, ...states.map((s) => hitAt(s.p) * s.stand * clamp((s.size - 0.1) / 0.06)));
}

// ---- gulls ---------------------------------------------------------------------
// Three by day in fair weather, none at night, in a storm or in fog. Each rides
// its own slow ellipse off the cliff top, carried a little downwind.
export const GULLS = [
  { x: 0.5, y: 0.2, rx: 0.085, ry: 0.028, ms: 11000 },
  { x: 0.43, y: 0.27, rx: 0.06, ry: 0.02, ms: 14000 },
  { x: 0.57, y: 0.13, rx: 0.07, ry: 0.024, ms: 9000 },
];
export function gullSpots(L, nowMs, weather, light, reduced = false) {
  const kind = kindOf(weather);
  const a = surferAlpha(light);
  if (a <= 0 || kind === 'storm' || kind === 'fog') return [];
  const push = pushOf(weather);
  const pace = reduced ? REDUCED_DRIFT : 1;
  return GULLS.map((g, i) => {
    const turn = 2 * Math.PI * wrap((nowMs * pace) / g.ms + hash2(i, 83));
    const dir = i % 2 ? -1 : 1; // which way round
    return {
      x: L.X(g.x + 0.03 * push + g.rx * Math.cos(turn)),
      y: L.Y(g.y + g.ry * Math.sin(turn * dir)),
      heading: -Math.sin(turn) >= 0 ? 1 : -1,
      flap: Math.sin((2 * Math.PI * nowMs * pace) / 620 + 2 * i),
      alpha: a,
    };
  });
}

// ---- the wet rock --------------------------------------------------------------
// How wet one wave has left the rock at roll phase p, 0..1: soaked as it hits,
// drying before the next one arrives.
export const wetAt = (p) => bump((p - WAVE.peelFrom) / 0.08) * (1 - bump((p - 0.72) / 0.2));
// How wet the foot of the cliff is now, 0..1, and how far up it reaches (a share
// of the body height): a calm sea never wets it, a giant one soaks it high.
export function rockWet(states) {
  let amount = 0;
  let reach = 0;
  for (const s of states) {
    const a = wetAt(s.p) * clamp((s.size - 0.05) / 0.03) * (0.4 + 0.6 * clamp(s.size / 0.18));
    if (a > amount) {
      amount = a;
      reach = Math.min(0.32, s.size * (1.3 + 1.2 * s.size / 0.26));
    }
  }
  return { amount, reach };
}

// ---- the path down the headland ------------------------------------------------
// From beside the fort down the rock to the beach: its corners, top to bottom
// (shares of the body), a lamp at every turn.
export const PATH = [[0.715, 0.3], [0.9, 0.375], [0.68, 0.465], [0.885, 0.555], [0.625, 0.655], [0.565, 0.715]];
export const PATH_LAMPS = PATH.slice(1, 5);

// ---- the fort wall -------------------------------------------------------------
export const DOOR = { x0: 0.773, x1: 0.787, y0: 0.276, y1: FORT.y1 };
// The boards on show beside the door: centre x, a lean, a length (share of the height).
export const BOARDS = [0.806, 0.82, 0.834, 0.848, 0.862].map((x, i) => ({ x, lean: (hash2(i, 85) - 0.5) * 0.16, len: 0.03 + 0.006 * hash2(i, 86) }));

// ---- the safety ski ------------------------------------------------------------
// Waiting outside the break on a big or giant day, by daylight.
export const RESCUE = { x: 0.385, y: 0.562 };
export function rescueSpot(L, weather, states, nowMs, light, reduced = false) {
  const band = waveBand(waveHeightOf(weather));
  const a = surferAlpha(light);
  if (a <= 0 || (band !== 'big' && band !== 'giant')) return null;
  const at = nowMs * (reduced ? REDUCED_DRIFT : 1);
  const bob = Math.sin(at / 900);
  // hidden while a wave's face stands over it, as the paddler is
  const under = Math.max(0, ...states.map((s) => {
    const top = s.baseTop - s.height(RESCUE.x) / L.h;
    return clamp((s.baseTop - RESCUE.y) / 0.01) * clamp((RESCUE.y - top) / 0.01);
  }));
  return { x: L.X(RESCUE.x + 0.004 * Math.sin(at / 2300)), y: L.Y(RESCUE.y) + 0.003 * L.h * bob, alpha: a * (1 - under) };
}

// Everything that sits on the rock and the fort, painted after them and before
// the spray. Returns how many are watching from the roof.
export function drawCliffLife(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = nightAmount(tint.light);
  const day = 1 - night;
  const kind = kindOf(weather);
  const snow = kind === 'snow';
  const push = pushOf(weather);
  const states = waveStates(L, weather, nowMs, reduced);
  const u = L.h / 396; // one px of the reference box

  // scrub along the cliff top: tufts of three blades, leaning with the wind
  const sway = reduced ? 0.4 : 1;
  ctx.strokeStyle = css(snow ? mix(NAZARE.snowCap, NAZARE.cliffNight, 0.5 * night) : tone(NAZARE.scrubDay, NAZARE.scrubDusk, NAZARE.scrubNight, night));
  ctx.lineWidth = Math.max(0.8, 1.1 * u);
  ctx.beginPath();
  const topY = (xs) => {
    const pts = plates.top;
    if (xs <= pts[0].x) return lerp(CLIFF.top.y, pts[0].y, clamp((xs - CLIFF.top.x0) / (pts[0].x - CLIFF.top.x0)));
    for (let i = 1; i < pts.length; i++) if (xs <= pts[i].x) return lerp(pts[i - 1].y, pts[i].y, (xs - pts[i - 1].x) / (pts[i].x - pts[i - 1].x));
    return pts[pts.length - 1].y;
  };
  for (let i = 0; i < 34; i++) {
    const xs = CLIFF.top.x0 + 0.004 + i * 0.0112 + 0.004 * hash2(i, 87);
    if (xs > 1) break;
    const x = L.X(xs);
    const y = L.Y(topY(xs)) + 0.5;
    const tall = (0.007 + 0.007 * hash2(i, 88)) * L.h;
    const lean = (0.55 * push + 0.12 * sway * Math.sin(nowMs / 1100 + i * 1.7)) * tall;
    for (const b of [-1, 0, 1]) {
      ctx.moveTo(x + b * 1.2 * u, y);
      ctx.lineTo(x + b * 2.4 * u + lean, y - tall * (b ? 0.7 : 1));
    }
  }
  ctx.stroke();

  // the path: a pale switchback with railing posts, snowed over in snow
  const pathC = snow ? mix(NAZARE.snowCap, NAZARE.cliffNight, 0.6 * night) : tone(NAZARE.pathDay, mix(NAZARE.pathDay, NAZARE.cliffDusk, 0.6), mix(NAZARE.pathDay, NAZARE.cliffNight, 0.85), night);
  ctx.strokeStyle = css(pathC, 0.6);
  ctx.lineWidth = Math.max(1, 1.25 * u);
  ctx.beginPath();
  PATH.forEach(([x, y], i) => (i ? ctx.lineTo(L.X(x), L.Y(y)) : ctx.moveTo(L.X(x), L.Y(y))));
  ctx.stroke();
  ctx.fillStyle = css(pathC, 0.65);
  for (let i = 1; i < PATH.length; i++) {
    const [ax, ay] = PATH[i - 1];
    const [bx, by] = PATH[i];
    const posts = Math.max(2, Math.round(Math.abs(bx - ax) / 0.035));
    for (let k = 1; k < posts; k++) ctx.fillRect(L.X(lerp(ax, bx, k / posts)) - 0.4 * u, L.Y(lerp(ay, by, k / posts)) - 3.2 * u, 0.8 * u, 2.6 * u);
  }

  // the rock a wave has just hit: dark from the foot up, with a sheen on the face
  const wet = rockWet(states);
  if (wet.amount > 0.01) {
    const strips = 12;
    // only on the rock: the face on the left, never out over the water
    ctx.save();
    ctx.beginPath();
    plates.face.forEach((p, i) => (i ? ctx.lineTo(L.X(p.x), L.Y(p.y)) : ctx.moveTo(L.X(p.x), L.Y(p.y))));
    ctx.lineTo(L.X(1.1), L.Y(CLIFF.top.y));
    ctx.lineTo(L.X(1.1), L.Y(CLIFF.bottom));
    ctx.lineTo(L.X(CLIFF.foot.x), L.Y(CLIFF.bottom));
    ctx.closePath();
    ctx.clip();
    const y1 = CLIFF.bottom;
    const y0 = CLIFF.foot.y - wet.reach;
    for (let k = 0; k < strips; k++) {
      const ya = lerp(y0, y1, k / strips);
      const yb = lerp(y0, y1, (k + 1) / strips);
      const fx = L.X(cliffFaceX((ya + yb) / 2, plates));
      const a = 0.55 * wet.amount * bump((k + 0.5) / (strips * 0.7));
      const g = ctx.createLinearGradient(fx, 0, fx + 0.11 * L.w, 0);
      g.addColorStop(0, css(NAZARE.rockWet, a));
      g.addColorStop(1, css(NAZARE.rockWet, 0));
      ctx.fillStyle = g;
      ctx.fillRect(fx - 0.012 * L.w, L.Y(ya), 0.122 * L.w, L.Y(yb) - L.Y(ya) + 0.5);
    }
    ctx.restore();
    ctx.strokeStyle = css(mix(NAZARE.rockSheen, NAZARE.foamNight, night), wet.amount * (0.5 * day + 0.2 * night));
    ctx.lineWidth = Math.max(1, 1.4 * u);
    ctx.beginPath();
    let started = false;
    for (const p of plates.face) {
      if (p.y < y0) break;
      const x = L.X(p.x) + 2.2 * u;
      if (started) ctx.lineTo(x, L.Y(p.y));
      else ctx.moveTo(x, L.Y(p.y));
      started = true;
    }
    ctx.stroke();
  }

  // the door under the lighthouse: dark by day, lit from inside at night
  const dx0 = L.X(DOOR.x0);
  const dw = L.X(DOOR.x1) - dx0;
  const dy0 = L.Y(DOOR.y0);
  ctx.fillStyle = css(mix(NAZARE.rockStripe, NAZARE.fortDoor, night));
  ctx.fillRect(dx0, dy0, dw, L.Y(DOOR.y1) - dy0);
  if (night > 0) glow(ctx, dx0 + dw / 2, (dy0 + L.Y(DOOR.y1)) / 2, 0.03 * L.w, NAZARE.fortDoor, 0.55 * night);

  // the boards on show against the wall
  BOARDS.forEach((b, i) => {
    const len = b.len * L.h;
    ctx.fillStyle = css(mix(NAZARE.boards[i % NAZARE.boards.length], NAZARE.fortNight, 0.8 * night));
    ctx.beginPath();
    ctx.ellipse(L.X(b.x) + b.lean * len * 0.5, L.Y(FORT.y1) - len / 2, 0.0042 * L.w, len / 2, b.lean, 0, Math.PI * 2);
    ctx.fill();
  });

  // lamps at the turns of the path
  if (night > 0) {
    for (const [x, y] of PATH_LAMPS) {
      ctx.fillStyle = css(NAZARE.pathLamp, 0.95 * night);
      ctx.fillRect(L.X(x) - 0.8 * u, L.Y(y) - 5 * u, 1.6 * u, 1.6 * u);
      glow(ctx, L.X(x), L.Y(y) - 4 * u, 7 * u, NAZARE.pathLamp, 0.35 * night);
    }
  }

  // the crowd on the roof, arms up when a big one hits
  const count = spectatorCount(waveBand(waveHeightOf(weather)), tint.light, kind);
  const alpha = surferAlpha(tint.light);
  if (count > 0 && alpha > 0) {
    const cheer = cheerAmount(states);
    const ph = PERSON.h * L.h;
    const pw = PERSON.w * L.w;
    const feet = L.Y(FORT.y0);
    SPECTATOR_SPOTS.slice(0, count).forEach((xs, i) => {
      const x = L.X(xs);
      const h = ph * (0.88 + 0.24 * hash2(i, 89));
      ctx.fillStyle = css(NAZARE.jackets[Math.floor(hash2(i, 90) * NAZARE.jackets.length)], alpha);
      ctx.fillRect(x - pw / 2, feet - 0.72 * h, pw, 0.72 * h + 0.5);
      ctx.fillStyle = css(NAZARE.bather, alpha);
      ctx.beginPath();
      ctx.arc(x, feet - 0.84 * h, 0.17 * h, 0, Math.PI * 2);
      ctx.fill();
      if (cheer > 0.5 && hash2(i, 91) < 0.7) {
        ctx.strokeStyle = css(NAZARE.bather, alpha);
        ctx.lineWidth = Math.max(0.7, 0.9 * u);
        ctx.beginPath();
        ctx.moveTo(x - pw / 2, feet - 0.66 * h);
        ctx.lineTo(x - pw, feet - 1.02 * h);
        ctx.moveTo(x + pw / 2, feet - 0.66 * h);
        ctx.lineTo(x + pw, feet - 1.02 * h);
        ctx.stroke();
      }
    });
  }
  return count;
}

// What is out over the water: the safety ski, then the gulls. Painted after the
// surfers. Returns { gulls, rescue }.
export function drawSeaLife(ctx, rect, phase, tint, weather, plates, nowMs, reduced = false) {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = nightAmount(tint.light);
  const states = waveStates(L, weather, nowMs, reduced);
  const r = rescueSpot(L, weather, states, nowMs, tint.light, reduced);
  if (r && r.alpha > 0) {
    const u = 0.011 * L.h;
    ctx.fillStyle = css(NAZARE.ski, r.alpha);
    ctx.beginPath();
    ctx.moveTo(r.x - 1.3 * u, r.y);
    ctx.lineTo(r.x + 1.1 * u, r.y - 0.45 * u);
    ctx.lineTo(r.x + 1.3 * u, r.y + 0.2 * u);
    ctx.lineTo(r.x - 1.1 * u, r.y + 0.35 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css(NAZARE.rescueTrim, r.alpha);
    ctx.fillRect(r.x - 0.45 * u, r.y - 0.7 * u, 0.9 * u, 0.35 * u);
    ctx.fillStyle = css(NAZARE.surfer, r.alpha);
    ctx.beginPath();
    ctx.arc(r.x - 0.1 * u, r.y - 1.15 * u, 0.4 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  const gulls = gullSpots(L, nowMs, weather, tint.light, reduced);
  const span = 0.016 * L.w;
  for (const g of gulls) {
    ctx.strokeStyle = css(mix(NAZARE.gull, NAZARE.cliffNight, 0.5 * night), 0.85 * g.alpha);
    ctx.lineWidth = Math.max(0.9, 1.2 * L.h / 396);
    ctx.beginPath();
    ctx.moveTo(g.x - span, g.y - 0.45 * span * g.flap);
    ctx.quadraticCurveTo(g.x - 0.4 * span, g.y - 0.35 * span, g.x, g.y);
    ctx.quadraticCurveTo(g.x + 0.4 * span, g.y - 0.35 * span, g.x + span, g.y - 0.45 * span * g.flap);
    ctx.stroke();
  }
  return { gulls: gulls.length, rescue: !!(r && r.alpha > 0) };
}
