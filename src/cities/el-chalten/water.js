// The lake of Laguna de los Tres: turquoise, greyer under cloud, a mirror of
// the wall in still air (red at sunrise), ripples as the wind rises, white and
// mirror-less when it is frozen.
import { clamp, wrap } from '../../clock.js';
import { css, mix } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { EL_CHALTEN as EC } from './palette.js';
import { SEED, SHORE } from './scene.js';

// `reflect()` draws the wall, glacier and moraine in the jar's own coordinates;
// it is called once, flipped about the far shore and squashed, when the water mirrors.
export function drawLake(ctx, L, phase, tint, plates, nowMs, m, reflect) {
  const y0 = L.Y(SHORE);
  const top = m.frozen
    ? mix(EC.lakeFrozen, EC.snowNight, m.n * 0.8)
    : mix(mix(mix(EC.lakeTurquoise, EC.lakeGrey, (m.cover / 100) * 0.55), tint.skyLow, 0.12), EC.lakeNight, m.n);
  const deep = m.frozen ? mix(top, EC.snowNight, 0.15) : mix(mix(EC.lakeDeep, EC.lakeGrey, (m.cover / 100) * 0.3), EC.lakeNight, m.n);
  const g = ctx.createLinearGradient(0, y0, 0, L.Y(1));
  g.addColorStop(0, css(top));
  g.addColorStop(1, css(deep));
  ctx.fillStyle = g;
  ctx.fillRect(L.ox, y0, L.w, L.oy + L.h - y0);

  if (m.mirror > 0 && typeof reflect === 'function') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.ox, y0, L.w, L.oy + L.h - y0);
    ctx.clip();
    ctx.translate(0, y0);
    ctx.scale(1, -0.62);
    ctx.translate(0, -y0);
    ctx.globalAlpha = 0.5 * m.mirror;
    reflect();
    ctx.restore();
  }

  // ripples drift with the wind, the more the stronger it blows
  const alpha = m.frozen ? 0 : 0.06 + 0.25 * clamp((m.wind - 10) / 40);
  if (alpha > 0.07) {
    const count = 10 + Math.round(m.wind * 0.6);
    ctx.strokeStyle = css(EC.ripple, alpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const x = wrap(hash2(i, SEED + 31) + m.side * m.wind * nowMs * 2e-7);
      const y = SHORE + 0.02 + 0.2 * hash2(i, SEED + 32);
      const len = 0.03 + 0.04 * hash2(i, SEED + 33);
      ctx.moveTo(L.X(x), L.Y(y));
      ctx.lineTo(L.X(x + len), L.Y(y));
    }
    ctx.stroke();
  }
  // the far shore's pale line
  ctx.strokeStyle = css(mix(EC.ripple, tint.skyLow, 0.3), 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(L.ox, y0);
  ctx.lineTo(L.ox + L.w, y0);
  ctx.stroke();
}
