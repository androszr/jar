// The shed: dark plank walls, a window, a back shelf with pots and the potting
// table. The static art is drawn once per size and tint bucket into an
// offscreen canvas; the window sky and the light it casts are drawn live.
import { isNight, moonPos } from './clock.js';
import { moonPhase, moonGlow } from './moon.js';
import { SCENE } from './framing.js';
import { hash2 } from './skyweather.js';
import { PALETTE, css, plank, skyGradient, glow, vignette, moonDisc, lampWash, sheen, lightPatch, curtain, backShelf, tableBoards, tableFront } from './look/index.js';

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
  // the unseen lamp's wash goes on before the pane is cut, so the sky is never tinted
  lampWash(ctx, lit);
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
  curtain(ctx, WINDOW, FRAME, lit);

  // back shelf with its drawn pots
  backShelf(ctx, lit);

  // the potting table: top, seams, sheen and front edge
  tableBoards(ctx, 0, TABLE_Y, SCENE.w, 940 - TABLE_Y, lit);
  ctx.fillStyle = css(PALETTE.seam, 0.26);
  for (let i = 1; i < 6; i++) ctx.fillRect(0, TABLE_Y + i * 44, SCENE.w, 1.5);
  sheen(ctx, 800, 770, 820, 150, PALETTE.lamp, 0.05 + 0.08 * (1 - lit));
  tableFront(ctx, 0, 940, SCENE.w, SCENE.h - 940);
  return canvas;
}

// The sky seen through the window panes.
export function drawWindowSky(ctx, tint, phase, nowMs) {
  skyGradient(ctx, WINDOW, tint);
  if (phase !== undefined && isNight(phase)) {
    const mp = moonPos(phase);
    if (mp.alt > 0) {
      // 0.32: the moon keeps clear of the curtain at the pane's left
      const mx = WINDOW.x + WINDOW.w * Math.max(0.32, Math.min(0.8, (mp.x - 400) / 1000));
      const my = WINDOW.y + WINDOW.h * (0.42 - 0.26 * mp.alt);
      const moon = moonPhase(nowMs);
      glow(ctx, mx, my, 60, PALETTE.moon, 0.5 * moonGlow(moon.illumination));
      moonDisc(ctx, mx, my, 14, moon);
    }
  }
}

// Compose the shed under the current camera transform of `ctx`; `view` is
// { w, h } in device px, used for the vignette once the transform is reset.
export function drawShed(ctx, art, tint, view, phase, nowMs) {
  ctx.save();
  drawWindowSky(ctx, tint, phase, nowMs);
  ctx.drawImage(art, 0, 0, SCENE.w, SCENE.h);
  // the window's light falls across the table as a pale slanting patch, fading towards the front
  lightPatch(
    ctx,
    [[WINDOW.x + 20, TABLE_Y], [WINDOW.x + WINDOW.w - 20, TABLE_Y], [WINDOW.x + WINDOW.w + 180, 940], [WINDOW.x - 60, 940]],
    tint.skyLow,
    0.1 * tint.ambient + 0.02,
    TABLE_Y,
    940,
  );
  glow(ctx, WINDOW.x + WINDOW.w / 2, WINDOW.y + WINDOW.h / 2, 420, tint.skyLow, 0.18 * tint.ambient);
  ctx.restore();
  if (view) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    vignette(ctx, view.w, view.h);
    ctx.restore();
  }
}
