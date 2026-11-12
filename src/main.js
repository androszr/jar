// Boot, render loop and wiring: the potting table, the jars on it, the lift.
import { readOptions, sample, isNight, moonPos } from './clock.js';
import { moonPhase } from './moon.js';
import { placeGuess, realPhase } from './realclock.js';
import { therePhase, localDate, sunFraction, localTimeText, dayFraction } from './placeclock.js';
import { LOOK, PALETTE, CSS_VARS, css, mix, tint as lookTint, bloom, vignette, forecastCard, forecastCellRects, chalk, chalkWidth, glow, backdrop, backdropKept, grain, grainTile } from './look/index.js';
import { hintWording, hintSentence, initialHint, hintOnLift, hintAfter, hintAlpha, hintPose } from './hint.js';
import { CITIES } from './cities/index.js';
import { placeName } from './cities/places.js';
import { Shelf, shelfMetrics, frameDt } from './shelf.js';
import { fitScreen, SCENE } from './framing.js';
import { Lift, liftCamera, liftRise, LIFT_RISE, pressLowers, CREDIT_MARGIN } from './lift.js';
import { forecastPose, forecastExtent, liftExtent } from './forecast.js';
import { offsetLabel, previewWeather, clampScrub, clampPreview, dayPreviewMin, SCRUB_MAX_MIN } from './scrub.js';
import { ScrubBar } from './scrubbar.js';
import { formatTemp, forecastCells, upcomingRows, forecastSentence, sunTimesFor, tidesFor, tideSentence, flashIntensity, dewAmount, cloudAmount, cloudDrift } from './weather.js';
import { entryFor, jarSearch, tableSearch, leaveAction } from './address.js';
import { WeatherFeed } from './weatherfeed.js';
import { forecastAnnouncement } from './announce.js';
import { buildShedArt, drawShed, tintBucket, artScale, WINDOW, TABLE_Y, BLEED } from './shed.js';
import { paintInterior, placeJar, measure, labelLines, bodyRect, interiorQuality, QUALITY } from './jar.js';
import { shakeAt, SHAKE_MS } from './shake.js';
import { introLevels } from './intro.js';
import { FADE_MS, skyChanged, fadeAmount } from './fade.js';
import { JAR } from './jar-geometry.js';

const opts = readOptions(location.search);
const canvas = document.getElementById('view');
const backBtn = document.getElementById('back');
const liveEl = document.getElementById('announce');
const navEl = document.getElementById('shelfnav');
const scrubEl = document.getElementById('scrub');
// Under automation (the smoke check reads pixels back constantly) the canvas
// is made software-backed up front: Chromium otherwise flips it from GPU to
// CPU mid-run, and the two rasterise gradients a shade apart.
const ctx = canvas.getContext('2d', { willReadFrequently: navigator.webdriver === true });

for (const [k, v] of Object.entries(CSS_VARS)) document.documentElement.style.setProperty(k, v);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Under automation the page holds still unless told otherwise: no opening
// moment, no parallax from the pointer, no fade between readings. The smoke
// check drives each of them through its own seam on window.__jar.
const AUTOMATED = navigator.webdriver === true;
const coarsePointer = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const hintText = hintWording(coarsePointer); // read once at boot, never in a draw
const feed = new WeatherFeed({ now: () => nowMs(), visible: () => document.visibilityState === 'visible' });
const lift = new Lift(reduceMotion ? 0 : undefined);
const shelf = new Shelf(CITIES.length, shelfMetrics(SCENE.w));

const ANIMATED = new Set(['rain', 'drizzle', 'snow', 'storm', 'fog']);
const MIN_FRAME_MS = 45;
const CLOUD_TICK_MS = 250; // windy cloud redraws this often; calm cloud keeps the once-a-minute key
const ROOM_TICK_MS = 200; // the dust, the moth and the lanterns' flicker; none under reduced motion
const PLAY_MS = 20000; // the time-lapse runs the next 24 hours in this long
const HOVER_MS = 140;

let W = 0;
let H = 0;
let dpr = 1;
let view = 'table';
let pendingBack = false; // a history.back() is on its way
let focus = 0; // the jar the lift is on
let pinned = null;
let scrubMin = 0; // minutes ahead the lifted jar is previewed at; 0 is now
let lastKey = '';
let lastShedAmbient = 0; // the shed tint's ambient at the last render (test surface)
let lastDraw = 0;
let lastTick = null; // the previous animation frame's time, for the glide's dt
let artBuilds = 0;
let artKey = '';
let art = null;
let lastFrameMs = 0;
let labels = {};
let cadenceMs = 0; // the redraw tick the last render keyed on: the smallest positive of the weather's and each city's
let weatherCadence = 0; // 50 animated, 250 windy cloud, 0 otherwise
let cityCadences = {}; // city id -> ms the scene asks for (0 for a still one)
let scenes = {}; // city id -> what the scene reported painting
let drawn = {}; // city id -> { flash, dew, drift, moon } the last frame painted with
let lastForecast = null; // { cells, rect, sun, sunT, tides, dayT } of the card drawn last, or null
let cam = { cx: SCENE.w / 2, cy: SCENE.h / 2, scale: 1 };
let scratch = null;
// the room behind a fully lifted jar is kept (softened, in scratch.back) and
// repainted only when something in it changes or ROOM_BEHIND_MS has passed
const ROOM_BEHIND_MS = 1000;
let roomKey = '';
let behind = null; // what each jar painted when the room was last drawn
// a jar's own light (its mean brightness and colour) is read back from its
// picture, which makes the page wait for the graphics card: it moves slowly, so
// it is read every LIGHT_MS, the jars in turn, and at once when its sky changes
const LIGHT_MS = 240;
let lightKeys = [];
let lightSeen = [];
let plates = [];
let ready = false;
let hint = 'shown'; // the chalk hint: shown | fading | none, session memory only
// What the viewer is doing, held here and handed to the draw functions as plain
// numbers (so the same inputs always paint the same picture):
let hoverIdx = -1; // the jar under a fine pointer, or -1
const hoverAmt = CITIES.map(() => 0); // each jar's eased 0..1
let par = { x: 0, y: 0 }; // where the viewer stands, -1..1 each way, eased
let parTarget = { x: 0, y: 0 };
let shake = null; // { id, start } on the frame clock, while a jar is shaken
let intro = null; // the frame-clock moment the opening began, or null
let play = null; // { start } while the time-lapse runs
let fades = {}; // city id -> { from, start }: the reading being faded out
let lastFeed = {}; // city id -> the reading the last frame saw
let seenRevision = 0;
let roomCadence = 0;
let lights = {}; // city id -> { lum } measured from the last frame (test surface)
let quality = QUALITY; // the lifted jar's interior pixels per logical px, last frame
let selectedDay = -1; // the forecast cell the preview stands on, or -1
let grainArt = null;

const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const nowMs = () => (pinned !== null ? pinned : Date.now());
const previewMs = () => nowMs() + scrubMin * 60000;
const perf = () => performance.now();

function viewerAt(ms) {
  return placeGuess(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date(ms).getTimezoneOffset());
}

// The Open-Meteo credit link's left and bottom edges in CSS px (measured when the screen is fitted),
// and the slider row's height plus its inset from the foot: the lifted picture keeps clear of both.
let creditBox = null;
const SCRUB_ROW = 58;
let scrubReserve = SCRUB_ROW; // grows to the row's measured reach from the foot (a phone's bottom inset)
function measureScrub() {
  const row = document.getElementById('scrubrow');
  const reach = row && !row.hidden ? H - row.getBoundingClientRect().top : 0;
  const next = Math.max(SCRUB_ROW, Math.ceil(reach));
  if (next !== scrubReserve) { scrubReserve = next; lastKey = ''; }
}

function fit() {
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  const cr = document.getElementById('credit')?.getBoundingClientRect();
  creditBox = cr && cr.width > 0 ? { left: cr.left, bottom: cr.bottom } : null;
  measureScrub();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const f = fitScreen(W, H, shelf.centreX);
  shelf.setMetrics(shelfMetrics(f.slice.w));
  build();
  lastKey = '';
}

function build() {
  const body = bodyRect();
  const small = make(16, 16);
  roomKey = '';
  scratch = {
    interiors: CITIES.map(() => make(body.w * QUALITY, body.h * QUALITY)),
    hi: null, // the lifted jar's own interior, when the screen wants more than QUALITY
    fade: null, // the old sky while a new reading fades in
    tile: make(body.w, body.h), // what a jar hands the bloom
    luma: make(body.w, body.h), // its brightness alone
    back: make(Math.ceil(canvas.width / 4), Math.ceil(canvas.height / 4)), // the softened room behind a lifted jar
    small,
    smallCtx: small.getContext('2d', { willReadFrequently: true }),
    bloomCanvas: make(Math.ceil(canvas.width / 4), Math.ceil(canvas.height / 4)),
    bloomCtx: null,
  };
  if (!grainArt) grainArt = grainTile(make);
  scratch.bloomCtx = scratch.bloomCanvas.getContext('2d');
  plates = CITIES.map((c) => c.buildPlates(body.w, body.h));
  art = null;
  artKey = '';
}

function ensureArt(tn) {
  const s = artScale(Math.max(0.4, Math.min(1.5, fitScreen(W, H).scale * dpr)));
  const key = `${Math.round(s * 10)}|${tintBucket(tn)}`;
  if (key === artKey && art) return;
  art = buildShedArt(Math.round(SCENE.w * s), Math.round(SCENE.h * s), tn);
  artKey = key;
  artBuilds += 1;
}

function sceneToCss(sx, sy) {
  return { x: W / 2 + (sx - cam.cx) * cam.scale, y: H / 2 + (sy - cam.cy) * cam.scale };
}
function cssToScene(px, py) {
  return { x: cam.cx + (px - W / 2) / cam.scale, y: cam.cy + (py - H / 2) / cam.scale };
}

// The jar's rect `rise` scene units above where it rests.
function risen(i, rise) {
  const r = shelf.jarRect(i);
  return { x: r.x, y: r.y - rise, w: r.w, h: r.h };
}

// The camera at lift progress `e`: it glides to where the jar will hang
// (LIFT_RISE above the table), so the jar's own bounce shows against it.
function camAt(e) {
  const c0 = fitScreen(W, H, shelf.centreX);
  if (e > 0) {
    const jar = risen(focus, LIFT_RISE);
    const dview = { cx: c0.cx, cy: c0.cy, scale: c0.scale, viewH: H, viewW: W, credit: creditBox, core: forecastExtent(jar, c0.portrait), bottomReserve: scrubReserve + CREDIT_MARGIN };
    return liftCamera(e, jar, dview, liftExtent(jar, c0.portrait));
  }
  return { cx: c0.cx, cy: c0.cy, scale: c0.scale };
}

const currentCam = (t) => camAt(lift.progress(t));

// A scratch canvas of exactly w x h, kept between frames.
function sized(name, w, h) {
  const c = scratch[name];
  if (c && c.width === w && c.height === h) return c;
  scratch[name] = make(w, h);
  return scratch[name];
}

function render(force = false) {
  const t = perf();
  const ms = nowMs();
  const viewer = viewerAt(ms);
  const shedPhase = realPhase(ms, viewer);
  // Only the lifted jar travels: its moment is the previewed one, every other jar
  // and the shed stay on `ms`.
  const scrubbing = view === 'jar' && scrubMin > 0;
  const at = CITIES.map((c, i) => (scrubbing && i === focus ? previewMs() : ms));
  const phases = CITIES.map((c, i) => therePhase(at[i], c.location, viewer));
  const seen = (c, i, w) => (scrubbing && i === focus ? previewWeather(w, at[i], c.location.zone) : w);
  const weathers = CITIES.map((c, i) => seen(c, i, feed.get(c.id)));
  const preview = scrubbing ? { offsetMin: scrubMin } : null;
  // lightning and dew per jar: functions of the moment and the feed alone
  const flashes = CITIES.map((c, i) => flashIntensity(weathers[i].code, at[i], { reduced: reduceMotion }));
  const dews = CITIES.map((c, i) => dewAmount(feed.dewSince(c.id, at[i])));
  const animated = weathers.some((w) => ANIMATED.has(w.kind) && w.known);
  const windy = weathers.some((w) => w.known && cloudAmount(w.cloudCover, w.kind) > 0.05 && cloudDrift(w.windSpeed, w.windDir, CLOUD_TICK_MS) !== 0);
  weatherCadence = animated ? 50 : windy ? CLOUD_TICK_MS : 0;
  // a scene may ask for a tick of its own (a rolling sea); the page ticks at the smallest
  cityCadences = Object.fromEntries(CITIES.map((c, i) => [c.id, typeof c.cadenceMs === 'function' ? c.cadenceMs(weathers[i], { reduced: reduceMotion, nowMs: at[i] }) : 0]));
  roomCadence = reduceMotion ? 0 : ROOM_TICK_MS;
  const positive = [weatherCadence, roomCadence, ...Object.values(cityCadences)].filter((v) => v > 0);
  cadenceMs = positive.length ? Math.min(...positive) : 0;
  const minute = Math.floor(ms / 60000);
  const liftP = lift.progress(t); // settles lift.state first
  hint = hintAfter(hint, liftP, lift.state);
  const hintA = hintAlpha(hint, liftP);
  cam = camAt(liftP);
  // what the viewer set going, each read off the frame clock here and nowhere else
  const sh = shake ? shakeAt(t - shake.start, reduceMotion) : null;
  if (!sh) shake = null;
  const levels = intro !== null ? introLevels(t - intro, CITIES.length) : null;
  if (!levels) intro = null;
  const fadeE = CITIES.map((c) => {
    const f = fades[c.id];
    if (!f) return 1;
    const e = fadeAmount(t - f.start);
    if (e >= 1) delete fades[c.id];
    return e;
  });
  const key = [view, lift.state, Math.round(liftP * 1000), Math.round(shelf.pos * 1000), minute,
    feed.revision, feed.isStale(), W, H, Math.round(shedPhase * 2000), phases.map((p) => Math.round(p * 2000)).join(','),
    cam.scale.toFixed(3), cadenceMs ? Math.floor(ms / cadenceMs) : 0, scrubbing ? scrubMin : 0,
    flashes.map((f) => Math.round(f * 16)).join(','), dews.map((d) => Math.round(d * 32)).join(','), hint, Math.round(hintA * 64),
    sh ? Math.round(sh.ageMs / 16) : -1, levels ? Math.round((t - intro) / 16) : -1, fadeE.map((e) => Math.round(e * 100)).join(','),
    hoverAmt.map((h) => Math.round(h * 20)).join(','), Math.round(par.x * 300), Math.round(par.y * 300)].join('|');
  if (!force && key === lastKey) return false;
  lastKey = key;

  const shedTint = lookTint(sample(shedPhase));
  lastShedAmbient = shedTint.ambient;
  ensureArt(shedTint);

  // First every diorama is painted and measured, so each jar's light is known
  // before anything it falls on is drawn.
  const rise = liftRise(liftP);
  quality = liftP > 0 ? interiorQuality(dpr * camAt(1).scale * (shelf.m.w / JAR.w)) : QUALITY;
  const body = bodyRect();
  const tints = phases.map((p) => lookTint(sample(p)));
  // behind a fully lifted jar the room is soft and dim: it is repainted once a
  // second, or at once when anything in it changes, and reused in between
  const nextRoomKey = [focus, canvas.width, canvas.height, Math.round(shelf.pos * 1000), minute, feed.revision, feed.isStale(),
    Math.round(shedPhase * 2000), phases.map((p, i) => (i === focus ? 0 : Math.round(p * 2000))).join(','), Math.floor(t / ROOM_BEHIND_MS),
    flashes.map((f) => Math.round(f * 16)).join(','), levels ? 1 : 0, Object.keys(fades).filter((id) => id !== CITIES[focus].id).join(','), hint, Math.round(hintA * 64)].join('|');
  const reuse = !force && liftP === 1 && behind !== null && nextRoomKey === roomKey;
  roomKey = liftP === 1 ? nextRoomKey : '';
  const painted = CITIES.map((city, i) => {
    if (reuse && i !== focus) return behind[i];
    const target = i === focus && quality > QUALITY ? sized('hi', Math.round(body.w * quality), Math.round(body.h * quality)) : scratch.interiors[i];
    const o = { reduced: reduceMotion, dew: dews[i], anchor: feed.cloudAnchor(city.id), parallax: par, shake: sh && shake.id === city.id ? sh : null };
    const f = fades[city.id];
    const old = f ? sized('fade', target.width, target.height) : null;
    if (old) paintInterior(old, city, phases[i], tints[i], seen(city, i, f.from), at[i], plates[i], o);
    const p = paintInterior(target, city, phases[i], tints[i], weathers[i], at[i], plates[i], o);
    if (old) {
      const c2 = target.getContext('2d');
      c2.save();
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.globalAlpha = 1 - fadeE[i];
      c2.drawImage(old, 0, 0);
      c2.restore();
    }
    const lk = [force ? t : 0, feed.revision, Math.round(phases[i] * 2000), Math.round(at[i] / 60000), target.width, f ? Math.round(fadeE[i] * 100) : -1,
      levels ? 1 : 0, Math.floor((t + i * (LIGHT_MS / CITIES.length)) / LIGHT_MS), Math.round(flashes[i] * 16)].join('|');
    if (lightKeys[i] !== lk || !lightSeen[i]) {
      lightKeys[i] = lk;
      lightSeen[i] = measure(scratch, target);
    }
    return { canvas: target, ...p, ...lightSeen[i] };
  });
  behind = painted;
  const wakes = CITIES.map((c, i) => (levels ? levels.jars[i] : 1));
  const cast = painted.map((p, i) => mix(tints[i].spill, p.colour, 0.5));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const k = dpr * cam.scale;
  const tx = dpr * (W / 2 - cam.cx * cam.scale);
  const ty = dpr * (H / 2 - cam.cy * cam.scale);
  ctx.setTransform(k, 0, 0, k, tx, ty);
  scratch.bloomCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratch.bloomCtx.clearRect(0, 0, scratch.bloomCanvas.width, scratch.bloomCanvas.height);
  scratch.bloomCtx.setTransform(k / 4, 0, 0, k / 4, tx / 4, ty / 4);

  if (!reuse) {
    drawShed(ctx, art, shedTint, null, shedPhase, ms, { reduced: reduceMotion });
    // each jar throws its own colour on the wall behind it, and a storm's flash
    // lights the room; the sky in the pane is never tinted
    ctx.save();
    ctx.beginPath();
    ctx.rect(-BLEED.x, -BLEED.y, SCENE.w + 2 * BLEED.x, TABLE_Y + BLEED.y);
    ctx.rect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
    ctx.clip('evenodd');
    CITIES.forEach((city, i) => {
      const r = shelf.jarRect(i);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h * 0.45;
      glow(ctx, cx, cy, r.w * 1.05, cast[i], (0.05 + 0.17 * Math.min(1, painted[i].lum * 1.5)) * wakes[i]);
      if (flashes[i] > 0) glow(ctx, cx, cy, r.w * 2.6, PALETTE.flash, 0.2 * flashes[i] * wakes[i]);
    });
    ctx.restore();
    if (hintA > 0) {
      const hp = hintPose(fitScreen(W, H, shelf.centreX).cx);
      chalk(ctx, hintText, hp.x, hp.y, hp.size, hintA);
    }
  }
  let bloomStrength = 0;
  const nextLabels = {};
  const nextDrawn = {};
  const nextScenes = {};
  const nextLights = {};
  const stand = (i) => {
    const city = CITIES[i];
    const lifted = i === focus && liftP > 0;
    const neighbours = [-1, 1].filter((d) => i + d >= 0 && i + d < CITIES.length)
      .map((d) => ({ side: d, colour: cast[i + d], strength: 0.3 * painted[i + d].lum * wakes[i + d] }));
    placeJar(ctx, shelf.jarRect(i), city, painted[i].canvas, painted[i], tints[i], nextLabels[city.id], scratch, {
      lift: lifted ? rise : 0,
      tilt: sh && shake.id === city.id ? sh.tilt : 0,
      wake: wakes[i],
      glint: hoverAmt[i],
      shift: -par.x * 3,
      // a jar behind the lifted one gives up its bloom as the room softens
      bloomGain: lifted || liftP === 0 ? 1 : 1 - liftP,
      neighbours,
    });
  };
  CITIES.forEach((city, i) => {
    nextScenes[city.id] = painted[i].scene;
    nextDrawn[city.id] = { flash: flashes[i], dew: dews[i], drift: painted[i].drift, moon: painted[i].moon };
    nextLabels[city.id] = labelLines(city, weathers[i], at[i], i === focus ? preview : null);
    nextLights[city.id] = { lum: painted[i].lum };
    bloomStrength = Math.max(bloomStrength, tints[i].bloom);
  });
  // the jars left on the table first; the room behind a lifted jar then softens and dims
  if (!reuse) CITIES.forEach((city, i) => { if (!(i === focus && liftP > 0)) stand(i); });
  if (liftP > 0) {
    if (reuse) backdropKept(ctx, scratch.back);
    else backdrop(ctx, scratch.back, liftP);
    stand(focus);
  }
  labels = nextLabels;
  drawn = nextDrawn;
  scenes = nextScenes;
  lights = nextLights;
  // the forecast card of the lifted jar, riding the lift's own progress
  const jr = risen(focus, rise);
  const pose = forecastPose(jr, fitScreen(W, H, shelf.centreX).portrait, liftP);
  selectedDay = -1;
  if (pose) {
    const zone = CITIES[focus].location.zone;
    const todayHere = localDate(ms, zone);
    const cells = forecastCells(weathers[focus], todayHere);
    const sun = sunTimesFor(weathers[focus], todayHere);
    const sunT = sunFraction(at[focus], zone, sun);
    // the tide curve is today's: the dot follows the scrubbed moment while it is still today, else none
    const thatDay = localDate(at[focus], zone);
    const dayT = thatDay === todayHere ? dayFraction(at[focus], zone) : null;
    const tides = tidesFor(weathers[focus], todayHere);
    // a preview that has left today rings the day it stands on
    if (scrubbing && thatDay !== todayHere) selectedDay = upcomingRows(weathers[focus], todayHere).slice(0, 5).findIndex((r) => r.date === thatDay);
    ctx.save();
    // emerge from behind the glass: nothing of the card is drawn over the jar
    ctx.beginPath();
    ctx.rect(-1e5, -1e5, 2e5, 2e5);
    ctx.rect(jr.x, jr.y, jr.w, jr.h);
    ctx.clip('evenodd');
    ctx.globalAlpha = pose.alpha;
    forecastCard(ctx, pose.rect, cells, pose.layout, sun, sunT, tides, dayT, selectedDay);
    ctx.restore();
    lastForecast = { cells, rect: pose.rect, layout: pose.layout, sun, sunT, tides, dayT };
  } else {
    lastForecast = null;
  }
  bloom(scratch.bloomCanvas, ctx, bloomStrength);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // the opening moment: the room comes up out of the dark
  if (levels && levels.room < 1) {
    ctx.fillStyle = css(PALETTE.shadow, 0.88 * (1 - levels.room));
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // the vignette, over everything, in device px; then the grain
  vignette(ctx, canvas.width, canvas.height);
  grain(ctx, canvas.width, canvas.height, grainArt);
  lastFrameMs = perf() - t;
  return true;
}

// A reading that changes a city's sky fades in; `fade` false takes it at once.
function noteFeed(t, fade) {
  if (feed.revision !== seenRevision) {
    seenRevision = feed.revision;
    if (fade) {
      for (const c of CITIES) {
        const was = lastFeed[c.id];
        if (was && skyChanged(was, feed.get(c.id))) fades[c.id] = { from: was, start: t };
      }
    }
  }
  lastFeed = Object.fromEntries(CITIES.map((c) => [c.id, feed.get(c.id)]));
}

function frame() {
  const t = perf();
  if (pinned === null) feed.tick(Date.now());
  noteFeed(t, !reduceMotion && !AUTOMATED);
  const dt = frameDt(t, lastTick);
  shelf.step(dt);
  lastTick = t;
  // the eased inputs: the pointer over a jar, and where the viewer stands
  let easing = false;
  const step = reduceMotion ? 1 : Math.min(1, (dt * 1000) / HOVER_MS);
  hoverAmt.forEach((h, i) => {
    const want = i === hoverIdx && view === 'table' ? 1 : 0;
    if (h !== want) {
      hoverAmt[i] = Math.abs(want - h) <= step ? want : h + Math.sign(want - h) * step;
      easing = true;
    }
  });
  const follow = 1 - Math.exp(-dt * 7);
  for (const axis of ['x', 'y']) {
    const d = parTarget[axis] - par[axis];
    if (Math.abs(d) > 0.002) {
      par[axis] += d * follow;
      easing = true;
    } else if (d !== 0) par[axis] = parTarget[axis];
  }
  if (play) {
    const e = (t - play.start) / PLAY_MS;
    if (e >= 1.04 || view !== 'jar') stopPlay();
    else {
      // an hour at a time under reduced motion, minute by minute otherwise
      const min = Math.min(1, e) * SCRUB_MAX_MIN;
      setPreview(reduceMotion ? Math.floor(min / 60) * 60 : min);
    }
  }
  const busy = lift.moving || shelf.dragging || easing || !!shake || intro !== null || !!play || Object.keys(fades).length > 0;
  if (t - lastDraw >= MIN_FRAME_MS || busy) {
    if (render()) lastDraw = t;
  }
  syncChrome();
  syncAria();
  requestAnimationFrame(frame);
}

function syncChrome() {
  const lifted = view === 'jar';
  if (backBtn.hidden === lifted) backBtn.hidden = !lifted;
  const showNav = !lifted && CITIES.length > 1;
  if (navEl.hidden === showNav) navEl.hidden = !showNav;
  if (scrubRow.hidden === lifted) scrub.show(lifted);
  if (lifted) measureScrub();
  const playing = !!play;
  if ((playBtn.getAttribute('aria-pressed') === 'true') !== playing) {
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.textContent = playing ? 'stop' : 'play';
    playBtn.setAttribute('aria-label', playing ? 'stop the time-lapse' : 'play the next 24 hours');
  }
}

// The label is only canvas pixels, so the canvas's accessible name carries it.
let ariaText = '';
let spoken = null; // { id, text } of the lifted jar's spoken forecast last synced, null on the table
function syncAria() {
  const here = view === 'jar' ? feed.get(CITIES[focus].id) : null;
  const todayHere = view === 'jar' ? localDate(nowMs(), CITIES[focus].location.zone) : null;
  const cells = view === 'jar' ? forecastCells(here, todayHere) : null;
  const sun = view === 'jar' ? sunTimesFor(here, todayHere) : null;
  const sentence = cells ? forecastSentence(cells) : '';
  const tideText = view === 'jar' ? tideSentence(tidesFor(here, todayHere)) : '';
  const days = (sentence ? ` ${sentence}` : '') + (sun ? ` Sunrise ${sun.sunrise}, sunset ${sun.sunset}.` : '') + (tideText ? ` ${tideText}` : '');
  const c = CITIES[focus];
  const l = labels[c.id];
  const facts = l ? `${placeName(c)}, ${l[1]}, ${l[2]} local time${l.length === 4 ? `, ${c.location.sea ? 'swell ' : ''}${l[3]}` : ''}` : placeName(c);
  let moonText = '';
  if (view === 'jar') {
    const at = scrubMin > 0 ? previewMs() : nowMs();
    const ph = therePhase(at, c.location, viewerAt(at));
    if (isNight(ph) && moonPos(ph).alt > 0) moonText = ` A ${moonPhase(at).name} moon.`;
  }
  const next = view === 'jar' ? { id: c.id, text: days.trim(), rev: feed.revision } : null;
  const say = forecastAnnouncement(spoken, next);
  spoken = next;
  if (say !== null) liveEl.textContent = say;
  else if (!next && liveEl.textContent) liveEl.textContent = '';
  syncValueText();
  const text = view === 'jar'
    ? `${view === 'jar' && scrubMin > 0 ? `Previewing ${offsetLabel(scrubMin)}: ` : ''}${facts}. The jar is lifted.${moonText}${days} Press Escape to put it back on the table.`
    : `A potting table with a glass jar of ${facts}. Press Enter to lift the jar.${hint !== 'none' ? ` ${hintSentence(hintText)}` : ''}`;
  if (text !== ariaText) {
    ariaText = text;
    canvas.setAttribute('aria-label', text);
  }
}

function setTitle() {
  document.title = view === 'jar' ? `${placeName(CITIES[focus])}, in a jar` : 'Jars';
}

// The slider's spoken value: offset, the previewed clock time and temperature,
// all taken from the previewed moment itself (never from the throttled draw).
function syncValueText() {
  let text = 'now';
  if (view === 'jar' && scrubMin > 0) {
    const c = CITIES[focus];
    const w = previewWeather(feed.get(c.id), previewMs(), c.location.zone);
    text = `${offsetLabel(scrubMin)}, ${localTimeText(previewMs(), c.location.zone)}, ${formatTemp(w.temperature)}`;
  }
  if (scrubEl.getAttribute('aria-valuetext') !== text) scrub.setValueText(text);
}

function setScrub(min) {
  scrubMin = clampScrub(min);
  scrub.setValue(scrubMin);
  syncValueText();
  lastKey = '';
}

// A preview the slider cannot reach by itself: any minute up to five days ahead
// (the time-lapse's sweep, a day pressed on the card). The thumb goes as far as it can.
function setPreview(min) {
  scrubMin = clampPreview(min);
  scrub.setValue(Math.min(SCRUB_MAX_MIN, scrubMin));
  syncValueText();
  lastKey = '';
}

function startPlay() {
  if (view !== 'jar') return;
  play = { start: perf() };
  setPreview(0);
}

// Stop the time-lapse and come back to now.
function stopPlay() {
  if (!play) return;
  play = null;
  setPreview(0);
}

// The day at cell `i` of the lifted jar's card: its early afternoon is
// previewed; today's cell, or the day already shown, returns to now.
function previewDay(i) {
  if (view !== 'jar') return false;
  const c = CITIES[focus];
  const today = localDate(nowMs(), c.location.zone);
  const row = upcomingRows(feed.get(c.id), today)[i];
  if (!row) return false;
  play = null;
  const min = row.date === today || i === selectedDay ? 0 : dayPreviewMin(nowMs(), row.date, c.location.zone);
  setPreview(min);
  return true;
}

function startShake() {
  if (view !== 'jar' || reduceMotion) return false;
  shake = { id: CITIES[focus].id, start: perf() };
  lastKey = '';
  return true;
}

function doLift(i) {
  if (i < 0 || i >= CITIES.length) return;
  focus = i;
  shelf.go(i);
  shelf.pos = shelf.target;
  view = 'jar';
  hint = hintOnLift(hint);
  play = null;
  shake = null;
  setScrub(0);
  lift.open(perf());
  setTitle();
  syncChrome();
  if (document.activeElement === canvas) {
    backBtn.focus();
  }
  lastKey = '';
}

function doLower() {
  if (view !== 'jar') return;
  view = 'table';
  play = null;
  setScrub(0);
  pendingBack = false;
  lift.close(perf());
  setTitle();
  if (document.activeElement === backBtn || scrubRow.contains(document.activeElement)) canvas.focus();
  syncChrome();
  lastKey = '';
}

function liftFromUser(i) {
  if (view === 'jar' || i < 0) return;
  doLift(i);
  history.pushState(entryFor('jar', CITIES[i].id, true), '', location.pathname + jarSearch(location.search, CITIES[i].id));
}

function lowerFromUser() {
  if (view !== 'jar' || pendingBack) return;
  if (leaveAction(history.state) === 'back') {
    pendingBack = true; // a second lower before popstate must not go back again
    history.back(); // popstate does the visual lowering
  } else {
    history.replaceState(entryFor('table'), '', location.pathname + tableSearch(location.search));
    doLower();
  }
}

window.addEventListener('popstate', (e) => {
  const s = e.state;
  if (s && s.lane === 'jar') {
    const i = CITIES.findIndex((c) => c.id === s.id);
    if (i >= 0) doLift(i);
  } else {
    doLower();
  }
});

window.addEventListener('keydown', (e) => {
  // The first Escape of a preview returns to now; the next puts the jar down.
  if (e.key === 'Escape') {
    if (play) stopPlay();
    else if (scrubMin > 0) setScrub(0);
    else lowerFromUser();
  }
});
canvas.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (view === 'jar') startShake();
    else liftFromUser(shelf.index);
  } else if (e.key === 'ArrowRight' && view === 'table') shelf.next();
  else if (e.key === 'ArrowLeft' && view === 'table') shelf.prev();
});
backBtn.addEventListener('click', lowerFromUser);
const scrub = new ScrubBar(scrubEl, document.getElementById('now'), { onChange: (min) => { play = null; setScrub(min); } });
const playBtn = document.getElementById('play');
// the button says what it does now at once, not on the next frame
playBtn.addEventListener('click', () => {
  if (play) stopPlay();
  else startPlay();
  syncChrome();
});
const scrubRow = scrubEl.parentElement;
document.getElementById('prev').addEventListener('click', () => shelf.prev());
document.getElementById('next').addEventListener('click', () => shelf.next());

// Pointer: a short press lifts the jar under it; a drag slides the row.
let press = null;
canvas.addEventListener('pointerdown', (e) => {
  if (view === 'jar') {
    if (e.button !== 0) return; // a right-click or a pen's barrel button is not a press
    // a press outside the lifted jar and its card puts the jar back, like Back
    if (lift.moving) return;
    // the band kept free for the slider row never lowers the jar
    if (!scrubRow.hidden && e.clientY >= scrubRow.getBoundingClientRect().top) return;
    const s = cssToScene(e.clientX, e.clientY);
    const what = liftedTarget(s);
    if (what.kind === 'jar') startShake(); // a press on the glass shakes it
    else if (what.kind === 'day') previewDay(what.index); // a press on a day previews it
    else if (what.kind === 'away') lowerFromUser();
    return;
  }
  if (view !== 'table') return;
  canvas.setPointerCapture(e.pointerId);
  press = { x: e.clientX, y: e.clientY, travel: 0, id: e.pointerId };
  // Dragged in scene units from the screen position alone, so the camera
  // following the row never feeds back into the measure.
  shelf.dragStart(e.clientX / cam.scale, e.timeStamp);
});
canvas.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  press.travel = Math.max(press.travel, Math.hypot(e.clientX - press.x, e.clientY - press.y));
  shelf.dragMove(e.clientX / cam.scale, e.timeStamp);
});
function release(e) {
  if (!press || e.pointerId !== press.id) return;
  const p = press;
  press = null;
  if (p.travel < 8) {
    shelf.dragEnd(0);
    const s = cssToScene(e.clientX, e.clientY);
    liftFromUser(shelf.hit(s.x, s.y));
  } else {
    shelf.dragEnd();
  }
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', (e) => {
  if (view === 'table' && CITIES.length > 1) {
    e.preventDefault();
    shelf.wheel(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
  }
}, { passive: false });

// What a scene point lands on while a jar is lifted: the jar, a day of its
// card, the rest of the card, or neither (`away`, which puts the jar back).
function liftedTarget(p) {
  const jar = risen(focus, liftRise(lift.progress(perf())));
  const card = lastForecast && lastForecast.rect;
  if (pressLowers(p, jar, card)) return { kind: 'away' };
  if (!pressLowers(p, jar, null)) return { kind: 'jar' };
  const cells = forecastCellRects(card, lastForecast.cells.length, lastForecast.layout, lastForecast.sun, lastForecast.tides);
  const index = cells.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  return index >= 0 && lastForecast.cells[index].day !== '—' ? { kind: 'day', index } : { kind: 'card' };
}

// A fine pointer over the page: the cursor says what a press would do, the jar
// under it catches the light, and the dioramas shift a little with where it is.
function pointAt(clientX, clientY) {
  const s = cssToScene(clientX, clientY);
  let hand = false;
  if (view === 'table') {
    hoverIdx = shelf.hit(s.x, s.y);
    hand = hoverIdx >= 0;
  } else {
    hoverIdx = -1;
    const what = lift.moving ? { kind: 'card' } : liftedTarget(s);
    hand = what.kind === 'day' || (what.kind === 'jar' && !reduceMotion);
  }
  const cursor = hand ? 'pointer' : '';
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
}
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
  pointAt(e.clientX, e.clientY);
  if (!AUTOMATED && !reduceMotion) parTarget = { x: Math.max(-1, Math.min(1, (e.clientX / W) * 2 - 1)), y: Math.max(-1, Math.min(1, (e.clientY / H) * 2 - 1)) };
});
canvas.addEventListener('pointerleave', () => {
  hoverIdx = -1;
  canvas.style.cursor = '';
  parTarget = { x: 0, y: 0 };
});
// A phone held in the hand: its lean does what the pointer does on a desk.
// (Where the browser asks leave before it reports the lean, none is asked for.)
if (coarsePointer && !AUTOMATED && !reduceMotion) {
  window.addEventListener('deviceorientation', (e) => {
    if (typeof e.gamma !== 'number' || typeof e.beta !== 'number') return;
    parTarget = { x: Math.max(-1, Math.min(1, e.gamma / 25)), y: Math.max(-1, Math.min(1, (e.beta - 50) / 25)) };
  });
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fit, 150);
});

function hashCanvas() {
  const d = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
  return h;
}

window.__jar = {
  // Preview the lifted jar `min` minutes ahead (snapped to the slider's step);
  // returns the clamped value. Only the lifted jar moves.
  scrub(min) {
    setScrub(min);
    render(true);
    return scrubMin;
  },
  get scrubMin() { return scrubMin; },
  // null at now, else the focused jar's previewed moment and weather.
  get preview() {
    if (view !== 'jar' || scrubMin === 0) return null;
    const c = CITIES[focus];
    const w = previewWeather(feed.get(c.id), previewMs(), c.location.zone);
    return { ms: previewMs(), offsetMin: scrubMin, kind: w.kind, temperature: w.temperature };
  },
  get ready() { return ready; },
  get view() { return view; },
  look: LOOK,
  get labels() { return labels; },
  get index() { return shelf.index; },
  get pos() { return shelf.pos; },
  get artBuilds() { return artBuilds; },
  get lastFrameMs() { return lastFrameMs; },
  get lifting() { return lift.moving; },
  lift: (id) => liftFromUser(CITIES.findIndex((c) => c.id === id)),
  lower: lowerFromUser,
  pin(ms) {
    pinned = ms;
    render(true);
  },
  hash() { return hashCanvas(); },
  // Hand the feed an answer now (the tidy body, or the vendor's { current } for
  // every city); dew is dated by the pinned moment when there is one.
  applyWeather(body, how = {}) {
    let b = body;
    if (b && typeof b === 'object' && b.current && typeof b.current === 'object') {
      const c = b.current;
      const entry = { temperature: c.temperature_2m, code: c.weather_code, cloudCover: c.cloud_cover, isDay: c.is_day, windSpeed: c.wind_speed_10m, windDir: c.wind_direction_10m };
      b = { v: 1, cities: Object.fromEntries(CITIES.map((city) => [city.id, entry])) };
    }
    const changed = feed.applyResponse(b);
    // taken at once unless the caller asks for the fade a live refresh gets
    noteFeed(perf(), !!(how && how.fade) && !reduceMotion);
    render(true);
    return changed;
  },
  // The seams for what the viewer sets going (still under automation otherwise).
  shake: () => { const ok = startShake(); render(true); return ok; },
  get shaking() { return !!shake && !!shakeAt(perf() - shake.start, reduceMotion); },
  intro() { intro = perf(); render(true); },
  get introLevels() { return intro === null ? null : introLevels(perf() - intro, CITIES.length); },
  parallax(x, y) { par = { x, y }; parTarget = { x, y }; render(true); },
  get hover() { return hoverIdx >= 0 ? CITIES[hoverIdx].id : null; },
  get cursor() { return canvas.style.cursor; },
  play: () => { startPlay(); },
  get playing() { return !!play; },
  previewDay: (i) => { const ok = previewDay(i); render(true); return ok; },
  get selectedDay() { return selectedDay; },
  get fading() { return Object.keys(fades); },
  light: (id) => lights[id] || null,
  get quality() { return quality; },
  get bleed() { return BLEED; },
  get cadenceMs() { return cadenceMs; },
  get cadence() { return { weather: weatherCadence, cities: cityCadences, room: roomCadence }; },
  scene: (id) => scenes[id] || null,
  drift: (id) => (drawn[id] ? drawn[id].drift : 0),
  moon: (id) => (drawn[id] ? drawn[id].moon : null),
  dew: (id) => (drawn[id] ? drawn[id].dew : 0),
  flash: (id) => (drawn[id] ? drawn[id].flash : 0),
  blankHash() {
    const blank = make(canvas.width, canvas.height);
    const d = new Uint32Array(blank.getContext('2d').getImageData(0, 0, blank.width, blank.height).data.buffer);
    let h = 2166136261;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
    return h;
  },
  // Canvas-pixel position of a scene point, and of a jar's foot.
  toCanvas(sx, sy) {
    const p = sceneToCss(sx, sy);
    return { x: p.x * dpr, y: p.y * dpr };
  },
  // Canvas-pixel position of a body-share point (bx of the width, by of the
  // body height) of jar `id`.
  bodyPx(id, bx, by) {
    const i = CITIES.findIndex((c) => c.id === id);
    const r = risen(i, i === focus ? liftRise(lift.progress(perf())) : 0);
    const body = bodyRect();
    return this.toCanvas(r.x + r.w * bx, r.y + r.h * ((body.y + by * body.h) / JAR.h));
  },
  foot(id) {
    const i = CITIES.findIndex((c) => c.id === id);
    const r = risen(i, i === focus ? liftRise(lift.progress(perf())) : 0);
    return this.toCanvas(r.x + r.w / 2, r.y + r.h);
  },
  // The rect of jar `id` in canvas px, like forecast.rect (test surface only).
  jarBox(id) {
    const i = CITIES.findIndex((c) => c.id === id);
    const r = risen(i, i === focus ? liftRise(lift.progress(perf())) : 0);
    const a = this.toCanvas(r.x, r.y);
    const b = this.toCanvas(r.x + r.w, r.y + r.h);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  },
  // The forecast card last drawn: null on the table, else { cells, rect, sun, sunT, tides, dayT } in canvas px.
  get forecast() {
    if (!lastForecast) return null;
    const r = lastForecast.rect;
    const a = this.toCanvas(r.x, r.y);
    const b = this.toCanvas(r.x + r.w, r.y + r.h);
    return { cells: lastForecast.cells, sun: lastForecast.sun, sunT: lastForecast.sunT, tides: lastForecast.tides, dayT: lastForecast.dayT, rect: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } };
  },
  // The chalk hint: null once gone, else { text, state, alpha, rect } with the lettering's box in canvas px.
  get hint() {
    if (hint === 'none') return null;
    const p = lift.progress(perf());
    const hp = hintPose(fitScreen(W, H, shelf.centreX).cx);
    const half = chalkWidth(ctx, hintText, hp.size) / 2;
    const a = this.toCanvas(hp.x - half, hp.y - hp.size / 2);
    const b = this.toCanvas(hp.x + half, hp.y + hp.size / 2);
    return { text: hintText, state: hint, alpha: hintAlpha(hint, p), rect: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } };
  },
  get dpr() { return dpr; },
  get ambient() { return lastShedAmbient; },
  get framing() { return fitScreen(W, H, shelf.centreX); },
};

fit();
feed.start();
// the opening moment, for a visitor arriving at the table
if (!reduceMotion && !AUTOMATED && !(opts.jar && CITIES.some((c) => c.id === opts.jar))) intro = perf();
if (opts.jar && CITIES.some((c) => c.id === opts.jar)) {
  const i = CITIES.findIndex((c) => c.id === opts.jar);
  hint = initialHint(true);
  history.replaceState(entryFor('jar', opts.jar, false), '', location.pathname + location.search);
  doLift(i);
  lift.snap(true);
} else {
  history.replaceState(entryFor('table'), '', location.pathname + location.search);
}
setTitle();
syncChrome();
render(true);
syncAria();
ready = true;
requestAnimationFrame(frame);
