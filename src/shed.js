// The shed: dark plank walls, a window, a back shelf with pots and the potting
// table. The static art is drawn once per size and tint bucket into an
// offscreen canvas; the window sky and the light it casts are drawn live.
import { isNight, moonPos } from './clock.js';
import { SCENE } from './framing.js';
import { hash2 } from './skyweather.js';
import { PALETTE, css, mix, plank, skyGradient, glow, vignette } from './look/index.js';

export const WINDOW = { x: 200, y: 120, w: 400, h: 360 };
export const TABLE_Y = 680;
const FRAME = 22;

// A bucket key: the art is rebuilt when this changes.
export function tintBucket(tint) {
  return Math.round(tint.ambient * 10);
}

// Draw the static shed into a fresh canvas `w` x `h` px (the scene scaled).
export function buildShedArt(w, h, tint, make = (cw, ch) => Object.assign(document.createElement('canvas'), { width: cw, height: ch })) {
  const canvas = make(w, h);
  const ctx = canvas.getContext('2d');
  ctx.scale(w / SCENE.w, h / SCENE.h);
  const lit = tint.ambient;

  // walls: vertical planks
  const pw = 100;
  for (let i = 0; i * pw < SCENE.w; i++) {
    plank(ctx, i * pw, 0, pw, TABLE_Y + 40, 0.15 + 0.35 * hash2(i, 21) + 0.2 * lit);
  }
  // window: cut the pane out, then the frame
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
  ctx.restore();
  ctx.fillStyle = css(PALETTE.frame);
  const { x, y, w: ww, h: wh } = WINDOW;
  ctx.fillRect(x - FRAME, y - FRAME, ww + 2 * FRAME, FRAME);
  ctx.fillRect(x - FRAME, y + wh, ww + 2 * FRAME, FRAME + 10);
  ctx.fillRect(x - FRAME, y - FRAME, FRAME, wh + 2 * FRAME);
  ctx.fillRect(x + ww, y - FRAME, FRAME, wh + 2 * FRAME);
  ctx.fillRect(x + ww / 2 - 6, y, 12, wh);
  ctx.fillRect(x, y + wh / 2 - 6, ww, 12);

  // back shelf with a few dark pots
  ctx.fillStyle = css(PALETTE.tableEdge);
  ctx.fillRect(980, 420, 520, 16);
  for (let i = 0; i < 5; i++) {
    const px = 1010 + i * 100;
    const ph = 46 + 30 * hash2(i, 22);
    ctx.fillStyle = css(PALETTE.pot);
    ctx.beginPath();
    ctx.moveTo(px, 420);
    ctx.lineTo(px + 60, 420);
    ctx.lineTo(px + 50, 420 - ph);
    ctx.lineTo(px + 10, 420 - ph);
    ctx.closePath();
    ctx.fill();
  }

  // the potting table: top and front edge
  const top = ctx.createLinearGradient(0, TABLE_Y, 0, 940);
  top.addColorStop(0, css(mix(PALETTE.tableEdge, PALETTE.tableTop, 0.4 + lit * 0.4)));
  top.addColorStop(1, css(PALETTE.tableTop));
  ctx.fillStyle = top;
  ctx.fillRect(0, TABLE_Y, SCENE.w, 940 - TABLE_Y);
  ctx.fillStyle = css(PALETTE.seam, 0.5);
  for (let i = 1; i < 6; i++) ctx.fillRect(0, TABLE_Y + i * 44, SCENE.w, 1.5);
  ctx.fillStyle = css(PALETTE.tableEdge);
  ctx.fillRect(0, 940, SCENE.w, SCENE.h - 940);
  return canvas;
}

// The sky seen through the window panes.
export function drawWindowSky(ctx, tint, phase) {
  skyGradient(ctx, WINDOW, tint);
  if (phase !== undefined && isNight(phase)) {
    const mp = moonPos(phase);
    if (mp.alt > 0) {
      const mx = WINDOW.x + WINDOW.w * Math.max(0.2, Math.min(0.8, (mp.x - 400) / 1000));
      const my = WINDOW.y + WINDOW.h * (0.42 - 0.26 * mp.alt);
      glow(ctx, mx, my, 60, PALETTE.moon, 0.5);
      ctx.fillStyle = css(PALETTE.moon);
      ctx.beginPath();
      ctx.arc(mx, my, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Compose the shed under the current camera transform of `ctx`; `view` is
// { w, h } in device px, used for the vignette once the transform is reset.
export function drawShed(ctx, art, tint, view, phase) {
  ctx.save();
  drawWindowSky(ctx, tint, phase);
  ctx.drawImage(art, 0, 0, SCENE.w, SCENE.h);
  // the window's light falls across the table as a pale slanting patch
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = css(tint.skyLow, 0.1 * tint.ambient + 0.02);
  ctx.beginPath();
  ctx.moveTo(WINDOW.x + 20, TABLE_Y);
  ctx.lineTo(WINDOW.x + WINDOW.w - 20, TABLE_Y);
  ctx.lineTo(WINDOW.x + WINDOW.w + 180, 940);
  ctx.lineTo(WINDOW.x - 60, 940);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  glow(ctx, WINDOW.x + WINDOW.w / 2, WINDOW.y + WINDOW.h / 2, 420, tint.skyLow, 0.18 * tint.ambient);
  ctx.restore();
  if (view) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    vignette(ctx, view.w, view.h);
    ctx.restore();
  }
}
