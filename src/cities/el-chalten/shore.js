// The near shore: a stony lip of moraine with boulders, one rock with a hiker on it by day, visitors who walk
// in, sit or stand facing the wall and walk out again (tourists.js says who is
// where), a few shrubs that turn with the season and lean with the wind,
// headlamps before dawn, one
// bivouac light on the wall at night, and a condor circling the summit on a clear day.
import { LAMP_THRESHOLD, clamp, wrap } from '../../clock.js';
import { css, mix, glow } from '../../look/index.js';
import { EL_CHALTEN as EC } from './palette.js';
import { shrubTone, headlampCount } from './massif.js';
import { GRAVEL, ROCK, LAMPS, BIVOUAC, SUMMIT, snowTone } from './scene.js';
import { inView } from './tourists.js';

const TURN = Math.PI * 2;

function pill(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
  ctx.fill();
}

// What a figure wears: the hiker keeps the red coat, a visitor's is picked by the visit.
function outfit(f) {
  if (f.id === 'hiker') return { coat: EC.hikerCoat, hat: EC.hikerCoat, pack: EC.hikerPack, skin: EC.skin[0], worn: true };
  const k = f.look;
  return {
    coat: EC.coats[k % EC.coats.length],
    hat: EC.hats[(k >> 3) % EC.hats.length],
    pack: k % 5 === 0 ? null : EC.packs[(k >> 1) % EC.packs.length],
    skin: EC.skin[(k >> 2) % EC.skin.length],
    worn: f.rock || k % 2 === 0,
  };
}

// One person, feet (or seat) at the figure's spot. Seated, they face the wall and
// we see their back; on their feet we see them side on, walking by the ground
// they cover or standing turned to the summit. Nearer figures are a little larger.
function drawFigure(ctx, L, f, m, lit) {
  const u = Math.max(1, L.w / 390) * (0.94 + clamp((f.y - 0.695) / 0.03) * 0.2);
  const x = L.X(f.x);
  const y = L.Y(f.y);
  const o = outfit(f);
  const ink = (c) => css(mix(c, EC.gravelNight, m.n * 0.82));
  const sitting = f.pose === 'sit';
  ctx.fillStyle = css(EC.moraineShade, 0.28 * (1 - m.n));
  ctx.beginPath();
  ctx.ellipse(x, y + 0.3 * u, (sitting ? 3.6 : 2.6) * u, 0.9 * u, 0, 0, TURN);
  ctx.fill();
  if (sitting) {
    ctx.fillStyle = ink(EC.trousers);
    pill(ctx, x - 2.7 * u, y - 1.8 * u, 5.4 * u, 1.8 * u, 0.9 * u);
    if (o.pack && !o.worn) {
      ctx.fillStyle = ink(o.pack);
      pill(ctx, x + 3.1 * u, y - 4.2 * u, 2.6 * u, 4.2 * u, 1 * u);
    }
    ctx.fillStyle = ink(o.coat);
    pill(ctx, x - 2.1 * u, y - 6.7 * u, 4.2 * u, 5.5 * u, 1.6 * u);
    if (o.pack && o.worn) {
      ctx.fillStyle = ink(o.pack);
      pill(ctx, x - 1.4 * u, y - 5.7 * u, 2.8 * u, 3.8 * u, 1 * u);
    }
    ctx.fillStyle = ink(o.hat);
    ctx.beginPath();
    ctx.arc(x, y - 7.9 * u, 1.6 * u, 0, TURN);
    ctx.fill();
    return;
  }
  const walk = f.pose === 'walk';
  const dir = walk ? f.dir : f.x < SUMMIT.x ? 1 : -1;
  const a = f.step * TURN;
  const sw = walk ? Math.sin(a) : 0;
  const hipY = y - 5.6 * u;
  // legs: the stride follows the ground covered, the forward foot lifts
  ctx.strokeStyle = ink(EC.trousers);
  ctx.lineWidth = 1.5 * u;
  for (const side of [1, -1]) {
    const fx = walk ? x + side * sw * 2.2 * u : x + side * 0.9 * u;
    const fy = y - (walk ? Math.max(0, side * Math.cos(a)) * 0.9 * u : 0) - 0.6 * u;
    ctx.beginPath();
    ctx.moveTo(x, hipY);
    ctx.lineTo(fx, fy);
    ctx.stroke();
  }
  if (o.pack) {
    ctx.fillStyle = ink(o.pack);
    pill(ctx, x - dir * 2.7 * u - 1.2 * u, y - 10.7 * u, 2.4 * u, 4.6 * u, 1 * u);
  }
  ctx.fillStyle = ink(o.coat);
  pill(ctx, x - 1.9 * u, y - 11.1 * u, 3.8 * u, 6.2 * u, 1.5 * u);
  // the near arm swings against the legs; a visitor standing still may lift a camera
  const photo = !walk && f.id !== 'hiker' && f.look % 3 === 0;
  ctx.strokeStyle = ink(mix(o.coat, EC.trousers, 0.3));
  ctx.lineWidth = 1.2 * u;
  ctx.beginPath();
  ctx.moveTo(x + dir * 0.2 * u, y - 9.9 * u);
  if (photo) ctx.lineTo(x + dir * 2.5 * u, y - 11.6 * u);
  else ctx.lineTo(x + dir * 0.2 * u - sw * 1.9 * u, y - 6.3 * u);
  ctx.stroke();
  const hx = x + dir * 0.3 * u;
  const hy = y - 12.6 * u;
  ctx.fillStyle = ink(o.skin);
  ctx.beginPath();
  ctx.arc(hx, hy, 1.5 * u, 0, TURN);
  ctx.fill();
  ctx.fillStyle = ink(o.hat);
  ctx.beginPath();
  ctx.arc(hx, hy - 0.2 * u, 1.65 * u, Math.PI, TURN);
  ctx.fill();
  // on the way out in the dusk, a headlamp
  if (lit) {
    glow(ctx, hx + dir * 1.4 * u, hy, 7 * u, EC.headlamp, 0.45);
    ctx.fillStyle = css(EC.headlamp);
    ctx.fillRect(hx + dir * 1.1 * u, hy - 0.6 * u, 1.2 * u, 1.2 * u);
  }
}

// The condor's loop beside the summit: once round in CONDOR_LOOP_MS, a flat circle
// seen from below, so it is nearer (larger, lower) on one side and banks as it turns.
export const CONDOR_LOOP_MS = 26000;
export function condorAt(nowMs) {
  const a = wrap(nowMs / CONDOR_LOOP_MS) * TURN;
  return { x: SUMMIT.x + 0.085 + 0.1 * Math.cos(a), y: 0.05 + 0.022 * Math.sin(a), near: 0.5 + 0.5 * Math.sin(a), bank: -Math.sin(a + 0.6) * 0.45, a };
}

// The line where the water meets the stones: how far up the shore it has run, in
// shares of the body height, at a place `x` along it. A slow swash, never still by day.
export const LAP_MS = 3400;
export function lapAt(x, nowMs) {
  return 0.0035 * (0.5 + 0.5 * Math.sin((nowMs / LAP_MS) * TURN + x * 9)) + 0.0015 * Math.sin((nowMs / (LAP_MS * 0.37)) * TURN + x * 31);
}

export function drawShore(ctx, L, phase, tint, plates, nowMs, m, minutes, folk = []) {
  const sh = plates.shore;
  // the near ground: a stony lip of moraine, pale and wet at the waterline, darker
  // towards the viewer, snow-dusted in winter. A bright moon keeps it from going black.
  const dark = mix(EC.gravelNight, EC.gravelMoon, m.moon.k);
  const dusk = m.sil * 0.35 * (1 - m.n);
  const night = (c, k = 1) => mix(mix(c, EC.moraineDusk, dusk), dark, m.n * k);
  const path = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(L.X(x), L.Y(y)) : ctx.moveTo(L.X(x), L.Y(y))));
    ctx.closePath();
  };
  const ground = () => {
    ctx.beginPath();
    ctx.moveTo(L.X(0), L.Y(1));
    for (const [x, y] of sh.edge) ctx.lineTo(L.X(x), L.Y(y));
    ctx.lineTo(L.X(1), L.Y(1));
    ctx.closePath();
    ctx.fill();
  };
  const snowy = m.frozen ? 0.6 : m.fresh ? 0.3 : 0;
  // in the cold the gravel itself is greyed by trodden snow; the white lies in drifts
  const gravel = (c) => night(mix(c, mix(EC.snowShade, EC.gravelDay, 0.35), snowy * 0.75));
  const fall = ctx.createLinearGradient(0, L.Y(GRAVEL.y0), 0, L.Y(1));
  fall.addColorStop(0, css(gravel(mix(EC.gravelDay, EC.wetSand, 0.55))));
  fall.addColorStop(0.035, css(gravel(EC.gravelDay)));
  fall.addColorStop(0.12, css(gravel(mix(EC.gravelDay, EC.moraineDay, 0.4))));
  fall.addColorStop(0.3, css(gravel(mix(EC.gravelDay, EC.moraineDay, 0.7))));
  fall.addColorStop(1, css(gravel(mix(EC.moraineDay, EC.moraineShade, 0.6))));
  ctx.fillStyle = fall;
  ground();

  // the water lapping at the stones: a thin bright line that runs up the shore and
  // falls back, and the wet it leaves; still on ice
  if (!m.frozen) {
    const up = sh.edge.map(([x, y]) => [x, y - 0.003 + lapAt(x, nowMs)]);
    ctx.fillStyle = css(night(mix(EC.lakeTurquoise, EC.lakeGrey, 0.4), 0.9), 0.55);
    ctx.beginPath();
    ctx.moveTo(L.X(0), L.Y(GRAVEL.y0 - 0.006));
    ctx.lineTo(L.X(1), L.Y(GRAVEL.y0 - 0.006));
    for (let i = up.length - 1; i >= 0; i--) ctx.lineTo(L.X(up[i][0]), L.Y(up[i][1]));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = css(night(EC.lap, 0.8), 0.8 - 0.3 * m.n);
    ctx.lineWidth = Math.max(1, L.h * 0.003);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    up.forEach(([x, y], i) => (i ? ctx.lineTo(L.X(x), L.Y(y)) : ctx.moveTo(L.X(x), L.Y(y))));
    ctx.stroke();
  }

  for (const p of sh.pebbles) {
    ctx.fillStyle = css(night(mix(EC.moraineShade, EC.screeLight, p.shade), 0.85), 0.8);
    ctx.fillRect(L.X(p.x), L.Y(p.y), Math.max(1, p.r * L.w), Math.max(1, p.r * L.w * 0.7));
  }
  // snow on the ground: drifts with a lit top and a blue foot, the gravel showing between
  if (snowy) {
    for (const d of sh.drifts) {
      path(d.poly.map(([x, y]) => [x, y + 0.004]));
      ctx.fillStyle = css(snowTone(m, 1), 0.8 * (snowy / 0.6));
      ctx.fill();
      path(d.poly);
      ctx.fillStyle = css(snowTone(m, 0.35), 0.9 * (snowy / 0.6));
      ctx.fill();
    }
  }

  // the boulders, and the hiker's rock among them: a body, a face in its own shade
  // and an upper plane in the light (snow-capped in the cold)
  const snowTop = snowTone(m, 0.1);
  const block = (poly, lit, tone, shade = null) => {
    const stone = mix(EC.rock, EC.moraineShade, tone * 0.6);
    const body = night(stone);
    const top = mix(night(mix(stone, EC.screeLight, 0.5)), snowTop, snowy);
    const parts = [[poly, body], [lit, top]];
    if (shade) parts.splice(1, 0, [shade, night(mix(stone, EC.graniteDeep, 0.5))]);
    for (const [pts, col] of parts) {
      path(pts);
      ctx.fillStyle = css(col);
      ctx.fill();
    }
  };
  // each one stands on a little shadow of its own
  ctx.fillStyle = css(EC.graniteDeep, 0.22 * (1 - m.n));
  for (const b of sh.boulders) {
    const x0 = b.poly[0][0];
    const x1 = b.poly[5][0];
    ctx.beginPath();
    ctx.ellipse(L.X((x0 + x1) / 2 - (x1 - x0) * 0.08), L.Y(b.base), (L.w * (x1 - x0)) * 0.56, Math.max(1, L.w * (x1 - x0) * 0.07), 0, 0, TURN);
    ctx.fill();
  }
  for (const b of sh.boulders) block(b.poly, b.lit, b.tone, b.shade);
  const rockTop = [[ROCK.x0 + 0.02, ROCK.y + 0.006], [ROCK.x0 + 0.06, ROCK.y], [ROCK.x1 - 0.03, ROCK.y + 0.004]];
  block([[ROCK.x0, ROCK.y + ROCK.h], ...rockTop, [ROCK.x1, ROCK.y + ROCK.h]],
    [...rockTop, [ROCK.x1 - 0.05, ROCK.y + 0.015], [ROCK.x0 + 0.045, ROCK.y + 0.017]], 0,
    [[ROCK.x0, ROCK.y + ROCK.h], rockTop[0], [ROCK.x0 + 0.045, ROCK.y + 0.017], [ROCK.x0 + 0.03, ROCK.y + ROCK.h]]);

  // lenga scrub: low clumps that lean with the wind; green in summer, red and
  // orange in autumn (deepest in April), bare twigs under a little snow in winter
  const set = EC.shrubs[m.season] || EC.shrubs.summer;
  const lean = m.side * clamp(m.wind / 80) * 0.012;
  const bare = m.season === 'winter';
  for (const s of sh.shrubs) {
    let col = set[s.k % set.length];
    if (m.season === 'autumn') col = mix(EC.shrubs.summer[0], col, shrubTone(m.month));
    const leaf = (k) => css(night(mix(col, k > 0 ? EC.screeLight : EC.graniteDeep, Math.abs(k)), 0.85), bare ? 0.5 : 1);
    const u = s.r * L.w;
    // its shadow on the stones
    ctx.fillStyle = css(EC.graniteDeep, 0.25 * (1 - m.n));
    ctx.beginPath();
    ctx.ellipse(L.X(s.x), L.Y(s.y) + u * 0.1, u * 1.7, u * 0.28, 0, 0, TURN);
    ctx.fill();
    if (bare) {
      ctx.strokeStyle = css(night(EC.twig, 0.85), 0.9);
      ctx.lineWidth = Math.max(0.8, u * 0.09);
      for (const t of s.twigs) {
        ctx.beginPath();
        t.forEach(([dx, dy], i) => {
          const x = L.X(s.x + dx + lean * i * 0.5);
          const y = L.Y(s.y) + dy * L.w;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
    }
    for (const pass of [0, 1]) {
      for (const l of s.lobes) {
        if (bare) continue;
        const x = L.X(s.x + l.dx + lean * (pass ? 1 : 0.6));
        const y = L.Y(s.y) + l.dy * L.w;
        const r = l.r * L.w;
        ctx.fillStyle = pass ? leaf(l.top ? 0.22 : 0.08) : leaf(-0.3);
        ctx.beginPath();
        // the under-lobe is the clump's shaded skirt; the upper one, smaller and higher, takes the light
        if (pass) ctx.ellipse(x + r * 0.12, y - r * 0.28, r * 0.78, r * 0.5, 0, 0, TURN);
        else ctx.ellipse(x, y, r, r * 0.68, 0, 0, TURN);
        ctx.fill();
      }
    }
    if (snowy) {
      ctx.fillStyle = css(snowTop, 0.85);
      // a little snow caught in it: on the leaves, or round the foot of the bare twigs
      for (const l of s.lobes) {
        if (!l.top) continue;
        ctx.beginPath();
        if (bare) ctx.ellipse(L.X(s.x + l.dx * 0.8), L.Y(s.y) + u * 0.05, l.r * L.w * 0.7, l.r * L.w * 0.16, 0, 0, TURN);
        else ctx.ellipse(L.X(s.x + l.dx), L.Y(s.y) + l.dy * L.w - l.r * L.w * 0.5, l.r * L.w * 0.6, l.r * L.w * 0.2, 0, 0, TURN);
        ctx.fill();
      }
    }
  }

  // the people: the hiker and the visitors, the furthest first
  const lit = tint.light < LAMP_THRESHOLD;
  let hiker = false;
  let tourists = 0;
  ctx.save();
  ctx.lineCap = 'round';
  for (const f of folk) {
    if (!inView(f)) continue;
    if (f.id === 'hiker') hiker = true;
    else tourists += 1;
    drawFigure(ctx, L, f, m, lit);
  }
  ctx.restore();

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
    // it circles: nearer and larger on one side of the loop, banking into the turn,
    // wings held flat with the tips lifted
    const c = condorAt(nowMs);
    const u = Math.max(1, L.w / 340) * (0.8 + 0.5 * c.near);
    ctx.save();
    ctx.translate(L.X(c.x), L.Y(c.y));
    ctx.rotate(c.bank);
    ctx.strokeStyle = css(EC.condor, 0.9);
    ctx.lineWidth = 1.5 * u;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-7 * u, -1.6 * u);
    ctx.quadraticCurveTo(-4.5 * u, 0.2 * u, 0, 0.6 * u);
    ctx.quadraticCurveTo(4.5 * u, 0.2 * u, 7 * u, -1.6 * u);
    ctx.stroke();
    ctx.fillStyle = css(EC.condor, 0.9);
    ctx.beginPath();
    ctx.ellipse(0, 0.7 * u, 1.3 * u, 0.9 * u, 0, 0, TURN);
    ctx.fill();
    ctx.restore();
  }
  return { headlamps: lamps, hiker, tourists, condor };
}
