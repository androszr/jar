// The glass jar: one shape for every city. Its inside is the light source: the
// diorama is painted into a scratch canvas, measured for brightness, and the
// jar spills that light onto the table and into the bloom.
import { JAR, LABEL } from './jar-geometry.js';
import { localTimeText } from './placeclock.js';
import { offsetLabel } from './scrub.js';
import { placeName } from './cities/places.js';
import { formatTemp, gloom } from './weather.js';
import { drawJarSky, drawFog, drawSplashes, drawPrecipitation, drawRainOnGlass, drawFlurry } from './skyweather.js';
import { PALETTE, css, skyGradient, overcastSky, gloomWash, glow, spill, sheen, glassBody, glassHighlights, lid, label, mix, contactShadow, reflection, brights } from './look/index.js';

export { JAR };

export const QUALITY = 2; // interior pixels per logical px, at least
export const QUALITY_MAX = 4;

// The interior's pixels per logical px for a jar drawn at `devicePx` device
// pixels per logical px: never under QUALITY, in half steps (so the canvas
// keeps whole pixels), never over QUALITY_MAX. A lifted jar on a dense screen
// is painted at the size it is shown, not stretched up to it.
export function interiorQuality(devicePx) {
  if (!Number.isFinite(devicePx)) return QUALITY;
  return Math.min(QUALITY_MAX, Math.max(QUALITY, Math.ceil(devicePx * 2 - 1e-6) / 2));
}

// How far the diorama slides behind the glass for a viewer at `p` ({ x, y } in
// -1..1) plus a shake's slosh: { dx, dy, scale }. It is drawn a touch larger
// by exactly what the slide needs, so it never shows an edge; nothing at rest.
export const PARALLAX = { x: 5, y: 3 };
export function interiorShift(p, slosh = 0) {
  const dx = (p && Number.isFinite(p.x) ? p.x : 0) * PARALLAX.x + (Number.isFinite(slosh) ? slosh : 0);
  const dy = (p && Number.isFinite(p.y) ? p.y : 0) * PARALLAX.y;
  const body = bodyRect();
  return { dx, dy, scale: 1 + 2 * Math.max(Math.abs(dx) / body.w, Math.abs(dy) / body.h) };
}

// The lantern's flicker at `nowMs`: a few slow sines around 1, steady when `still`.
export function lanternFlicker(nowMs, seed = 0, still = false) {
  if (still || !Number.isFinite(nowMs)) return 1;
  return 1 + 0.09 * Math.sin(nowMs / 610 + seed) + 0.06 * Math.sin(nowMs / 233 + seed * 2.7) + 0.04 * Math.sin(nowMs / 97 + seed * 5.1);
}

// `preview` ({ offsetMin }, optional): when the moment is a scrubbed one ahead of
// now, the time line says so: "15:00 (+5 h)". `nowMs` is then the previewed moment.
export function labelLines(city, weather, nowMs, preview = null) {
  const time = localTimeText(nowMs, city.location.zone);
  const ahead = preview && Number.isFinite(preview.offsetMin) && preview.offsetMin > 0;
  const lines = [placeName(city).toUpperCase(), formatTemp(weather && weather.temperature), ahead ? `${time} (${offsetLabel(preview.offsetMin)})` : time];
  // A fourth line is the city's own (Nazare's swell, El Chalten's view of the peak), or none.
  const extra = typeof city.labelLine === 'function' ? city.labelLine(weather) : null;
  if (typeof extra === 'string' && extra) lines.push(extra);
  return lines;
}

// The body of the glass inside a jar rect of JAR proportions: below the lid.
export function bodyRect() {
  const top = Math.round(JAR.lid * 0.85);
  return { x: 0, y: top, w: JAR.w, h: JAR.h - top };
}

// Mean luminance (0..1) and colour of an interior canvas, from a 16x16 downsample.
export function measure(scratch, interior) {
  const sctx = scratch.smallCtx;
  sctx.clearRect(0, 0, 16, 16);
  sctx.drawImage(interior, 0, 0, 16, 16);
  const d = sctx.getImageData(0, 0, 16, 16).data;
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1;
  }
  if (!n) return { lum: 0, colour: [0, 0, 0] };
  r /= n; g /= n; b /= n;
  return { lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, colour: [r, g, b] };
}

// Paint the diorama of `city` into `interior` (a canvas bodyRect() x its own
// pixels per logical px). `opts` = { reduced, dew, anchor, parallax ({ x, y } in
// -1..1), shake (from shakeAt, or null) }. Returns { scene, drift, moon }.
export function paintInterior(interior, city, phase, tint, weather, nowMs, plates, opts = {}) {
  const body = bodyRect();
  const q = interior.width / body.w;
  const ictx = interior.getContext('2d');
  ictx.setTransform(1, 0, 0, 1, 0, 0);
  ictx.clearRect(0, 0, interior.width, interior.height);
  ictx.save();
  ictx.scale(q, q);
  const local = { x: 0, y: 0, w: body.w, h: body.h };
  glassBody(ictx, local, JAR.neck);
  ictx.clip();
  skyGradient(ictx, local, tint);
  // a heavy sky is grey, whatever the hour
  const heavy = gloom(weather);
  overcastSky(ictx, local, heavy, tint.light);
  // the diorama stands behind the glass: it slides a little as the viewer moves, or as it is shaken
  const shake = opts.shake || null;
  const shift = interiorShift(opts.parallax, shake ? shake.slosh : 0);
  ictx.save();
  if (shift.scale !== 1) {
    ictx.translate(local.w / 2 + shift.dx, local.h / 2 + shift.dy);
    ictx.scale(shift.scale, shift.scale);
    ictx.translate(-local.w / 2, -local.h / 2);
  }
  const sky = drawJarSky(ictx, local, phase, tint, weather, nowMs, { ...opts, sun: !(city.sky && city.sky.sun === false), backdrop: typeof city.backdrop === 'function' ? (c, r) => city.backdrop(c, r, phase, tint, weather) : null, strike: (city.sky && city.sky.strike) || null });
  const scene = city.paint(ictx, local, phase, tint, weather, plates, nowMs) ?? null;
  // rain lands on the city's open water as rings
  if (typeof city.water === 'function') drawSplashes(ictx, city.water(local, scene), weather, nowMs);
  // the near rain and snow fall in front of the city, not only in its sky
  drawPrecipitation(ictx, local, weather, nowMs, 'near');
  ictx.restore();
  // and the scene under a heavy sky loses its colour and some of its light
  gloomWash(ictx, local, heavy, tint.light);
  // on the glass itself: running beads in the rain, mist in a fog
  drawRainOnGlass(ictx, local, weather, nowMs, !!opts.reduced);
  drawFog(ictx, local, weather, nowMs);
  // the lantern: a warm glow from inside the jar, always on, never quite steady
  const flicker = lanternFlicker(nowMs, city.seed || 0, !!opts.reduced);
  glow(ictx, local.w * 0.5, local.h * 0.78, local.w * 0.55, tint.lantern, (0.04 + 0.1 * (1 - tint.light)) * flicker);
  if (shake) drawFlurry(ictx, local, shake.swirl, shake.ageMs, weather);
  ictx.restore();
  return { scene, drift: sky.wind, moon: sky.moon };
}

// Stand the jar of `city` at scene rect `rect` (JAR proportions, any scale,
// where it rests on the table) on `ctx`, from its painted `interior`.
// `light` is { lum, colour } from measure(); `lines` the label's lines;
// `scratch` = { tile, luma, bloomCtx }. `opts`:
//   lift       scene units the jar hangs above its resting place (its shadow and pool of light stay on the table)
//   tilt       radians it leans about its foot (a shake)
//   wake       0 dark .. 1 lit (the opening moment); default 1
//   glint      0..1, a pointer over the jar
//   shift      px the glass highlights slide (the viewer moved)
//   bloomGain  0..1 share of its bloom (a jar behind the lifted one gives less)
//   neighbours [{ side: -1 | 1, colour, strength }] light from the jars beside it
export function placeJar(ctx, rect, city, interior, light, tint, lines, scratch, opts = {}) {
  const body = bodyRect();
  const { lum, colour } = light;
  const k = rect.w / JAR.w;
  const wake = Number.isFinite(opts.wake) ? Math.max(0, Math.min(1, opts.wake)) : 1;
  const lift = (opts.lift || 0) / k; // in the jar's own units
  const off = Math.min(1, lift / 30); // 0 standing .. 1 well clear of the table
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.scale(k, k);

  // the shadow shrinks and thins as the jar leaves the table
  contactShadow(ctx, JAR.w / 2, JAR.h + 2, 60 * (1 - 0.3 * off), 210 * (1 - 0.3 * off), 0.09, 0.5 * (1 - 0.45 * off));
  // the pool of light on the table, under the foot
  const pool = mix(tint.spill, colour, 0.35);
  const strength = (0.3 + 0.7 * Math.min(1, lum * 1.6)) * wake * (1 - 0.35 * off);
  spill(ctx, { x: -70, y: JAR.h - 46, w: JAR.w + 140, h: 110 }, pool, strength * 0.85);
  reflection(ctx, JAR.w / 2, JAR.h + 2, 240, 118, pool, 0.1 * wake * (1 - off));

  const pose = (c) => {
    c.translate(0, -lift);
    if (opts.tilt) {
      c.translate(JAR.w / 2, JAR.h);
      c.rotate(opts.tilt);
      c.translate(-JAR.w / 2, -JAR.h);
    }
  };
  pose(ctx);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(interior, body.x, body.y, body.w, body.h);
  if (wake < 1) {
    // not lit yet: the diorama is there, in the dark
    glassBody(ctx, body, JAR.neck);
    ctx.fillStyle = css(PALETTE.shadow, 0.86 * (1 - wake));
    ctx.fill();
  }
  // the jars beside it lay their colour along the side that faces them
  for (const n of opts.neighbours || []) {
    if (!(n.strength > 0)) continue;
    ctx.save();
    glassBody(ctx, body, JAR.neck);
    ctx.clip();
    sheen(ctx, n.side < 0 ? body.x : body.x + body.w, body.y + body.h * 0.55, 46, body.h * 0.5, n.colour, Math.min(0.5, n.strength));
    ctx.restore();
  }
  glassHighlights(ctx, { x: body.x, y: body.y, w: body.w, h: body.h }, JAR.neck, { shift: opts.shift || 0, glint: opts.glint || 0 });
  const lw = JAR.w * (1 - 2 * JAR.neck) + 12;
  lid(ctx, { x: (JAR.w - lw) / 2, y: 0, w: lw, h: JAR.lid }, city.lid);
  label(ctx, LABEL, lines);
  ctx.restore();

  // feed the bloom source (the caller has set its transform to match ctx's):
  // only what is bright in the jar, not the whole picture
  const gain = (Number.isFinite(opts.bloomGain) ? opts.bloomGain : 1) * wake;
  if (scratch.bloomCtx && gain > 0) {
    const b = scratch.bloomCtx;
    b.save();
    b.translate(rect.x, rect.y);
    b.scale(k, k);
    pose(b);
    b.globalAlpha = Math.min(1, (0.55 + 0.45 * Math.min(1, lum * 1.4)) * gain);
    b.drawImage(scratch.tile && scratch.luma ? brights(scratch.tile, interior, scratch.luma) : interior, body.x, body.y, body.w, body.h);
    b.restore();
  }
  return { foot: { x: rect.x + rect.w / 2, y: rect.y + rect.h } };
}
