// The air over El Chalten: the southern night sky (a band of the Milky Way, the
// Southern Cross), the evening sun going down behind the wall, the clouds the
// wind makes (the banner off the summit, a lens beside it, snow blown off the
// ridges) and the cloud deck that caps the peak or hides it. Every mover is a
// function of `nowMs`.
import { clamp, wrap, lerp } from '../../clock.js';
import { css, mix, glow, lightPatch } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { EL_CHALTEN as EC } from './palette.js';
import { HIDDEN_EDGE, plumeLength, deckHeight, eveningSun, ghostWindow, spindriftAmount, lensAmount } from './massif.js';
import { SEED, SHORE, GRAVEL, SUMMIT, SUN_X, puff, poly, glowShare } from './scene.js';

const hh = (i, k) => hash2(i, SEED + k);
const TURN = Math.PI * 2;
const clearish = (m) => m.band === 'clear' || m.band === 'smoking';

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TURN);
  ctx.fill();
}

// Where the evening sun stands behind the wall, as shares of the body.
export const sunSpot = (sink) => ({ x: SUN_X, y: lerp(0.1, 0.34, sink) });
// The rays it throws up past the ridgeline: [angle from straight up (radians), length, half-width].
export const RAYS = [[-1.25, 0.34, 0.05], [-0.8, 0.42, 0.04], [-0.38, 0.3, 0.035], [0.12, 0.36, 0.045], [0.55, 0.44, 0.04], [0.95, 0.33, 0.05], [1.32, 0.38, 0.045]];

// The sky's extras, behind everything: by night (a clear one) the Milky Way and
// the Southern Cross above the shared stars; in the evening the sun's glow and a
// few faint rays behind the wall (the view faces west, so it sets behind the
// peak and never rises in frame).
export function drawSky(ctx, L, phase, tint, plates, m) {
  const u = Math.max(1, L.w / 340);
  if (clearish(m) && m.n > 0.5) {
    // a bright moon washes the faint band out
    const nk = (m.n - 0.5) * 2 * (1 - (m.cover / 100) * 0.8);
    const faint = nk * (1 - 0.65 * m.moon.k);
    for (const c of plates.sky.clouds) puff(ctx, L.X(c.x), L.Y(c.y), L.w * c.r, EC.milky, 0.085 * c.a * faint);
    for (const d of plates.sky.dust) {
      ctx.fillStyle = css(EC.star, d.a * faint);
      dot(ctx, L.X(d.x), L.Y(d.y), d.r * u);
    }
    plates.cross.stars.forEach(([x, y], i) => {
      const r = (i === 4 ? 0.8 : i === 1 ? 1.7 : 1.35) * u;
      if (i < 4) glow(ctx, L.X(x), L.Y(y), r * 4.5, EC.star, 0.4 * nk);
      ctx.fillStyle = css(EC.star, (i === 4 ? 0.7 : 0.98) * nk);
      dot(ctx, L.X(x), L.Y(y), r);
    });
    for (const [x, y] of plates.cross.pointers) {
      glow(ctx, L.X(x), L.Y(y), 6 * u, EC.star, 0.35 * nk);
      ctx.fillStyle = css(EC.star, 0.95 * nk);
      dot(ctx, L.X(x), L.Y(y), 1.5 * u);
    }
  }
  const sun = eveningSun(phase);
  if (m.band !== 'hidden' && sun.k > 0) {
    const k = sun.k * (1 - (m.cover / 100) * 0.8);
    const s = sunSpot(sun.sink);
    const x = L.X(s.x);
    const y = L.Y(s.y);
    glow(ctx, x, y, L.w * 0.5, EC.sunset, 0.22 * k);
    glow(ctx, x, y, L.w * 0.12, EC.sunsetRim, 0.3 * k);
    for (const [a, len, half] of RAYS) {
      const far = len * L.h * (0.8 + 0.4 * sun.sink);
      const tip = (b) => [x + Math.sin(b) * far, y - Math.cos(b) * far];
      const y1 = y - Math.cos(a) * far;
      lightPatch(ctx, [[x, y], tip(a - half), tip(a + half)], EC.sunsetRim, 0.055 * k, y, Math.min(y1, y - 0.12 * L.h));
    }
  }
}

// A cloud's own colour at this hour: night-dark, pink underneath at first light,
// lit from behind in the evening.
function cloudTone(colour, tint, m, y) {
  let c = mix(mix(colour, tint.skyLow, 0.25), EC.graniteNight, m.n * 0.75);
  c = mix(c, EC.emberCloud, 0.6 * glowShare(m, y));
  return mix(c, EC.sunsetRim, 0.4 * m.sil * (1 - m.n));
}

// The banner cloud streaming off the summit: longer in more wind, carried the
// way the wind goes, short and fat towards you when it comes from due west.
export function drawPlume(ctx, L, phase, tint, plates, nowMs, m) {
  const len = clearish(m) ? plumeLength(m.wind) : 0;
  if (len <= 0) return;
  const fat = 1 + (1 - Math.abs(m.side)) * 0.6;
  const col = cloudTone(EC.plume, tint, m, SUMMIT.y);
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = L.X(SUMMIT.x + m.side * len * t);
    // with no side to go to (a wind from due west, or none read) it lifts off the tip instead of piling on it
    const lift = (1 - Math.abs(m.side)) * 0.5 * len * t;
    const y = L.Y(SUMMIT.y + 0.012 + 0.018 * t - lift + 0.004 * Math.sin(nowMs / 1100 + i));
    puff(ctx, x, y, L.w * (0.012 + 0.12 * len * t) * fat, col, (0.85 - 0.3 * (1 - Math.abs(m.side))) * (1 - t * 0.6));
  }
}

// A lenticular cloud on a windy clear day: a smooth lens standing still in the
// wind, upwind of the summit so the banner never crosses it, two plates stacked,
// each with a flat shaded underside. It breathes a little; it does not drift.
export function lensSpot(side) {
  return { x: SUMMIT.x - (side < 0 ? -1 : 1) * 0.2, y: 0.108 };
}
export function drawLens(ctx, L, phase, tint, plates, nowMs, m) {
  const k = lensAmount(m.wind, m.band, m.cover);
  if (k <= 0.02) return;
  const s = lensSpot(m.side);
  const top = cloudTone(EC.lens, tint, m, s.y);
  const under = cloudTone(EC.lensShade, tint, m, s.y);
  const breathe = 1 + 0.03 * Math.sin(nowMs / 5200);
  const plates2 = [[0, 0, 0.125, 0.026], [0.012, -0.027, 0.08, 0.017]];
  for (const [dx, dy, rw, rh] of plates2) {
    const x = L.X(s.x + dx);
    const y = L.Y(s.y + dy);
    const rx = L.w * rw * breathe * (0.6 + 0.4 * k);
    const ry = L.h * rh;
    // the lens: a full curve above, a nearly flat base
    ctx.fillStyle = css(top, 0.9 * k);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, Math.PI, TURN);
    ctx.ellipse(x, y, rx, ry * 0.35, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = css(under, 0.75 * k);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry * 0.35, 0, 0, Math.PI);
    ctx.ellipse(x, y - ry * 0.05, rx * 0.96, ry * 0.12, 0, Math.PI, 0, true);
    ctx.fill();
  }
}

// Spindrift: in a strong wind snow streams off the ridges in short torn banners.
export function drawSpindrift(ctx, L, phase, tint, plates, nowMs, m) {
  const k = clearish(m) ? spindriftAmount(m.wind) : 0;
  if (k <= 0) return;
  const side = Math.abs(m.side) < 0.25 ? 0.25 : m.side;
  const count = 2 + Math.round(k * (plates.spindrift.length - 2));
  for (let j = 0; j < count; j++) {
    const [sx, sy] = plates.spindrift[j];
    const col = cloudTone(EC.snow, tint, m, sy);
    const len = (0.045 + 0.05 * k) * (0.7 + 0.6 * hh(j, 130));
    for (let i = 0; i < 5; i++) {
      // each wisp is born on the ridge, blows out along the wind and thins away
      const life = wrap(nowMs / (1500 + 500 * hh(j * 5 + i, 131)) + i / 5 + hh(j, 132));
      const x = sx + side * len * life;
      const y = sy - 0.004 - 0.014 * life + 0.004 * Math.sin(life * 9 + j);
      puff(ctx, L.X(x), L.Y(y), L.w * (0.006 + 0.016 * life), col, 0.6 * k * (1 - life) * (0.5 + 0.5 * Math.min(1, life * 6)));
    }
  }
}

// How deep the soft edge of the deck is, as a share of the body height.
export const DECK_SOFT = { capped: 0.035, hidden: 0.05 };

// A deck of cloud sitting on the summits when the peak is capped, or the whole
// sky come down when it is hidden. Hidden is not blank: the base is dark and
// ragged, the foot of the moraine and the shore stay in view under it, torn
// scud drifts below it, shafts of rain or snow hang from it, and now and then the
// cloud thins for a few seconds and a ghost of the wall shows. `mirrored` is the
// lake's copy, which carries the deck and none of the rest.
export function drawDeck(ctx, L, phase, tint, plates, nowMs, m, mirrored = false) {
  if (m.band !== 'capped' && m.band !== 'hidden') return;
  const hidden = m.band === 'hidden';
  const night = (c) => mix(c, EC.graniteNight, m.n * 0.8);
  // a cap sits on the summits; a hidden day comes down to the moraine's crest
  const edge = hidden ? HIDDEN_EDGE : deckHeight(m.cover);
  const col = night(mix(EC.deck, EC.deckDark, hidden ? 0.55 : 0.25));
  // the underside: darker on a hidden day, warm at first light and in the evening under a cap
  let base = hidden ? night(mix(EC.deckDark, EC.deckBase, 0.75)) : col;
  if (!hidden) base = mix(mix(col, EC.emberCloud, 0.5 * m.glowK), EC.sunset, 0.3 * m.sil * (1 - m.n));
  const a = hidden ? 0.97 : 0.92;
  // solid above, thinning to nothing across the edge, so the base is soft
  const soft = L.h * (hidden ? DECK_SOFT.hidden : DECK_SOFT.capped);
  const y1 = L.Y(edge);
  ctx.fillStyle = css(col, a);
  ctx.fillRect(L.ox, L.oy, L.w, y1 - soft - L.oy);
  if (hidden) {
    // the cloud darkens towards its base
    const dg = ctx.createLinearGradient(0, L.Y(0.1), 0, y1 - soft);
    dg.addColorStop(0, css(base, 0));
    dg.addColorStop(1, css(base, 0.9));
    ctx.fillStyle = dg;
    ctx.fillRect(L.ox, L.Y(0.1), L.w, y1 - soft - L.Y(0.1));
  }
  const g = ctx.createLinearGradient(0, y1 - soft, 0, y1 + soft);
  g.addColorStop(0, css(base, a));
  g.addColorStop(1, css(base, 0));
  ctx.fillStyle = g;
  ctx.fillRect(L.ox, y1 - soft, L.w, 2 * soft);

  // the thin window: the cloud pales round the summit and the wall stands in it, grey
  const ghost = hidden && !mirrored ? ghostWindow(nowMs, m.reduced) : 0;
  if (ghost > 0) {
    puff(ctx, L.X(SUMMIT.x - 0.03), L.Y(0.22), L.w * 0.42, night(EC.deck), 0.5 * ghost);
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.ox, L.oy, L.w, y1 - soft * 0.6 - L.oy);
    ctx.clip();
    ctx.fillStyle = css(night(EC.ghost), 0.42 * ghost);
    for (const b of [...plates.south, plates.poincenot, plates.fitzroy, ...plates.needles]) { poly(ctx, L, b.outline); ctx.fill(); }
    ctx.fillStyle = css(night(EC.deck), 0.5 * ghost);
    for (const s of [...plates.snowfields, ...plates.caps]) { poly(ctx, L, s); ctx.fill(); }
    ctx.restore();
    // ... and its foot is still in the cloud
    puff(ctx, L.X(0.5), L.Y(0.36), L.w * 0.3, col, 0.6 * ghost);
    puff(ctx, L.X(0.74), L.Y(0.35), L.w * 0.26, col, 0.6 * ghost);
  }

  // two ragged rows of cloud along the base, drifting with the wind
  const way = hidden && Math.abs(m.side) < 0.2 ? 0.3 : m.side;
  const drift = (way * Math.max(m.wind, hidden ? 12 : 0) * nowMs) / 6e6;
  for (let i = 0; i < 18; i++) {
    const row = i % 2;
    const x = L.ox + L.w * (wrap(i / 17 + 0.04 * hh(i, 90) + drift * (row ? 0.7 : 1)) * 1.3 - 0.15);
    const y = y1 - row * 0.03 * L.h + 0.005 * L.h * Math.sin(nowMs / 1800 + i) + (hidden ? (hh(i, 92) - 0.5) * 0.03 * L.h : 0);
    puff(ctx, x, y, L.w * (0.07 + 0.06 * hh(i, 91)), row ? col : base, row ? 0.6 : 0.85);
  }
  if (!hidden || mirrored) return;

  // shafts of rain (or snow) hanging from the base to the water, leaning with the wind
  const wet = m.kind === 'rain' || m.kind === 'drizzle' || m.kind === 'storm' || m.kind === 'snow';
  if (wet) {
    const shaft = night(m.kind === 'snow' ? mix(EC.shaft, EC.deck, 0.5) : EC.shaft);
    const lean = way * clamp(m.wind / 60) * 0.09;
    const foot = L.Y(GRAVEL.y0 - 0.02);
    const head = y1 - soft * 0.4;
    const sg = ctx.createLinearGradient(0, head, 0, foot);
    const strength = m.kind === 'drizzle' ? 0.08 : m.kind === 'storm' ? 0.17 : 0.13;
    sg.addColorStop(0, css(shaft, strength));
    sg.addColorStop(0.55, css(shaft, strength * 0.7));
    sg.addColorStop(1, css(shaft, 0));
    ctx.fillStyle = sg;
    for (let i = 0; i < 5; i++) {
      const x = wrap(hh(i, 140) + drift * (1.6 + 0.8 * hh(i, 141))) * 1.4 - 0.2;
      const w = 0.06 + 0.1 * hh(i, 142);
      // three thinner veils inside one another, so a shaft has no edge
      for (const inset of [0, 0.18, 0.36]) {
        ctx.beginPath();
        ctx.moveTo(L.X(x + w * inset), head);
        ctx.lineTo(L.X(x + w * (1 - inset)), head);
        ctx.lineTo(L.X(x + w * (0.8 - inset * 0.7) + lean), foot);
        ctx.lineTo(L.X(x + w * (0.1 + inset * 0.7) + lean), foot);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  // torn scud under the base, nearer and quicker, in front of the moraine
  for (let i = 0; i < 7; i++) {
    const x = L.ox + L.w * (wrap(hh(i, 143) + drift * (2.2 + hh(i, 144))) * 1.4 - 0.2);
    const y = L.Y(edge + 0.02 + 0.045 * hh(i, 145)) + 0.004 * L.h * Math.sin(nowMs / 2300 + i * 1.7);
    puff(ctx, x, y, L.w * (0.05 + 0.05 * hh(i, 146)), night(mix(EC.deck, EC.deckDark, 0.3)), 0.34 + 0.2 * hh(i, 147));
  }
  // and a mist lying on the far shore
  const my = L.Y(SHORE);
  const mg = ctx.createLinearGradient(0, my - 0.03 * L.h, 0, my + 0.015 * L.h);
  mg.addColorStop(0, css(col, 0));
  mg.addColorStop(0.7, css(col, 0.2));
  mg.addColorStop(1, css(col, 0));
  ctx.fillStyle = mg;
  ctx.fillRect(L.ox, my - 0.03 * L.h, L.w, 0.045 * L.h);
}
