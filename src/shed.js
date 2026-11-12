// The shed: dark plank walls, a window, a back shelf with pots and the potting
// table. The static art is drawn once per size and tint bucket into an
// offscreen canvas; the window sky and the light it casts are drawn live.
import { isNight, moonPos } from './clock.js';
import { moonPhase, moonGlow } from './moon.js';
import { SCENE } from './framing.js';
import { hash2 } from './skyweather.js';
import { PALETTE, css, mix, plank, skyGradient, glow, vignette, moonDisc, lampWash, sheen, lightPatch, curtain, backShelf, tableBoards, tableFront, motes, moth } from './look/index.js';

export const WINDOW = { x: 200, y: 120, w: 400, h: 360 };
export const TABLE_Y = 680;
const FRAME = 22;
// The shed runs on past the scene: the wall, the table and its front are drawn
// this far beyond every edge, so a screen wider or taller than the scene, or a
// camera that follows a lifted jar to the end of the row, never shows a bare page.
export const BLEED = { x: 480, y: 160 };
// The art is capped at this many pixels; a larger view takes a softer copy.
export const ART_PIXELS = 5.5e6;
export const artScale = (s) => Math.min(s, Math.sqrt(ART_PIXELS / ((SCENE.w + 2 * BLEED.x) * (SCENE.h + 2 * BLEED.y))));

// A bucket key: the art is rebuilt when this changes.
export function tintBucket(tint) {
  return Math.round(tint.ambient * 10);
}

// Draw the static shed into a fresh canvas: the scene `w` x `h` px, plus the
// bleed around it at the same scale (the canvas is larger than `w` x `h`).
export function buildShedArt(w, h, tint, make = (cw, ch) => Object.assign(document.createElement('canvas'), { width: cw, height: ch })) {
  const kx = w / SCENE.w;
  const ky = h / SCENE.h;
  const canvas = make(Math.round(w + 2 * BLEED.x * kx), Math.round(h + 2 * BLEED.y * ky));
  const ctx = canvas.getContext('2d');
  ctx.scale(kx, ky);
  ctx.translate(BLEED.x, BLEED.y);
  const lit = tint.ambient;
  const x0 = -BLEED.x;
  const fullW = SCENE.w + 2 * BLEED.x;

  // walls: vertical planks, on past both ends and up past the top
  const pw = 100;
  for (let i = Math.floor(x0 / pw); i * pw < SCENE.w + BLEED.x; i++) {
    plank(ctx, i * pw, -BLEED.y, pw, TABLE_Y + 40 + BLEED.y, 0.15 + 0.35 * hash2(i, 21) + 0.2 * lit);
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
  tableBoards(ctx, x0, TABLE_Y, fullW, 940 - TABLE_Y, lit);
  ctx.fillStyle = css(PALETTE.seam, 0.26);
  for (let i = 1; i < 6; i++) ctx.fillRect(x0, TABLE_Y + i * 44, fullW, 1.5);
  sheen(ctx, 800, 770, 820, 150, PALETTE.lamp, 0.05 + 0.08 * (1 - lit));
  tableFront(ctx, x0, 940, fullW, SCENE.h - 940);
  // under the scene's foot the front goes on in the colour it ended on
  ctx.fillStyle = css(mix(PALETTE.tableEdge, PALETTE.shadow, 0.45));
  ctx.fillRect(x0, SCENE.h, fullW, BLEED.y);
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
// `opts.reduced` stills the dust and keeps the moth away.
export function drawShed(ctx, art, tint, view, phase, nowMs, opts = {}) {
  ctx.save();
  // whatever lies beyond even the bleed is the dark of the room, never the bare page
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = css(mix(PALETTE.room, PALETTE.plankLight, 0.2 * tint.ambient));
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  drawWindowSky(ctx, tint, phase, nowMs);
  ctx.drawImage(art, -BLEED.x, -BLEED.y, SCENE.w + 2 * BLEED.x, SCENE.h + 2 * BLEED.y);
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
  // the room is never quite still: dust in the lamp's light, and a moth at it after dark
  motes(ctx, tint.ambient, nowMs, !!opts.reduced);
  moth(ctx, tint.ambient, nowMs, !!opts.reduced);
  ctx.restore();
  if (view) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    vignette(ctx, view.w, view.h);
    ctx.restore();
  }
}
