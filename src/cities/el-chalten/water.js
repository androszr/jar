// The lake of Laguna de los Tres: turquoise, greyer under cloud, a mirror of
// the wall in still air (red at sunrise), ripples as the wind rises, white and
// mirror-less when it is frozen.
import { clamp, wrap } from '../../clock.js';
import { css, mix } from '../../look/index.js';
import { hash2 } from '../../skyweather.js';
import { EL_CHALTEN as EC } from './palette.js';
import { SEED, SHORE, GRAVEL } from './scene.js';

// How tall the mirrored wall stands in the water, as a share of the wall: it ends above the gravel.
export const MIRROR_SQUASH = 0.4;

// `reflect()` draws the wall, glacier and moraine in the jar's own coordinates;
// it is called once, flipped about the far shore and squashed, when the water mirrors.
export function drawLake(ctx, L, phase, tint, plates, nowMs, m, reflect) {
  const y0 = L.Y(SHORE);
  // the turquoise dulls under cloud, and goes grey-green when the peak is hidden
  const dull = m.band === 'hidden' ? 0.9 : 0.55;
  const top = m.frozen
    ? mix(EC.lakeFrozen, EC.snowNight, m.n * 0.8)
    : mix(mix(mix(EC.lakeTurquoise, EC.lakeGrey, (m.cover / 100) * dull), tint.skyLow, 0.12), EC.lakeNight, m.n);
  const deep = m.frozen
    ? mix(EC.lakeIce, EC.snowNight, m.n * 0.8)
    : mix(mix(EC.lakeDeep, EC.lakeGrey, (m.cover / 100) * (dull - 0.2)), EC.lakeNight, m.n);
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
    ctx.scale(1, -MIRROR_SQUASH);
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
      const y = SHORE + 0.02 + (GRAVEL.y0 - SHORE - 0.03) * hash2(i, SEED + 32);
      const len = 0.03 + 0.04 * hash2(i, SEED + 33);
      ctx.moveTo(L.X(x), L.Y(y));
      ctx.lineTo(L.X(x + len), L.Y(y));
    }
    ctx.stroke();
  }
  // the ice: wind-blown drifts of snow and a few dark cracks
  if (m.frozen) {
    const span = GRAVEL.y0 - SHORE - 0.03;
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(mix(EC.snow, EC.snowNight, m.n), 0.6);
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const x = hash2(i, SEED + 41);
      const y = SHORE + 0.02 + span * hash2(i, SEED + 42);
      ctx.moveTo(L.X(x), L.Y(y));
      ctx.lineTo(L.X(x + 0.05 + 0.09 * hash2(i, SEED + 43)), L.Y(y + 0.002));
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = css(mix(EC.iceCrack, EC.lakeNight, m.n * 0.7), 0.55);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const x = 0.08 + 0.84 * hash2(i, SEED + 44);
      const y = SHORE + 0.03 + span * hash2(i, SEED + 45);
      ctx.moveTo(L.X(x), L.Y(y));
      ctx.lineTo(L.X(x + 0.05), L.Y(y + 0.012));
      ctx.lineTo(L.X(x + 0.09), L.Y(y + 0.006));
    }
    ctx.stroke();
  }
  // the far shore: a thin band of mist where the rock meets the water, not a ruled line
  const band = 0.01 * L.h;
  const mist = mix(EC.ripple, tint.skyLow, 0.4);
  const fg = ctx.createLinearGradient(0, y0 - band, 0, y0 + band);
  fg.addColorStop(0, css(mist, 0));
  fg.addColorStop(0.5, css(mist, m.frozen ? 0.15 : 0.26 * (1 - m.n * 0.6)));
  fg.addColorStop(1, css(mist, 0));
  ctx.fillStyle = fg;
  ctx.fillRect(L.ox, y0 - band, L.w, 2 * band);
}
