// The near shore: gravel, one rock with a hiker on it by day, a few shrubs that
// turn with the season and lean with the wind, headlamps before dawn, one
// bivouac light on the wall at night, and a condor circling the summit on a clear day.
import { LAMP_THRESHOLD, clamp } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { EL_CHALTEN as EC } from './palette.js';
import { shrubTone, headlampCount } from './massif.js';
import { GRAVEL, ROCK, LAMPS, BIVOUAC, SUMMIT } from './scene.js';

const wrapOne = (x) => x - Math.floor(x);

export function drawShore(ctx, L, phase, tint, plates, nowMs, m, minutes) {
  const sh = plates.shore;
  // gravel, with its uneven top edge, snow-dusted in winter
  const gravel = mix(EC.gravelDay, EC.gravelNight, m.n);
  ctx.beginPath();
  ctx.moveTo(L.X(0), L.Y(1));
  for (const [x, y] of sh.edge) ctx.lineTo(L.X(x), L.Y(y));
  ctx.lineTo(L.X(1), L.Y(1));
  ctx.closePath();
  ctx.fillStyle = css(gravel);
  ctx.fill();
  for (const p of sh.pebbles) {
    ctx.fillStyle = css(mix(mix(EC.moraineShade, EC.gravelDay, p.shade), EC.gravelNight, m.n * 0.85), 0.8);
    ctx.fillRect(L.X(p.x), L.Y(p.y), Math.max(1, p.r * L.w), Math.max(1, p.r * L.w * 0.7));
  }
  if (m.frozen || m.fresh) {
    ctx.fillStyle = css(mix(EC.snow, EC.snowNight, m.n), m.frozen ? 0.6 : 0.3);
    ctx.fillRect(L.ox, L.Y(GRAVEL.y0 + 0.012), L.w, L.h * (1 - GRAVEL.y0));
  }

  // the rock
  const rock = mix(EC.rock, EC.rockNight, m.n);
  ctx.beginPath();
  ctx.moveTo(L.X(ROCK.x0), L.Y(ROCK.y + ROCK.h));
  ctx.lineTo(L.X(ROCK.x0 + 0.02), L.Y(ROCK.y + 0.006));
  ctx.lineTo(L.X(ROCK.x0 + 0.06), L.Y(ROCK.y));
  ctx.lineTo(L.X(ROCK.x1 - 0.03), L.Y(ROCK.y + 0.004));
  ctx.lineTo(L.X(ROCK.x1), L.Y(ROCK.y + ROCK.h));
  ctx.closePath();
  ctx.fillStyle = css(rock);
  ctx.fill();

  // shrubs: lean with the wind, red in autumn (deepest in April), white in winter
  const set = EC.shrubs[m.season] || EC.shrubs.summer;
  const lean = m.side * clamp(m.wind / 80) * 0.012;
  for (const s of sh.shrubs) {
    let col = set[s.k % set.length];
    if (m.season === 'autumn') col = mix(EC.shrubs.summer[0], col, shrubTone(m.month));
    col = mix(col, EC.gravelNight, m.n * 0.85);
    ctx.fillStyle = css(col);
    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      ctx.arc(L.X(s.x + (j - 1) * s.r * 0.8 + lean * (j / 2)), L.Y(s.y - j * 0.002), s.r * L.w * (1 - j * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // the hiker, by day
  const hikerAlpha = clamp((tint.light - 0.2) * 5);
  const hiker = hikerAlpha > 0.02;
  if (hiker) {
    const hx = L.X((ROCK.x0 + ROCK.x1) / 2);
    const hy = L.Y(ROCK.y + 0.002);
    ctx.fillStyle = css(EC.hikerPack, hikerAlpha);
    ctx.fillRect(hx - 2, hy - 4, 4, 4);
    ctx.fillStyle = css(EC.hikerCoat, hikerAlpha);
    ctx.fillRect(hx - 2, hy - 9, 4, 5);
    ctx.fillRect(hx - 1.5, hy - 12, 3, 3);
  }

  // headlamps on the shore in the last ninety minutes before sunrise
  const lamps = headlampCount(minutes);
  for (let i = 0; i < lamps; i++) {
    const f = 0.75 + 0.25 * Math.sin(nowMs / 600 + i * 2.3);
    const [x, y] = LAMPS[i];
    glow(ctx, L.X(x), L.Y(y), 9, EC.headlamp, 0.5 * f);
    ctx.fillStyle = css(EC.headlamp, f);
    ctx.fillRect(L.X(x) - 1.5, L.Y(y) - 1.5, 3, 3);
  }

  // one bivouac light on the wall at night
  // (not under a cap or a hidden peak: the deck and its puffs would cover it)
  if (tint.light < LAMP_THRESHOLD && (m.band === 'clear' || m.band === 'smoking')) {
    glow(ctx, L.X(BIVOUAC.x), L.Y(BIVOUAC.y), 6, EC.bivouac, 0.45);
    ctx.fillStyle = css(EC.bivouac);
    ctx.fillRect(L.X(BIVOUAC.x) - 1, L.Y(BIVOUAC.y) - 1, 2, 2);
  }

  // a condor circling beside the summit on a clear day
  const condor = tint.light > 0.5 && m.band === 'clear';
  if (condor) {
    const a = wrapOne(nowMs / 120000) * Math.PI * 2;
    const x = L.X(SUMMIT.x + 0.1 * Math.cos(a));
    const y = L.Y(SUMMIT.y - 0.05 + 0.025 * Math.sin(a));
    ctx.strokeStyle = css(EC.condor, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.quadraticCurveTo(x - 3, y - 4, x, y);
    ctx.quadraticCurveTo(x + 3, y - 4, x + 6, y);
    ctx.stroke();
  }
  return { headlamps: lamps, hiker, condor };
}
