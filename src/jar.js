// The glass jar: one shape for every city. Its inside is the light source: the
// diorama is painted into a scratch canvas, measured for brightness, and the
// jar spills that light onto the table and into the bloom.
import { JAR } from './jar-geometry.js';
import { localTimeText } from './placeclock.js';
import { formatTemp } from './weather.js';
import { drawJarSky, drawFog } from './skyweather.js';
import { skyGradient, glow, spill, glassBody, glassHighlights, lid, label, mix } from './look/index.js';

export { JAR };

export const QUALITY = 2; // interior pixels per logical px

export function labelLines(city, weather, nowMs) {
  return [city.title.toUpperCase(), formatTemp(weather && weather.temperature), localTimeText(nowMs, city.location.zone)];
}

// The body of the glass inside a jar rect of JAR proportions: below the lid.
export function bodyRect() {
  const top = Math.round(JAR.lid * 0.85);
  return { x: 0, y: top, w: JAR.w, h: JAR.h - top };
}

// Mean luminance (0..1) and colour of the interior, from a 16x16 downsample.
function measure(scratch) {
  const s = scratch.small;
  const sctx = scratch.smallCtx;
  sctx.clearRect(0, 0, 16, 16);
  sctx.drawImage(scratch.interior, 0, 0, 16, 16);
  const d = sctx.getImageData(0, 0, 16, 16).data;
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1;
  }
  if (!n) return { lum: 0, colour: [0, 0, 0] };
  r /= n; g /= n; b /= n;
  return { lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, colour: [r, g, b], size: s.width };
}

// Paint jar `city` at scene rect `rect` (JAR proportions, any scale) onto
// `ctx`. `scratch` = { interior, small, smallCtx, bloomCtx } canvases made by
// the caller (the interior is bodyRect() x QUALITY). `opts` = { reduced, dew }.
export function paintJar(ctx, rect, city, phase, tint, weather, nowMs, plates, scratch, opts = {}) {
  const body = bodyRect();
  const ictx = scratch.interior.getContext('2d');
  ictx.setTransform(1, 0, 0, 1, 0, 0);
  ictx.clearRect(0, 0, scratch.interior.width, scratch.interior.height);
  ictx.save();
  ictx.scale(QUALITY, QUALITY);
  const local = { x: 0, y: 0, w: body.w, h: body.h };
  glassBody(ictx, local, JAR.neck);
  ictx.clip();
  skyGradient(ictx, local, tint);
  const sky = drawJarSky(ictx, local, phase, tint, weather, nowMs, opts);
  city.paint(ictx, local, phase, tint, weather, plates, nowMs);
  drawFog(ictx, local, weather, nowMs);
  // the lantern: a warm glow from inside the jar, always on
  glow(ictx, local.w * 0.5, local.h * 0.78, local.w * 0.55, tint.lantern, 0.04 + 0.1 * (1 - tint.light));
  ictx.restore();

  const { lum, colour } = measure(scratch);
  const k = rect.w / JAR.w;
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.scale(k, k);

  // the pool of light on the table, under the foot
  const strength = 0.3 + 0.7 * Math.min(1, lum * 1.6);
  spill(ctx, { x: -70, y: JAR.h - 46, w: JAR.w + 140, h: 110 }, mix(tint.spill, colour, 0.35), strength * 0.85);

  ctx.drawImage(scratch.interior, body.x, body.y, body.w, body.h);
  glassHighlights(ctx, { x: body.x, y: body.y, w: body.w, h: body.h }, JAR.neck);
  const lw = JAR.w * (1 - 2 * JAR.neck) + 12;
  lid(ctx, { x: (JAR.w - lw) / 2, y: 0, w: lw, h: JAR.lid }, city.lid);
  label(ctx, { x: JAR.w * 0.2, y: JAR.h - 104, w: JAR.w * 0.6, h: 80 }, labelLines(city, weather, nowMs));
  ctx.restore();

  // feed the bloom source (the caller has set its transform to match ctx's)
  if (scratch.bloomCtx) {
    const b = scratch.bloomCtx;
    b.save();
    b.translate(rect.x, rect.y);
    b.scale(k, k);
    b.globalAlpha = 0.35 + 0.65 * Math.min(1, lum * 1.4);
    b.drawImage(scratch.interior, body.x, body.y, body.w, body.h);
    b.restore();
  }
  return { lum, foot: { x: rect.x + rect.w / 2, y: rect.y + rect.h }, drift: sky.wind };
}

